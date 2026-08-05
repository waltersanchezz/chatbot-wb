import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversationSessionProjector } from '../../src/application/persistence/ConversationSessionProjector';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import type { PersistenceRepository } from '../../src/domain/ports/PersistenceRepository';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { ProjectingConversationRepository } from '../../src/infrastructure/persistence/ProjectingConversationRepository';
import { SQLiteChatConversationRepository } from '../../src/infrastructure/persistence/SQLiteChatConversationRepository';
import { SQLiteCustomerRepository } from '../../src/infrastructure/persistence/SQLiteCustomerRepository';
import { SQLiteInteractionRepository } from '../../src/infrastructure/persistence/SQLiteInteractionRepository';
import { SQLiteLeadRepository } from '../../src/infrastructure/persistence/SQLiteLeadRepository';
import { SQLitePersistenceRepository } from '../../src/infrastructure/persistence/SQLitePersistenceRepository';
import { resetCrmSqliteSharedMemory } from '../../src/infrastructure/persistence/crmSqlite';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';

const tmpDirs: string[] = [];

afterEach(() => {
  resetCrmSqliteSharedMemory();
  for (const dir of tmpDirs.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-proj-'));
  tmpDirs.push(dir);
  return path.join(dir, 'rodacenter.sqlite');
}

function buildKnowledge() {
  const apps = [
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['R2-LOG'] },
      fila: 1,
    }),
  ];
  const specs = new Map([
    ['R2-LOG', { ...spec('R2-LOG'), cca18C: 620 }],
  ]);
  return {
    knowledge: new FakeWillardBatteryKnowledge(apps, specs),
    rows: catalogRowsFromHits(apps),
  };
}

describe('R2 — proyección CRM → persisted_sessions', () => {
  it('C1/C4/C8: saludo post-save proyecta sesión con outbound y expiresAt CRM', async () => {
    const dbPath = tempDbPath();
    const logDir = path.join(path.dirname(dbPath), 'logs');
    const { knowledge, rows } = buildKnowledge();
    const persistence = new SQLitePersistenceRepository(dbPath, {
      defaultTtlMs: 60_000,
    });
    const { engine } = buildTestConversationEngine(knowledge, rows, {
      persistence,
      persistenceTtlMs: 60_000,
    });

    const crm = new SQLiteChatConversationRepository(dbPath);
    const conversations = new ProjectingConversationRepository(
      crm,
      persistence,
      new ConversationSessionProjector(),
    );

    const useCase = new HandleIncomingMessage(
      new SQLiteCustomerRepository(dbPath),
      conversations,
      new FileLogRepository(logDir),
      engine,
      new ConsoleMessagingProvider(),
      new LeadService(
        new SQLiteLeadRepository(dbPath),
        new NotificationService(),
        new SQLiteInteractionRepository(dbPath),
      ),
      120,
      new MetricsService(),
    );

    const phone = '573001112233';
    const externalId = `whatsapp:${phone}`;

    await useCase.execute({
      phone,
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: externalId,
      customerName: 'Ana Pérez',
      sendReply: true,
    });

    // C8: saludo materializa sesión (no delete por “sin progreso”)
    const session = persistence.load(externalId);
    expect(session).toBeTruthy();
    expect(session!.waId).toBe(externalId);
    expect(session!.conversationId).toBeTruthy();

    // C1: inbound + assistant
    const roles = session!.conversation.messages.map((m) => m.role);
    expect(roles).toContain('customer');
    expect(roles).toContain('assistant');
    expect(
      session!.conversation.messages.some((m) => m.role === 'assistant' && m.content.trim()),
    ).toBe(true);

    const named = session!.conversation.messages.find(
      (m) => m.metadata?.customerName === 'Ana Pérez',
    );
    expect(named).toBeTruthy();

    // C4
    const crmConv = await crm.findByExternalId(externalId);
    expect(crmConv).toBeTruthy();
    expect(session!.expiresAt).toBe(crmConv!.expiresAt.getTime());

    persistence.close();
  });

  it('C2: engine.process solo no escribe persisted_sessions', async () => {
    const dbPath = tempDbPath();
    const { knowledge, rows } = buildKnowledge();
    const persistence = new SQLitePersistenceRepository(dbPath);
    const { engine } = buildTestConversationEngine(knowledge, rows, {
      persistence,
    });

    const conv = {
      id: 'conv-engine-only',
      customerId: 'c1',
      channel: 'whatsapp' as const,
      externalId: 'whatsapp:573009990000',
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

    const result = await engine.process(conv, 'Hola');
    conv.context = result.context;

    expect(persistence.load(conv.externalId)).toBeNull();
    persistence.close();
  });

  it('C7: fallo de persistence.save no tumba el canal ni el CRM', async () => {
    const dbPath = tempDbPath();
    const logDir = path.join(path.dirname(dbPath), 'logs');
    const { knowledge, rows } = buildKnowledge();
    const realPersistence = new SQLitePersistenceRepository(dbPath);
    const { engine } = buildTestConversationEngine(knowledge, rows, {
      persistence: realPersistence,
    });

    const failingPersistence: PersistenceRepository = {
      save: vi.fn(() => {
        throw new Error('simulated projection failure');
      }),
      load: (waId) => realPersistence.load(waId),
      delete: (waId) => realPersistence.delete(waId),
      cleanupExpired: (now) => realPersistence.cleanupExpired(now),
      restoreConversation: (waId) => realPersistence.restoreConversation(waId),
      restoreMemory: (waId) => realPersistence.restoreMemory(waId),
    };

    const crm = new SQLiteChatConversationRepository(dbPath);
    const conversations = new ProjectingConversationRepository(
      crm,
      failingPersistence,
      new ConversationSessionProjector(),
    );

    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');

    const useCase = new HandleIncomingMessage(
      new SQLiteCustomerRepository(dbPath),
      conversations,
      new FileLogRepository(logDir),
      engine,
      messaging,
      new LeadService(
        new SQLiteLeadRepository(dbPath),
        new NotificationService(),
        new SQLiteInteractionRepository(dbPath),
      ),
      120,
      new MetricsService(),
    );

    const externalId = 'whatsapp:573001110001';
    const out = await useCase.execute({
      phone: '573001110001',
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: externalId,
      sendReply: true,
    });

    expect(out.reply.trim().length).toBeGreaterThan(0);
    expect(sendSpy).toHaveBeenCalled();
    expect(await crm.findByExternalId(externalId)).toBeTruthy();
    expect(failingPersistence.save).toHaveBeenCalled();
    // Proyección falló → no hay sesión usable en el store real
    expect(realPersistence.load(externalId)).toBeNull();

    realPersistence.close();
  });
});
