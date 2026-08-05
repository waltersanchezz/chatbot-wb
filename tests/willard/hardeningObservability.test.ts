import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { MetricsService } from '../../src/application/services/MetricsService';
import { LeadService } from '../../src/application/services/LeadService';
import { NotificationService } from '../../src/application/services/NotificationService';
import type { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { logger } from '../../src/infrastructure/logging/logger';
import { buildTurnLogFields } from '../../src/infrastructure/logging/turnContext';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import {
  FRIENDLY_ERROR_REPLY,
  tryCall,
} from '../../src/shared/result';
import { withTimeout, TimeoutError } from '../../src/shared/timeout';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import fs from 'fs';
import os from 'os';
import path from 'path';

function buildUseCase(opts?: {
  engine?: ConversationEngine;
  metrics?: MetricsService;
  timeouts?: {
    engineMs?: number;
    messagingMs?: number;
    persistenceMs?: number;
    crmMs?: number;
  };
  messaging?: ConsoleMessagingProvider;
}) {
  const apps = [
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['OBS-LOG'] },
    }),
  ];
  const specs = new Map<string, WillardReferenceSpec>([
    ['OBS-LOG', { ...spec('OBS-LOG'), cca18C: 620 }],
  ]);
  const { engine: defaultEngine } = buildTestConversationEngine(
    new FakeWillardBatteryKnowledge(apps, specs),
    catalogRowsFromHits(apps),
  );
  const metrics = opts?.metrics ?? new MetricsService();
  const messaging = opts?.messaging ?? new ConsoleMessagingProvider();
  const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'obs-'));

  const useCase = new HandleIncomingMessage(
    new InMemoryCustomerRepository(),
    new InMemoryConversationRepository(),
    new FileLogRepository(tmpLog),
    opts?.engine ?? defaultEngine,
    messaging,
    new LeadService(
      new InMemoryLeadRepository(),
      new NotificationService(),
      new InMemoryInteractionRepository(),
    ),
    120,
    metrics,
    {
      engineMs: opts?.timeouts?.engineMs ?? 8_000,
      messagingMs: opts?.timeouts?.messagingMs ?? 6_000,
      persistenceMs: opts?.timeouts?.persistenceMs ?? 3_000,
      crmMs: opts?.timeouts?.crmMs ?? 5_000,
    },
  );

  return { useCase, metrics, messaging };
}

describe('Hardening — timeouts', () => {
  it('withTimeout vence y devuelve error TIMEOUT sin lanzar', async () => {
    const outcome = await withTimeout(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200)),
      30,
      { service: 'Test', operation: 'slow' },
    );

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.code).toBe('TIMEOUT');
      expect(outcome.error.message).toMatch(/Timeout/i);
      expect(outcome.error.stack).toBeTruthy();
    }
  });

  it('withTimeout resuelve a tiempo', async () => {
    const outcome = await withTimeout(
      async () => 'ok',
      500,
      { service: 'Test', operation: 'fast' },
    );
    expect(outcome).toEqual({ ok: true, value: 'ok' });
  });

  it('engine lento → mensaje amable + métrica errors (no rompe canal)', async () => {
    const slowEngine = {
      batteryFlowMode: 'orchestrator' as const,
      process: vi.fn(
        () =>
          new Promise(() => {
            /* never resolves */
          }),
      ),
    };

    const { useCase, metrics } = buildUseCase({
      engine: slowEngine as unknown as ConversationEngine,
      timeouts: { engineMs: 40, messagingMs: 200, persistenceMs: 200, crmMs: 200 },
    });

    const out = await useCase.execute({
      phone: '+573001110010',
      text: 'batería',
      channel: 'whatsapp',
      sendReply: false,
      auditRequestId: 'req-timeout-1',
    });

    expect(out.reply).toBe(FRIENDLY_ERROR_REPLY);
    expect(out.needsHumanHandoff).toBe(true);
    expect(out.requestId).toBe('req-timeout-1');
    expect(metrics.get('errors')).toBeGreaterThanOrEqual(1);
  });
});

