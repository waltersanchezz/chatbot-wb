/**
 * Regresión WhatsApp: "Bateria" mid-flow (p.ej. ASK_MODEL de "Prueba 123")
 * no debe silenciarse. El dedup reemitía el mismo prompt y no enviaba.
 */
import { describe, expect, it, vi } from 'vitest';
import { WaIdTurnQueue } from '../../src/application/concurrency/WaIdTurnQueue';
import { WaIdTurnSerializer } from '../../src/application/concurrency/WaIdTurnSerializer';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { MemoryWhatsAppMessageIdempotency } from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bare-bat-'));
}

function buildApps() {
  return [
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['FAKE-LOG'] },
      fila: 1,
    }),
  ];
}

function buildStack() {
  const apps = buildApps();
  const specs = new Map<string, WillardReferenceSpec>([
    ['FAKE-LOG', { ...spec('FAKE-LOG'), cca18C: 620 }],
  ]);
  const { engine } = buildTestConversationEngine(
    new FakeWillardBatteryKnowledge(apps, specs),
    catalogRowsFromHits(apps),
  );
  const messaging = new ConsoleMessagingProvider();
  const conversations = new InMemoryConversationRepository();
  const sendSpy = vi.spyOn(messaging, 'sendText');
  const useCase = new HandleIncomingMessage(
    new InMemoryCustomerRepository(),
    conversations,
    new FileLogRepository(tmpDir()),
    engine,
    messaging,
    new LeadService(
      new InMemoryLeadRepository(),
      new NotificationService(),
      new InMemoryInteractionRepository(),
    ),
    120,
    new MetricsService(),
    { persistenceMs: 3_000 },
    new WaIdTurnSerializer(new WaIdTurnQueue()),
    new MemoryWhatsAppMessageIdempotency(),
  );
  return { useCase, sendSpy, conversations };
}

describe('Bare "Bateria" mid-flow must send a new reply', () => {
  it('ASK_MODEL (Prueba 123) + Bateria → sendText con ASK_VEHICLE, no silencio', async () => {
    const { useCase, sendSpy, conversations } = buildStack();
    const phone = '573009991111';
    const external = `whatsapp:${phone}`;

    await useCase.execute({
      phone,
      text: 'bateria',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.MID_1',
    });
    await useCase.execute({
      phone,
      text: 'Prueba 123',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.MID_2',
    });

    const before = await conversations.findByExternalId(external);
    expect(before!.context.salesFlow?.nextAction).toBe('ASK_MODEL');
    const sendsBefore = sendSpy.mock.calls.length;

    const out = await useCase.execute({
      phone,
      text: 'Bateria',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.MID_3',
    });

    expect(out.reply.trim().length).toBeGreaterThan(0);
    expect(out.reply).toMatch(/vehículo|vehiculo/i);
    expect(out.reply).not.toMatch(/Prueba 123/i);
    expect(sendSpy.mock.calls.length).toBe(sendsBefore + 1);

    const after = await conversations.findByExternalId(external);
    expect(after!.context.category).toBe('baterias');
    expect(after!.context.stage).toBe('collecting_vehicle');
    expect(after!.context.salesFlow?.nextAction).toBe('ASK_VEHICLE');
    expect(after!.context.vehicle.brand).toBeFalsy();
  });

  it('Hola → bateria sigue pidiendo vehículo y enviando', async () => {
    const { useCase, sendSpy } = buildStack();
    const phone = '573009991112';

    await useCase.execute({
      phone,
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: `whatsapp:${phone}`,
      sendReply: true,
      inboundWamid: 'wamid.HB_1',
    });
    const out = await useCase.execute({
      phone,
      text: 'bateria',
      channel: 'whatsapp',
      externalConversationId: `whatsapp:${phone}`,
      sendReply: true,
      inboundWamid: 'wamid.HB_2',
    });

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(out.reply).toMatch(/vehículo|vehiculo/i);
  });
});
