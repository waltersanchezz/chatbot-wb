import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { AnalyticsService } from '../../src/application/services/AnalyticsService';
import { PipelineService } from '../../src/application/services/PipelineService';
import { TenantService } from '../../src/application/services/TenantService';
import {
  createEmptyContext,
  type Conversation,
} from '../../src/domain/entities/Conversation';
import { buildPersistedSession } from '../../src/domain/persistence/persistedSession';
import {
  getActiveTenantId,
  runWithTenant,
} from '../../src/domain/tenant/TenantContext';
import { DEFAULT_TENANT_ID } from '../../src/domain/tenant/tenantDto';
import { SQLiteAnalyticsRepository } from '../../src/infrastructure/persistence/SQLiteAnalyticsRepository';
import { SQLiteLearningRepository } from '../../src/infrastructure/persistence/SQLiteLearningRepository';
import { SQLitePersistenceRepository } from '../../src/infrastructure/persistence/SQLitePersistenceRepository';
import { SQLitePipelineRepository } from '../../src/infrastructure/persistence/SQLitePipelineRepository';
import { SQLiteTenantRepository } from '../../src/infrastructure/persistence/SQLiteTenantRepository';

function minimalConversation(waId: string, id: string): Conversation {
  return {
    id,
    customerId: `cust-${waId}`,
    channel: 'whatsapp',
    externalId: waId,
    messages: [],
    context: createEmptyContext(),
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    expiresAt: new Date('2026-08-02T12:00:00.000Z'),
  };
}

describe('TenantContext', () => {
  it('usa rodacenter por defecto sin store ALS', () => {
    expect(getActiveTenantId()).toBe(DEFAULT_TENANT_ID);
  });

  it('propaga tenantId en runWithTenant', () => {
    runWithTenant('acme', () => {
      expect(getActiveTenantId()).toBe('acme');
    });
    expect(getActiveTenantId()).toBe(DEFAULT_TENANT_ID);
  });
});

describe('SQLiteTenantRepository / TenantService', () => {
  it('asegura tenant por defecto rodacenter', () => {
    const repo = new SQLiteTenantRepository(':memory:');
    const service = new TenantService(repo);
    const tenant = service.ensureDefault();
    expect(tenant.id).toBe('rodacenter');
    expect(tenant.name).toBe('Rodacenter');
    expect(tenant.active).toBe(true);
    expect(service.listActive().map((t) => t.id)).toContain('rodacenter');
    repo.close();
  });
});

describe('aislamiento multi-tenant SQLite', () => {
  it('filtra sessions y learning por tenantId', () => {
    const shared = path.join(
      os.tmpdir(),
      `tenant-iso-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    );

    const persistA = new SQLitePersistenceRepository(shared, {
      tenantId: 'tenant-a',
      defaultTtlMs: 3_600_000,
    });
    const persistB = new SQLitePersistenceRepository(shared, {
      tenantId: 'tenant-b',
      defaultTtlMs: 3_600_000,
    });
    const learnA = new SQLiteLearningRepository(shared, { tenantId: 'tenant-a' });
    const learnB = new SQLiteLearningRepository(shared, { tenantId: 'tenant-b' });

    const convA = minimalConversation('wa:shared', 'c-a');
    const convB = minimalConversation('wa:shared-b', 'c-b');

    persistA.save(
      buildPersistedSession({
        conversation: convA,
        context: {
          ...createEmptyContext(),
          vehicle: { brand: 'KIA', model: 'Rio' },
          salesFlow: {
            state: 'READY_FOR_ADVISOR',
            leadScore: 90,
            vehicle: { brand: 'KIA', model: 'Rio' },
            hasRecommendation: true,
            readyForAdvisor: true,
            nextAction: 'HANDOFF',
          } as never,
        },
        memory: null,
        ttlMs: 3_600_000,
      }),
    );
    persistB.save(
      buildPersistedSession({
        conversation: convB,
        context: {
          ...createEmptyContext(),
          vehicle: { brand: 'RENAULT', model: 'Logan' },
          salesFlow: {
            state: 'NEW',
            leadScore: 10,
            vehicle: { brand: 'RENAULT', model: 'Logan' },
            hasRecommendation: false,
            readyForAdvisor: false,
            nextAction: 'ASK_BRAND',
          } as never,
        },
        memory: null,
        ttlMs: 3_600_000,
      }),
    );

    expect(persistA.load('wa:shared')?.conversationId).toBe('c-a');
    expect(persistA.load('wa:shared-b')).toBeNull();
    expect(persistB.load('wa:shared-b')?.conversationId).toBe('c-b');
    expect(persistB.load('wa:shared')).toBeNull();

    learnA.record({
      conversationId: 'c-a',
      waId: 'wa:shared',
      brand: 'KIA',
      model: 'Rio',
      reference: 'REF-A',
      abandoned: false,
      durationMs: 1000,
      timestamp: Date.UTC(2026, 7, 1, 12),
      salesState: 'READY_FOR_ADVISOR',
    });
    learnB.record({
      conversationId: 'c-b',
      waId: 'wa:shared-b',
      brand: 'RENAULT',
      model: 'Logan',
      reference: 'REF-B',
      abandoned: false,
      durationMs: 2000,
      timestamp: Date.UTC(2026, 7, 1, 13),
      salesState: 'NEW',
    });

    expect(learnA.count()).toBe(1);
    expect(learnB.count()).toBe(1);
    expect(learnA.topReferences()[0]?.label).toBe('REF-A');
    expect(learnB.topReferences()[0]?.label).toBe('REF-B');

    const pipeA = new PipelineService(
      new SQLitePipelineRepository(shared, { tenantId: 'tenant-a' }),
    ).getPipeline();
    const pipeB = new PipelineService(
      new SQLitePipelineRepository(shared, { tenantId: 'tenant-b' }),
    ).getPipeline();
    expect(pipeA.totalCards).toBeGreaterThanOrEqual(1);
    expect(pipeB.totalCards).toBeGreaterThanOrEqual(1);
    expect(
      pipeA.columns.flatMap((c) => c.cards).every((c) => c.waId === 'wa:shared'),
    ).toBe(true);
    expect(
      pipeB.columns
        .flatMap((c) => c.cards)
        .every((c) => c.waId === 'wa:shared-b'),
    ).toBe(true);

    const analyticsA = new AnalyticsService(
      new SQLiteAnalyticsRepository(shared, { tenantId: 'tenant-a' }),
    ).getAnalytics();
    expect(analyticsA.leads.listosParaAsesor).toBeGreaterThanOrEqual(1);
    expect(analyticsA.topReferencias.some((r) => r.label === 'REF-A')).toBe(
      true,
    );
    expect(analyticsA.topReferencias.some((r) => r.label === 'REF-B')).toBe(
      false,
    );

    persistA.close();
    persistB.close();
    learnA.close();
    learnB.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });

  it('sin tenant fijo se comporta como rodacenter (compat)', () => {
    const repo = new SQLiteLearningRepository(':memory:');
    repo.record({
      conversationId: 'c-default',
      waId: 'wa:1',
      abandoned: false,
      durationMs: 1,
      timestamp: Date.now(),
    });
    expect(repo.count()).toBe(1);
    runWithTenant('other', () => {
      expect(repo.count()).toBe(0);
    });
    repo.close();
  });
});