describe('Hardening — logging estructurado', () => {
  it('buildTurnLogFields incluye requestId, conversationId, waId, stage, intent, durationMs', () => {
    const fields = buildTurnLogFields({
      requestId: 'r1',
      conversationId: 'c1',
      waId: 'wamid.x',
      stage: 'collecting_vehicle',
      intent: 'baterias',
      durationMs: 12,
    });
    expect(fields).toEqual({
      requestId: 'r1',
      conversationId: 'c1',
      waId: 'wamid.x',
      stage: 'collecting_vehicle',
      intent: 'baterias',
      durationMs: 12,
    });
  });

  it('turn.completed se emite una sola vez por turno exitoso', async () => {
    const turnSpy = vi.spyOn(logger, 'turn');
    const infoSpy = vi.spyOn(logger, 'info');
    const { useCase } = buildUseCase();

    await useCase.execute({
      phone: '+573001110011',
      text: 'batería',
      channel: 'whatsapp',
      sendReply: false,
      inboundWamid: 'wamid.test.1',
      auditRequestId: 'req-log-1',
    });

    expect(turnSpy).toHaveBeenCalledTimes(1);
    expect(turnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-log-1',
        waId: 'wamid.test.1',
        intent: 'baterias',
        stage: expect.any(String),
        durationMs: expect.any(Number),
      }),
      expect.objectContaining({ ok: true }),
    );

    // Sin logs info duplicados de turn (solo logger.turn → write info turn.completed)
    const turnInfoCalls = infoSpy.mock.calls.filter(
      (c) => c[0] === 'turn.completed',
    );
    // logger.turn usa write('info'), no logger.info — verificar que turnSpy es la API única
    expect(turnInfoCalls.length).toBe(0);
  });
});

describe('Hardening — métricas', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    metrics = new MetricsService();
  });

  it('contador conversations_started y snapshot', () => {
    metrics.increment('conversations_started');
    metrics.increment('errors', 2);
    expect(metrics.snapshot()).toEqual({
      conversations_started: 1,
      recommendations_exact: 0,
      recommendations_similar: 0,
      recommendations_none: 0,
      handoff_to_advisor: 0,
      errors: 2,
    });
  });

  it('recordTurn: exact / similar / none / handoff', () => {
    const base = createEmptyContext();
    metrics.recordTurn({
      isNewConversation: true,
      previous: base,
      next: {
        ...base,
        salesFlow: {
          state: 'WAITING_CONFIRMATION',
          vehicle: {},
          hasRecommendation: true,
          leadScore: 50,
          readyForAdvisor: false,
          nextAction: 'ASK_INTEREST_AFTER_RECOMMENDATION',
          matchKind: 'exact',
        },
      },
      isError: false,
    });
    expect(metrics.get('conversations_started')).toBe(1);
    expect(metrics.get('recommendations_exact')).toBe(1);

    metrics.recordTurn({
      isNewConversation: false,
      previous: createEmptyContext(),
      next: {
        ...createEmptyContext(),
        salesFlow: {
          state: 'WAITING_CONFIRMATION',
          vehicle: {},
          hasRecommendation: true,
          leadScore: 40,
          readyForAdvisor: false,
          nextAction: 'ASK_INTEREST_AFTER_RECOMMENDATION',
          matchKind: 'similar',
        },
      },
      isError: false,
    });
    expect(metrics.get('recommendations_similar')).toBe(1);

    metrics.recordTurn({
      isNewConversation: false,
      previous: createEmptyContext(),
      next: {
        ...createEmptyContext(),
        stage: 'handoff',
        needsHumanHandoff: true,
        salesFlow: {
          state: 'READY_FOR_ADVISOR',
          vehicle: {},
          hasRecommendation: false,
          leadScore: 20,
          readyForAdvisor: true,
          nextAction: 'HANDOFF_TO_ADVISOR',
          matchKind: 'none',
        },
      },
      isError: false,
    });
    expect(metrics.get('recommendations_none')).toBe(1);
    expect(metrics.get('handoff_to_advisor')).toBe(1);
  });

  it('flujo canal incrementa conversations_started', async () => {
    const { useCase, metrics: m } = buildUseCase();
    await useCase.execute({
      phone: '+573001110012',
      text: 'batería',
      channel: 'whatsapp',
      sendReply: false,
    });
    expect(m.get('conversations_started')).toBe(1);
  });

  it('flujo completo exact incrementa recommendations_exact', async () => {
    const { useCase, metrics: m } = buildUseCase();
    const phone = '+573001110013';
    for (const text of ['batería', 'Logan 2013', 'sí', 'no']) {
      await useCase.execute({ phone, text, channel: 'whatsapp', sendReply: false });
    }
    expect(m.get('recommendations_exact')).toBeGreaterThanOrEqual(1);
  });
});

describe('Hardening — errores (regresión Result)', () => {
  it('tryCall captura y TimeoutError tipado', () => {
    const failed = tryCall(
      () => {
        throw new TimeoutError('S', 'op', 10);
      },
      { service: 'S', operation: 'op', code: 'TIMEOUT' },
    );
    expect(failed.ok).toBe(false);
    if (!failed.ok) {
      expect(failed.error.code).toBe('TIMEOUT');
    }
  });
});
