import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, afterEach } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import {
  buildPersistedSession,
  fromPersistedConversation,
  toPersistedConversation,
} from '../../src/domain/persistence/persistedSession';
import type { ConversationMemorySnapshot } from '../../src/domain/conversation/conversationMemory';
import { SQLitePersistenceRepository } from '../../src/infrastructure/persistence/SQLitePersistenceRepository';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';

function baseConversation(externalId = 'wa:+573001112233') {
  const context = createEmptyContext();
  context.category = 'baterias';
  context.intent = 'baterias';
  context.stage = 'collecting_vehicle';
  context.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
  context.lastRecommendedReference = 'FAKE-LOG';
  context.lastRecommendedReferences = ['FAKE-LOG', 'FAKE-LOG-B'];
  context.recommendedProductIds = ['willard:FAKE-LOG', 'willard:FAKE-LOG-B'];
  context.lastTechnicalQuestion = '¿Por qué esa batería?';
  context.lastTechnicalAnswer = 'Por CCA';
  context.salesFlow = {
    state: 'WAITING_CONFIRMATION',
    nextAction: 'ASK_INTEREST_AFTER_RECOMMENDATION',
    vehicle: {
      brand: 'RENAULT',
      model: 'Logan',
      year: '2015',
      vehicleConfirmed: true,
      soundSystem: false,
    },
    hasRecommendation: true,
    matchKind: 'exact',
    leadScore: 72,
    readyForAdvisor: false,
  };

  return {
    id: 'conv-1',
    customerId: 'cust-1',
    channel: 'whatsapp' as const,
    externalId,
    context,
    messages: [
      {
        id: 'm1',
        conversationId: 'conv-1',
        role: 'customer' as const,
        content: 'Renault Logan 2015',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:10:00.000Z'),
    expiresAt: new Date('2026-01-02T00:00:00.000Z'),
  };
}

function memoryFor(conversation: ReturnType<typeof baseConversation>): ConversationMemorySnapshot {
  return {
    memoryKey: conversation.externalId,
    customerId: conversation.customerId,
    savedAt: 1_000,
    expiresAt: 9e12,
    context: structuredClone(conversation.context),
    summary: {
      vehicleLabel: 'RENAULT Logan 2015',
      primaryReference: 'FAKE-LOG',
      references: ['FAKE-LOG', 'FAKE-LOG-B'],
      salesState: 'WAITING_CONFIRMATION',
      lastTechnicalQuestion: '¿Por qué esa batería?',
      lastTechnicalAnswer: 'Por CCA',
    },
  };
}

describe('SQLitePersistenceRepository', () => {
  const repos: SQLitePersistenceRepository[] = [];

  afterEach(() => {
    for (const r of repos) {
      try {
        r.close();
      } catch {
        /* already closed */
      }
    }
    repos.length = 0;
  });

  function openRepo(options?: { now?: () => number; ttl?: number }) {
    const repo = new SQLitePersistenceRepository(':memory:', {
      defaultTtlMs: options?.ttl ?? 60_000,
      now: options?.now,
    });
    repos.push(repo);
    return repo;
  }

  it('guarda y recupera conversación completa por waId', () => {
    const repo = openRepo();
    const conv = baseConversation();
    const session = buildPersistedSession({
      conversation: conv,
      memory: memoryFor(conv),
      ttlMs: 60_000,
      now: 10_000,
    });

    repo.save(session);
    const loaded = repo.load(conv.externalId);

    expect(loaded).toBeTruthy();
    expect(loaded!.waId).toBe(conv.externalId);
    expect(loaded!.leadScore).toBe(72);
    expect(loaded!.lastRecommendedReference).toBe('FAKE-LOG');
    expect(loaded!.lastRecommendedReferences).toEqual(['FAKE-LOG', 'FAKE-LOG-B']);
    expect(loaded!.lastVehicle).toEqual({
      brand: 'RENAULT',
      model: 'Logan',
      year: '2015',
    });
    expect(loaded!.lastTechnicalQuestion).toMatch(/por qué/i);
    expect(loaded!.salesFlow?.state).toBe('WAITING_CONFIRMATION');
    expect(loaded!.state).toBe('WAITING_CONFIRMATION');
    expect(loaded!.memory?.summary.primaryReference).toBe('FAKE-LOG');
    expect(loaded!.conversation.context.vehicle.model).toMatch(/Logan/i);
  });

  it('actualiza la misma waId (UPSERT)', () => {
    let now = 1_000;
    const repo = openRepo({ now: () => now });
    const conv = baseConversation();
    const first = buildPersistedSession({
      conversation: conv,
      ttlMs: 60_000,
      now: 1_000,
    });
    repo.save(first);

    conv.context.lastRecommendedReference = 'FAKE-LOG-B';
    conv.context.salesFlow = {
      ...conv.context.salesFlow!,
      leadScore: 90,
      state: 'READY_FOR_ADVISOR',
      readyForAdvisor: true,
      nextAction: 'HANDOFF_TO_ADVISOR',
    };
    now = 2_000;
    const second = buildPersistedSession({
      conversation: conv,
      ttlMs: 60_000,
      now: 2_000,
    });
    repo.save(second);

    const loaded = repo.load(conv.externalId)!;
    expect(loaded.leadScore).toBe(90);
    expect(loaded.lastRecommendedReference).toBe('FAKE-LOG-B');
    expect(loaded.state).toBe('READY_FOR_ADVISOR');
    expect(loaded.savedAt).toBe(1_000); // se conserva en UPSERT
    expect(loaded.updatedAt).toBe(2_000);
  });

  it('elimina por waId', () => {
    const repo = openRepo();
    const conv = baseConversation();
    repo.save(
      buildPersistedSession({ conversation: conv, ttlMs: 60_000, now: 1 }),
    );
    repo.delete(conv.externalId);
    expect(repo.load(conv.externalId)).toBeNull();
  });

  it('TTL: load de expirado retorna null y limpia', () => {
    let now = 1_000;
    const repo = openRepo({ now: () => now, ttl: 500 });
    const conv = baseConversation();
    repo.save(
      buildPersistedSession({
        conversation: conv,
        ttlMs: 500,
        now: 1_000,
      }),
    );
    expect(repo.load(conv.externalId)).toBeTruthy();
    now = 1_600;
    expect(repo.load(conv.externalId)).toBeNull();
  });

  it('cleanupExpired elimina varias filas vencidas', () => {
    let now = 10_000;
    const repo = openRepo({ now: () => now, ttl: 100 });
    const a = baseConversation('wa:a');
    const b = baseConversation('wa:b');
    const c = baseConversation('wa:c');
    repo.save(buildPersistedSession({ conversation: a, ttlMs: 100, now }));
    repo.save(buildPersistedSession({ conversation: b, ttlMs: 100, now }));
    repo.save(
      buildPersistedSession({ conversation: c, ttlMs: 50_000, now }),
    );

    now = 10_200;
    expect(repo.cleanupExpired()).toBe(2);
    expect(repo.load('wa:a')).toBeNull();
    expect(repo.load('wa:b')).toBeNull();
    expect(repo.load('wa:c')).toBeTruthy();
  });

  it('varias conversaciones aisladas por waId', () => {
    const repo = openRepo();
    const a = baseConversation('wa:user-a');
    const b = baseConversation('wa:user-b');
    a.context.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    b.context.vehicle = { brand: 'MAZDA', model: '2', year: '2020' };
    b.context.lastRecommendedReference = 'FAKE-M2';

    repo.save(buildPersistedSession({ conversation: a, ttlMs: 60_000, now: 1 }));
    repo.save(buildPersistedSession({ conversation: b, ttlMs: 60_000, now: 1 }));

    expect(repo.load('wa:user-a')!.lastVehicle.model).toMatch(/Logan/i);
    expect(repo.load('wa:user-b')!.lastRecommendedReference).toBe('FAKE-M2');
    expect(repo.load('wa:user-a')!.lastRecommendedReference).toBe('FAKE-LOG');
  });

  it('restoreConversation y restoreMemory', () => {
    const repo = openRepo();
    const conv = baseConversation();
    repo.save(
      buildPersistedSession({
        conversation: conv,
        memory: memoryFor(conv),
        ttlMs: 60_000,
        now: 1,
      }),
    );

    const restoredConv = repo.restoreConversation(conv.externalId);
    expect(restoredConv?.context.vehicle.brand).toBe('RENAULT');
    expect(restoredConv?.context.salesFlow?.leadScore).toBe(72);
    expect(restoredConv?.createdAt).toBeInstanceOf(Date);

    const restoredMem = repo.restoreMemory(conv.externalId);
    expect(restoredMem?.summary.references).toEqual(
      expect.arrayContaining(['FAKE-LOG', 'FAKE-LOG-B']),
    );
    expect(restoredMem?.context.lastTechnicalQuestion).toBeTruthy();
  });

  it('integridad: round-trip conversation mapper', () => {
    const conv = baseConversation();
    const persisted = toPersistedConversation(conv);
    const back = fromPersistedConversation(persisted);
    expect(back.id).toBe(conv.id);
    expect(back.context.salesFlow?.leadScore).toBe(72);
    expect(back.messages[0]?.content).toMatch(/Logan/);
    expect(back.createdAt.toISOString()).toBe(conv.createdAt.toISOString());
  });

  it('restoreConversation/Memory sin fila → null', () => {
    const repo = openRepo();
    expect(repo.restoreConversation('missing')).toBeNull();
    expect(repo.restoreMemory('missing')).toBeNull();
  });

  it('memory expirada en restoreMemory → null', () => {
    let now = 5_000;
    const repo = openRepo({ now: () => now });
    const conv = baseConversation();
    const mem = memoryFor(conv);
    mem.expiresAt = 4_000;
    repo.save(
      buildPersistedSession({
        conversation: conv,
        memory: mem,
        ttlMs: 60_000,
        now: 1_000,
      }),
    );
    expect(repo.restoreMemory(conv.externalId)).toBeNull();
    expect(repo.load(conv.externalId)?.conversation).toBeTruthy();
  });

  it('save sin salesFlow / sin memory es válido', () => {
    const repo = openRepo();
    const conv = baseConversation();
    conv.context.salesFlow = undefined;
    conv.context.lastRecommendedReference = undefined;
    conv.context.lastRecommendedReferences = undefined;
    const session = buildPersistedSession({
      conversation: conv,
      ttlMs: 60_000,
      now: 1,
    });
    expect(session.salesFlow).toBeNull();
    expect(session.state).toBe('collecting_vehicle');
    repo.save(session);
    const loaded = repo.load(conv.externalId)!;
    expect(loaded.salesFlow).toBeNull();
    expect(loaded.memory).toBeNull();
    expect(loaded.leadScore).toBeNull();
  });

  it('cleanup automático en save elimina expirados', () => {
    let now = 1_000;
    const repo = openRepo({ now: () => now, ttl: 100 });
    const old = baseConversation('wa:old');
    const neu = baseConversation('wa:new');
    repo.save(buildPersistedSession({ conversation: old, ttlMs: 100, now }));
    now = 1_200;
    repo.save(
      buildPersistedSession({ conversation: neu, ttlMs: 10_000, now }),
    );
    expect(repo.load('wa:old')).toBeNull();
    expect(repo.load('wa:new')).toBeTruthy();
  });

  it('archivo en disco habilita PRAGMA WAL sin romper', () => {
    const file = path.join(
      os.tmpdir(),
      `rodacenter-persist-${Date.now()}.sqlite`,
    );
    const repo = new SQLitePersistenceRepository(file, { defaultTtlMs: 60_000 });
    repos.push(repo);
    const conv = baseConversation('wa:file');
    repo.save(
      buildPersistedSession({ conversation: conv, ttlMs: 60_000, now: 1 }),
    );
    expect(repo.load('wa:file')?.waId).toBe('wa:file');
    repo.close();
    try {
      fs.unlinkSync(file);
      fs.unlinkSync(`${file}-wal`);
      fs.unlinkSync(`${file}-shm`);
    } catch {
      /* ignore */
    }
  });

  it('buildPersistedSession: recovery offer y mensajes incompletos', () => {
    const conv = baseConversation('wa:offer');
    conv.context.salesFlow = undefined;
    conv.context.stage = undefined as never;
    conv.context.recoveryOfferPending = true;
    conv.messages = [
      {
        id: '',
        conversationId: '',
        role: 'customer',
        content: 'hola',
        createdAt: new Date('invalid') as never,
      },
      {
        role: 'customer',
        content: 'x',
      } as never,
    ];
    const session = buildPersistedSession({
      conversation: conv,
      ttlMs: 1_000,
      now: 5,
    });
    expect(session.state).toBe('RECOVERY_OFFER');
    expect(session.messages ?? session.conversation.messages[0]?.createdAt).toBeTruthy();
    expect(session.conversation.messages[0]?.id).toMatch(/msg-/);
  });
});

describe('ConversationEngine ↔ PersistenceRepository', () => {
  it('R2: proyección post-turno permite restaurar tras sesión vacía', async () => {
    let now = 50_000;
    const persistence = new SQLitePersistenceRepository(':memory:', {
      defaultTtlMs: 60_000,
      now: () => now,
    });

    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['FAKE-LOG'] },
        fila: 1,
      }),
    ];
    const specs = new Map<string, WillardReferenceSpec>([
      ['FAKE-LOG', { ...spec('FAKE-LOG'), cca18C: 620 }],
    ]);
    const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
    const { engine } = buildTestConversationEngine(
      knowledge,
      catalogRowsFromHits(apps),
      { persistence, persistenceTtlMs: 60_000 },
    );

    const conv = {
      id: 'c-persist',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:persist-1',
      context: createEmptyContext(),
      messages: [] as Array<{
        id: string;
        conversationId: string;
        role: 'customer' | 'assistant';
        content: string;
        createdAt: Date;
      }>,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const { ConversationSessionProjector } = await import(
      '../../src/application/persistence/ConversationSessionProjector'
    );
    const projector = new ConversationSessionProjector();

    /** Simula write path R2: engine no escribe sessions; proyección tras “save” del documento. */
    async function say(msg: string) {
      const result = await engine.process(conv as never, msg);
      conv.context = result.context;
      conv.messages.push({
        id: `in-${conv.messages.length}`,
        conversationId: conv.id,
        role: 'customer',
        content: msg,
        createdAt: new Date(),
      });
      conv.messages.push({
        id: `out-${conv.messages.length}`,
        conversationId: conv.id,
        role: 'assistant',
        content: result.reply,
        createdAt: new Date(),
      });
      conv.updatedAt = new Date();
      persistence.save(projector.project({ conversation: conv as never, now }));
      return result;
    }

    await say('batería');
    await say('Renault Logan');
    await say('2015');

    // Motor solo no deja fila; la proyección R2 sí.
    const stored = persistence.load('wa:persist-1');
    expect(stored).toBeTruthy();
    expect(stored!.lastVehicle.brand?.toUpperCase()).toBe('RENAULT');
    expect(stored!.salesFlow).toBeTruthy();
    expect(stored!.conversation.messages.some((m) => m.role === 'assistant')).toBe(
      true,
    );

    // Simula reinicio: sesión vacía, misma waId — recovery vía load.
    conv.context = createEmptyContext();
    conv.messages = [];
    const restoredTurn = await say('Hola otra vez');
    expect(
      restoredTurn.reply.match(/continuar donde quedamos|Logan|Hola de nuevo/i),
    ).toBeTruthy();

    persistence.close();
  });
});
