/**
 * Regresión: Hola → bateria debe avanzar el flujo Y disparar sendText.
 * También: recoveryOfferPending no debe tragar "bateria" ni silenciar outbound.
 */
import { describe, expect, it, vi } from 'vitest';
import { WaIdTurnQueue } from '../../src/application/concurrency/WaIdTurnQueue';
import { WaIdTurnSerializer } from '../../src/application/concurrency/WaIdTurnSerializer';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { WhatsAppCloudProvider } from '../../src/infrastructure/messaging/WhatsAppCloudProvider';
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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hola-bat-'));
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

function buildEngine(options?: { recoveryTtlMs?: number }) {
  const apps = buildApps();
  const specs = new Map<string, WillardReferenceSpec>([
    ['FAKE-LOG', { ...spec('FAKE-LOG'), cca18C: 620 }],
  ]);
  return buildTestConversationEngine(
    new FakeWillardBatteryKnowledge(apps, specs),
    catalogRowsFromHits(apps),
    options,
  );
}

function buildUseCase(messaging = new ConsoleMessagingProvider()) {
  const { engine } = buildEngine();
  const sendGate = new MemoryWhatsAppMessageIdempotency();
  const useCase = new HandleIncomingMessage(
    new InMemoryCustomerRepository(),
    new InMemoryConversationRepository(),
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
    sendGate,
  );
  return { useCase, messaging, engine };
}

describe('Hola → bateria — engine + outbound', () => {
  it('ConversationEngine: Hola → bateria avanza a ASK_VEHICLE', async () => {
    const { engine } = buildEngine();
    const conv = {
      id: 'c-hola-bat',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'whatsapp:573009990001',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    conv.messages.push({ role: 'customer', content: 'Hola' });
    const hola = await engine.process(conv as never, 'Hola');
    conv.context = hola.context;
    conv.messages.push({ role: 'assistant', content: hola.reply });

    expect(hola.context.stage).toBe('awaiting_category');
    expect(hola.reply.trim().length).toBeGreaterThan(0);

    conv.messages.push({ role: 'customer', content: 'bateria' });
    const bat = await engine.process(conv as never, 'bateria');

    expect(bat.context.category).toBe('baterias');
    expect(bat.context.intent).toBe('baterias');
    expect(bat.context.stage).toBe('collecting_vehicle');
    expect(bat.context.salesFlow?.nextAction).toBe('ASK_VEHICLE');
    expect(bat.reply.trim().length).toBeGreaterThan(0);
    expect(bat.context.recoveryOfferPending).toBeFalsy();
  });

  it('HandleIncomingMessage: Hola → bateria llama sendText dos veces', async () => {
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const { useCase } = buildUseCase(messaging);
    const phone = '573009990002';

    await useCase.execute({
      phone,
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: `whatsapp:${phone}`,
      sendReply: true,
      inboundWamid: 'wamid.HOLA_BAT_1',
    });

    const out = await useCase.execute({
      phone,
      text: 'bateria',
      channel: 'whatsapp',
      externalConversationId: `whatsapp:${phone}`,
      sendReply: true,
      inboundWamid: 'wamid.HOLA_BAT_2',
    });

    expect(sendSpy).toHaveBeenCalledTimes(2);
    const secondBody = String(sendSpy.mock.calls[1]![0].body ?? '');
    expect(secondBody.trim().length).toBeGreaterThan(0);
    expect(secondBody).toMatch(/vehículo|vehiculo|bater/i);
    expect(out.reply.trim().length).toBeGreaterThan(0);
  });

  it('recoveryOfferPending + bateria: no se queda atrapado; avanza y envía', async () => {
    const { engine } = buildEngine();
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const sendGate = new MemoryWhatsAppMessageIdempotency();
    const conversations = new InMemoryConversationRepository();
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
      sendGate,
    );

    const phone = '573009990003';
    const external = `whatsapp:${phone}`;

    // Flujo previo con progreso recuperable
    await useCase.execute({
      phone,
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.REC_1',
    });
    await useCase.execute({
      phone,
      text: 'Renault Logan',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.REC_2',
    });

    // Sesión “vacía” + saludo de retorno → oferta recovery
    const saved = await conversations.findByExternalId(external);
    expect(saved).toBeTruthy();
    saved!.context = createEmptyContext();
    saved!.messages = [];
    await conversations.save(saved!);

    await useCase.execute({
      phone,
      text: 'Hola otra vez',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.REC_3',
    });

    const afterOffer = await conversations.findByExternalId(external);
    expect(afterOffer!.context.recoveryOfferPending).toBe(true);

    const sendsBefore = sendSpy.mock.calls.length;

    const bat = await useCase.execute({
      phone,
      text: 'bateria',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.REC_4',
    });

    expect(bat.reply.trim().length).toBeGreaterThan(0);
    expect(bat.reply).not.toMatch(/continuar donde quedamos/i);
    expect(sendSpy.mock.calls.length).toBe(sendsBefore + 1);

    const final = await conversations.findByExternalId(external);
    expect(final!.context.category).toBe('baterias');
    expect(final!.context.intent).toBe('baterias');
    expect(final!.context.stage).toBe('collecting_vehicle');
    expect(final!.context.salesFlow?.nextAction).toBe('ASK_VEHICLE');
    expect(final!.context.recoveryOfferPending).toBeFalsy();
  });

  it('WhatsAppCloudProvider ok:false → HandleIncomingMessage no trata el envío como éxito silencioso', async () => {
    const cloud = new WhatsAppCloudProvider({
      accessToken: '',
      phoneNumberId: '',
      apiVersion: 'v21.0',
    });
    const sendSpy = vi.spyOn(cloud, 'sendText');
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { useCase } = buildUseCase(cloud as never);

    await useCase.execute({
      phone: '573009990004',
      text: 'bateria',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573009990004',
      sendReply: true,
      inboundWamid: 'wamid.CLOUD_FAIL_1',
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const providerResult = await sendSpy.mock.results[0]!.value;
    expect(providerResult.ok).toBe(false);

    const lines = consoleSpy.mock.calls.map((c) => String(c[0] ?? ''));
    expect(
      lines.some(
        (l) =>
          l.includes('TURN SEND FAIL') && l.includes('provider_ok_false'),
      ),
    ).toBe(true);
    expect(lines.some((l) => l.includes('TURN_SEND_OK'))).toBe(false);
    consoleSpy.mockRestore();
  });
});
