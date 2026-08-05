import { describe, expect, it, vi } from 'vitest';
import { LeadService } from '../../src/application/services/LeadService';
import type { NotificationService } from '../../src/application/services/NotificationService';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import type { Conversation } from '../../src/domain/entities/Conversation';
import {
  assertProductionReady,
} from '../../src/infrastructure/config/productionGuard';
import { WhatsAppCloudProvider } from '../../src/infrastructure/messaging/WhatsAppCloudProvider';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { buildContainer } from '../../src/infrastructure/di/container';

/**
 * Certificación de producción — evidencia automatizada de P0 cerrados.
 */
describe('Production certification — fail-fast canal real', () => {
  const ready = {
    nodeEnv: 'production' as const,
    jwtSecret: 'a'.repeat(40),
    sqlitePath: '/var/data/rodacenter.sqlite',
    auth: { adminPassword: 'StrongPass!2026', required: true },
    whatsapp: {
      appSecret: 'meta-secret',
      verifyToken: 'custom-verify-token',
      accessToken: 'EAAG-token',
      phoneNumberId: '10999001',
    },
    telegram: { botToken: '1:AA', chatId: '42' },
  };

  it('producción lista exige WA Cloud + Telegram + disco + auth', () => {
    expect(() => assertProductionReady(ready as never)).not.toThrow();
  });

  it('WhatsAppCloudProvider no reporta ok sin credenciales', async () => {
    const provider = new WhatsAppCloudProvider({
      accessToken: '',
      phoneNumberId: '',
      apiVersion: 'v21.0',
    });
    const result = await provider.sendText({
      to: '573001112233',
      body: 'hola',
      channel: 'whatsapp',
    });
    expect(result.ok).toBe(false);
  });
});

describe('Production certification — handoff no silencioso', () => {
  it('registerFromConversation crea lead en handoff sin categoría', async () => {
    const notify = vi.fn(async () => true);
    const service = new LeadService(
      new InMemoryLeadRepository(),
      { notifyNewLead: notify } as unknown as NotificationService,
    );

    const context = createEmptyContext();
    context.stage = 'handoff';
    context.needsHumanHandoff = true;
    context.handoffReason = 'Cliente pidió asesor';

    const conversation: Conversation = {
      id: 'conv-cert-1',
      customerId: 'cust-cert',
      channel: 'whatsapp',
      externalId: 'wa:cert',
      context,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const lead = await service.registerFromConversation({
      conversation,
      phone: '573001112233',
      customerId: 'cust-cert',
      assistantReply: 'Un asesor te contactará',
    });

    expect(lead).not.toBeNull();
    expect(lead!.needsHumanHandoff).toBe(true);
    expect(notify).toHaveBeenCalled();
  });
});

describe('Production certification — DI Willard', () => {
  it('buildContainer usa orchestrator (baterías) y CRM SQLite', async () => {
    const { SQLiteCustomerRepository } = await import(
      '../../src/infrastructure/persistence/SQLiteCustomerRepository'
    );
    const { SQLiteLeadRepository } = await import(
      '../../src/infrastructure/persistence/SQLiteLeadRepository'
    );
    const c = buildContainer();
    expect(c.engine.batteryFlowMode).toBe('orchestrator');
    expect(c.customers).toBeInstanceOf(SQLiteCustomerRepository);
    expect(c.leadRepository).toBeInstanceOf(SQLiteLeadRepository);
  });
});
