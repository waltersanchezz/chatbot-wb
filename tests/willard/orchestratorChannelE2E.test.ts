import { describe, expect, it, vi } from 'vitest';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { buildContainer } from '../../src/infrastructure/di/container';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * E2E: Webhook-equivalent use case → ConversationEngine → Orchestrator → CRM/Telegram gate.
 * Confirma que el flujo nuevo es el único camino de baterías en el canal.
 */
describe('E2E canal — ConversationOrchestrator oficial', () => {
  it('flujo completo WhatsApp → recomendación → lead CRM (closing)', async () => {
    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['E2E-LOG'] },
        fila: 1,
      }),
    ];
    const specs = new Map<string, WillardReferenceSpec>([
      ['E2E-LOG', { ...spec('E2E-LOG'), cca18C: 620 }],
    ]);
    const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
    const { engine, orchestrator, recommendationService } =
      buildTestConversationEngine(knowledge, catalogRowsFromHits(apps));

    expect(engine.batteryFlowMode).toBe('orchestrator');

    const recommendSpy = vi.spyOn(recommendationService, 'recommendByVehicle');
    const orchSpy = vi.spyOn(orchestrator, 'handle');

    const leads = new InMemoryLeadRepository();
    const notifications = new NotificationService();
    const telegramSpy = vi
      .spyOn(notifications, 'notifyNewLead')
      .mockResolvedValue(undefined);

    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-orch-'));
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');

    const useCase = new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      new InMemoryConversationRepository(),
      new FileLogRepository(tmpLog),
      engine,
      messaging,
      new LeadService(leads, notifications, new InMemoryInteractionRepository()),
      120,
      new MetricsService(),
    );

    const phone = '+573001112233';
    const turns = [
      'batería',
      'Logan 2013',
      'sí',
      'no', // planta
    ];

    let lastReply = '';
    for (const text of turns) {
      const out = await useCase.execute({
        phone,
        text,
        channel: 'whatsapp',
        sendReply: true,
      });
      lastReply = out.reply;
    }

    expect(recommendSpy).not.toHaveBeenCalled();
    expect(orchSpy.mock.calls.length).toBeGreaterThan(0);
    expect(lastReply).toMatch(/E2E-LOG|Referencia/i);
    expect(sendSpy).toHaveBeenCalled();

    // Lead CRM + Telegram gate (stage closing tras recomendación)
    const allLeads = await leads.list({});
    expect(allLeads.length).toBeGreaterThanOrEqual(1);
    expect(allLeads[0]!.vehicleBrand?.toUpperCase()).toMatch(/RENAULT/);
    expect(allLeads[0]!.recommendation).toBeTruthy();
    expect(telegramSpy).toHaveBeenCalled();
  });

  it('buildContainer: engine.batteryFlowMode es orchestrator (producción)', () => {
    const container = buildContainer();
    expect(container.engine.batteryFlowMode).toBe('orchestrator');
    expect(container.handleIncomingMessage).toBeTruthy();
  });

  it('confirmación del cliente → READY_FOR_ADVISOR / handoff sin RecommendationService', async () => {
    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['E2E-LOG'] },
      }),
    ];
    const specs = new Map<string, WillardReferenceSpec>([
      ['E2E-LOG', { ...spec('E2E-LOG'), cca18C: 620 }],
    ]);
    const { engine, recommendationService } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps, specs),
      catalogRowsFromHits(apps),
    );
    const spy = vi.spyOn(recommendationService, 'recommendByVehicle');

    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-acc-'));
    const useCase = new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      new InMemoryConversationRepository(),
      new FileLogRepository(tmpLog),
      engine,
      new ConsoleMessagingProvider(),
      new LeadService(
        new InMemoryLeadRepository(),
        new NotificationService(),
        new InMemoryInteractionRepository(),
      ),
      120,
      new MetricsService(),
    );

    const phone = '+573009998877';
    for (const text of ['batería', 'Logan 2013', 'sí', 'no']) {
      await useCase.execute({ phone, text, channel: 'whatsapp', sendReply: false });
    }
    const accepted = await useCase.execute({
      phone,
      text: 'sí',
      channel: 'whatsapp',
      sendReply: false,
    });

    expect(spy).not.toHaveBeenCalled();
    expect(accepted.needsHumanHandoff).toBe(true);
    expect(accepted.reply.length).toBeGreaterThan(10);
  });
});
