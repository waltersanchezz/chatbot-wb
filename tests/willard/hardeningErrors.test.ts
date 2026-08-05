import { describe, expect, it, vi } from 'vitest';
import { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import {
  FRIENDLY_ERROR_REPLY,
  err,
  ok,
  tryCall,
  toControlledError,
} from '../../src/shared/result';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit } from './FakeWillardBatteryKnowledge';
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('Hardening — Result<T> y errores controlados', () => {
  it('ok / err / tryCall capturan excepciones', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    const failure = err(
      toControlledError(new Error('boom'), {
        service: 'Test',
        operation: 'x',
      }),
    );
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.message).toBe('boom');
      expect(failure.error.stack).toBeTruthy();
    }

    const caught = tryCall(
      () => {
        throw new Error('sync-fail');
      },
      { service: 'Test', operation: 'tryCall' },
    );
    expect(caught.ok).toBe(false);
    if (!caught.ok) {
      expect(caught.error.stack).toMatch(/sync-fail|Error/);
    }
  });

  it('ConversationEngine: excepción del orquestador → mensaje amable, no throw', async () => {
    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['H-LOG'] },
      }),
    ];
    const { engine, orchestrator } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

    vi.spyOn(orchestrator, 'handle').mockImplementation(() => {
      throw new Error('orchestrator exploded');
    });

    const conv = {
      id: 'c-hard',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:hard',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const result = await engine.process(conv as never, 'batería');

    expect(result.reply).toBe(FRIENDLY_ERROR_REPLY);
    expect(result.context.needsHumanHandoff).toBe(true);
    expect(result.reply).not.toMatch(/orchestrator exploded|stack/i);
  });

  it('HandleIncomingMessage: fallo interno → no relanza; usuario recibe mensaje amable', async () => {
    const explodingEngine = {
      batteryFlowMode: 'orchestrator' as const,
      process: vi.fn(async () => {
        throw new Error('engine hard fail');
      }),
    };

    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');

    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-'));
    const useCase = new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      new InMemoryConversationRepository(),
      new FileLogRepository(tmpLog),
      explodingEngine as unknown as ConversationEngine,
      messaging,
      new LeadService(
        new InMemoryLeadRepository(),
        new NotificationService(),
        new InMemoryInteractionRepository(),
      ),
      120,
      new MetricsService(),
    );

    const out = await useCase.execute({
      phone: '+573001110000',
      text: 'hola',
      channel: 'whatsapp',
      sendReply: true,
    });

    expect(out.reply).toBe(FRIENDLY_ERROR_REPLY);
    expect(out.needsHumanHandoff).toBe(true);
    expect(out.conversationId).not.toBe('unknown');
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({ body: FRIENDLY_ERROR_REPLY }),
    );
  });

  it('HandleIncomingMessage: fallo de WhatsApp sendText no tumba el turno', async () => {
    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['H-LOG'] },
      }),
    ];
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

    const messaging = new ConsoleMessagingProvider();
    vi.spyOn(messaging, 'sendText').mockRejectedValue(new Error('Graph 500'));

    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'hard-wa-'));
    const useCase = new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      new InMemoryConversationRepository(),
      new FileLogRepository(tmpLog),
      engine,
      messaging,
      new LeadService(
        new InMemoryLeadRepository(),
        new NotificationService(),
        new InMemoryInteractionRepository(),
      ),
      120,
      new MetricsService(),
    );

    const out = await useCase.execute({
      phone: '+573001110001',
      text: 'batería',
      channel: 'whatsapp',
      sendReply: true,
    });

    expect(out.reply).toMatch(/vehículo|batería/i);
    expect(out.reply).not.toBe(FRIENDLY_ERROR_REPLY);
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('flujo normal sigue intacto tras hardening', async () => {
    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['H-LOG'] },
      }),
    ];
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

    const conv = {
      id: 'c-ok',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:ok',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const result = await engine.process(conv as never, 'batería');
    expect(result.reply).toContain('¿Para qué vehículo');
    expect(result.reply).not.toBe(FRIENDLY_ERROR_REPLY);
  });
});
