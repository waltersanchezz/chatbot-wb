/**
 * Regresión: respuestas duplicadas / Hola mid-flow / 1 wamid → 1 sendText.
 */
import express from 'express';
import type { Server } from 'http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { WaIdTurnQueue } from '../../src/application/concurrency/WaIdTurnQueue';
import { WaIdTurnSerializer } from '../../src/application/concurrency/WaIdTurnSerializer';
import { welcomeMessage } from '../../src/application/flows/welcomeFlow';
import { handoffAlreadyActiveMessage } from '../../src/application/flows/handoffFlow';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { MemoryWhatsAppMessageIdempotency } from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { createWhatsAppRouter } from '../../src/presentation/http/routes/whatsappRoutes';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit } from './FakeWillardBatteryKnowledge';
import fs from 'fs';
import os from 'os';
import path from 'path';

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function buildApps() {
  return [
    hit({
      marca: 'CHEVROLET',
      modelo: 'Corsa Evolution',
      textoCatalogo: 'Corsa Evolution',
      refs: { willard: ['H-COR'] },
      anioDesde: 2000,
      anioHasta: 2020,
    }),
    hit({
      marca: 'MAZDA',
      modelo: '3',
      textoCatalogo: 'Mazda 3',
      refs: { willard: ['H-MZ3'] },
      anioDesde: 2010,
      anioHasta: 2020,
    }),
  ];
}

function buildStack() {
  const apps = buildApps();
  const { engine } = buildTestConversationEngine(
    new FakeWillardBatteryKnowledge(apps),
    catalogRowsFromHits(apps),
  );
  const messaging = new ConsoleMessagingProvider();
  const conversations = new InMemoryConversationRepository();
  const sendGate = new MemoryWhatsAppMessageIdempotency();
  const useCase = new HandleIncomingMessage(
    new InMemoryCustomerRepository(),
    conversations,
    new FileLogRepository(tmpDir('wa-dup-')),
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
  return { useCase, messaging, conversations, engine, sendGate, apps };
}

function askYearConv(nextAction: 'ASK_YEAR' | 'ASK_SOUND') {
  return {
    id: `c-${nextAction}`,
    customerId: 'u1',
    channel: 'whatsapp' as const,
    externalId: `wa:${nextAction}`,
    context: {
      ...createEmptyContext(),
      category: 'baterias' as const,
      intent: 'baterias' as const,
      stage: 'collecting_vehicle' as const,
      vehicle:
        nextAction === 'ASK_SOUND'
          ? { brand: 'KIA', model: 'Sportage', year: '2015' }
          : { brand: 'CHEVROLET', model: 'Corsa Evolution' },
      salesFlow: {
        state: 'IDENTIFYING_VEHICLE' as const,
        nextAction,
        vehicle:
          nextAction === 'ASK_SOUND'
            ? {
                brand: 'KIA',
                model: 'Sportage',
                year: '2015',
                vehicleConfirmed: true,
              }
            : { brand: 'CHEVROLET', model: 'Corsa Evolution' },
        hasRecommendation: false,
        leadScore: 40,
        readyForAdvisor: false,
      },
    },
    messages: [
      {
        id: 'm1',
        conversationId: `c-${nextAction}`,
        role: 'customer' as const,
        content: 'batería',
        createdAt: new Date(),
      },
      {
        id: 'm2',
        conversationId: `c-${nextAction}`,
        role: 'customer' as const,
        content: 'vehículo',
        createdAt: new Date(),
      },
    ],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

describe('WhatsApp duplicate reply fix — Part 6', () => {
  it('Hola en conversación nueva → welcome', async () => {
    const { engine } = buildStack();
    const conv = {
      id: 'c-new',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:new',
      context: createEmptyContext(),
      messages: [] as never[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };
    // process appends customer message; filter <=1 → welcome
    const r = await engine.process(conv as never, 'Hola');
    expect(r.reply).toBe(welcomeMessage('Rodacenter', 'Test AI'));
    expect(r.reply).toMatch(/Bienvenido/i);
  });

  it('Hola en ASK_YEAR → ACK corto', async () => {
    const { engine } = buildStack();
    const conv = askYearConv('ASK_YEAR');
    const r = await engine.process(conv as never, 'Hola');
    expect(r.reply).toBe('¡Hola nuevamente! 👋 Seguimos con tu recomendación.');
    expect(r.reply).not.toMatch(/¿De qué año|año es/i);
    expect(r.context.salesFlow?.nextAction).toBe('ASK_YEAR');
  });

  it('Hola en ASK_SOUND → ACK corto', async () => {
    const { engine } = buildStack();
    const conv = askYearConv('ASK_SOUND');
    const r = await engine.process(conv as never, 'Hola');
    expect(r.reply).toBe('¡Hola nuevamente! 👋 Seguimos con tu recomendación.');
    expect(r.reply).not.toMatch(/Última pregunta|planta de sonido/i);
    expect(r.context.salesFlow?.nextAction).toBe('ASK_SOUND');
  });

  it('ASK_SOUND + texto inválido → recordatorio corto (no prompt largo otra vez)', async () => {
    const { engine } = buildStack();
    const conv = askYearConv('ASK_SOUND');
    const r = await engine.process(conv as never, 'tal vez');
    expect(r.reply).toMatch(/Responde solo \*sí\* o \*no\*/i);
    expect(r.reply).not.toMatch(/Última pregunta para afinar/i);
    expect(r.context.salesFlow?.nextAction).toBe('ASK_SOUND');
  });

  it('Hola repetido 5 veces → no repite preguntas', async () => {
    const { engine } = buildStack();
    const conv = askYearConv('ASK_SOUND');
    for (let i = 0; i < 5; i++) {
      const r = await engine.process(conv as never, 'Hola');
      conv.context = r.context;
      expect(r.reply).toBe(
        '¡Hola nuevamente! 👋 Seguimos con tu recomendación.',
      );
      expect(r.reply).not.toMatch(/Última pregunta|planta de sonido/i);
      expect(r.context.salesFlow?.nextAction).toBe('ASK_SOUND');
    }
  });

  it('Hola, Mazda 3 2015 → flujo normal (no solo greeting)', async () => {
    const { engine } = buildStack();
    const conv = {
      id: 'c-hola-data',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:hola-data',
      context: {
        ...createEmptyContext(),
        category: 'baterias' as const,
        intent: 'baterias' as const,
        stage: 'collecting_vehicle' as const,
        salesFlow: {
          state: 'IDENTIFYING_VEHICLE' as const,
          nextAction: 'ASK_VEHICLE' as const,
          vehicle: {},
          hasRecommendation: false,
          leadScore: 10,
          readyForAdvisor: false,
        },
      },
      messages: [
        {
          id: 'm1',
          conversationId: 'c-hola-data',
          role: 'customer' as const,
          content: 'batería',
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };
    const r = await engine.process(conv as never, 'Hola, es un Mazda 3 2015');
    expect(r.reply).not.toMatch(/Hola nuevamente/i);
    expect(r.reply).not.toMatch(/Bienvenido a Rodacenter/i);
    expect(r.reply).not.toBe(welcomeMessage('Rodacenter', 'Test AI'));
  });

  it('2015 → flujo normal', async () => {
    const { useCase } = buildStack();
    const phone = '573001001001';
    const external = `whatsapp:${phone}`;
    await useCase.execute({
      phone,
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: false,
      inboundWamid: 'wamid.Y1',
    });
    await useCase.execute({
      phone,
      text: 'Chevrolet Corsa Evolution',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: false,
      inboundWamid: 'wamid.Y2',
    });
    const r = await useCase.execute({
      phone,
      text: '2015',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: false,
      inboundWamid: 'wamid.Y3',
    });
    expect(r.reply).not.toMatch(/¿Para qué vehículo/i);
    expect(r.reply).not.toMatch(/Hola nuevamente/i);
  });

  it('sí / no → flujo normal (no ACK de saludo)', async () => {
    const { engine } = buildStack();
    const conv = askYearConv('ASK_SOUND');
    const yes = await engine.process(conv as never, 'sí');
    expect(yes.reply).not.toMatch(/Hola nuevamente/i);
    expect(yes.context.salesFlow?.nextAction).not.toBe('ASK_SOUND');

    const convNo = askYearConv('ASK_SOUND');
    const no = await engine.process(convNo as never, 'no');
    expect(no.reply).not.toMatch(/Hola nuevamente/i);
    expect(no.context.salesFlow?.nextAction).not.toBe('ASK_SOUND');
  });

  it('Handoff + Hola → reabre con welcome (evita WhatsApp mudo por dedup)', async () => {
    const { engine } = buildStack();
    const conv = askYearConv('ASK_SOUND');
    conv.context.needsHumanHandoff = true;
    conv.context.stage = 'handoff';
    conv.context.handoffReason = 'Cliente aceptó la recomendación Willard';
    conv.context.salesFlow = {
      ...conv.context.salesFlow!,
      state: 'READY_FOR_ADVISOR',
      nextAction: 'HANDOFF_TO_ADVISOR',
      readyForAdvisor: true,
      hasRecommendation: true,
    };

    const r = await engine.process(conv as never, 'Hola');
    expect(r.reply).toMatch(/Bienvenido|baterías|Rodacenter/i);
    expect(r.context.needsHumanHandoff).toBe(false);
    expect(r.context.stage).toBe('awaiting_category');
    expect(r.reply).not.toBe(handoffAlreadyActiveMessage());
  });

  it('mismo wamid procesado dos veces → máximo un sendText', async () => {
    const { useCase, messaging, sendGate } = buildStack();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const input = {
      phone: '573009009009',
      text: 'batería',
      channel: 'whatsapp' as const,
      externalConversationId: 'whatsapp:573009009009',
      sendReply: true,
      inboundWamid: 'wamid.ONCE',
    };

    await useCase.execute(input);
    await useCase.execute(input);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendGate.claimOutbound('wamid.ONCE')).toBe(false);
  });

  it('dos mensajes diferentes del mismo wa_id → dos turnos secuenciales', async () => {
    const { useCase, messaging } = buildStack();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const phone = '573008008008';
    const external = `whatsapp:${phone}`;

    await useCase.execute({
      phone,
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.SEQ_A',
    });
    await useCase.execute({
      phone,
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.SEQ_B',
    });

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy.mock.calls[1]![0].body).toMatch(/Hola nuevamente/i);
  });

  it('save fallido → cero sendText', async () => {
    const { messaging, engine, sendGate } = buildStack();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const conversations = new InMemoryConversationRepository();
    vi.spyOn(conversations, 'save').mockRejectedValue(new Error('save boom'));

    const useCase = new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      conversations,
      new FileLogRepository(tmpDir('wa-save-fail-')),
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

    const out = await useCase.execute({
      phone: '573007007007',
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573007007007',
      sendReply: true,
      inboundWamid: 'wamid.SAVE_FAIL2',
    });
    expect(out.sendSkippedDueToPersistFailure).toBe(true);
    expect(sendSpy).toHaveBeenCalledTimes(0);
  });

  it('save exitoso → exactamente un sendText', async () => {
    const { useCase, messaging } = buildStack();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    await useCase.execute({
      phone: '573006006006',
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573006006006',
      sendReply: true,
      inboundWamid: 'wamid.SAVE_OK',
    });
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('retry del webhook del mismo wamid → cero respuestas adicionales', async () => {
    const { useCase, messaging } = buildStack();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const gate = new MemoryWhatsAppMessageIdempotency();
    const app = express();
    app.use(express.json());
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(useCase, 'test', gate),
    );

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const port = (server.address() as { port: number }).port;

    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                contacts: [{ wa_id: '573005005005', profile: { name: 'T' } }],
                messages: [
                  {
                    id: 'wamid.WEBHOOK_RETRY',
                    from: '573005005005',
                    type: 'text',
                    text: { body: 'batería' },
                    timestamp: '1',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const post = () =>
      fetch(`http://127.0.0.1:${port}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const r1 = await post();
    expect(r1.status).toBe(200);
    await new Promise((r) => setTimeout(r, 80));
    const r2 = await post();
    expect(r2.status).toBe(200);
    await new Promise((r) => setTimeout(r, 80));

    expect(sendSpy).toHaveBeenCalledTimes(1);

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('timeout/reintento de ejecución → no duplicar respuesta (claimOutbound)', async () => {
    const { useCase, messaging, sendGate } = buildStack();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const input = {
      phone: '573004004004',
      text: 'batería',
      channel: 'whatsapp' as const,
      externalConversationId: 'whatsapp:573004004004',
      sendReply: true,
      inboundWamid: 'wamid.RETRY_EXEC',
    };

    // Simula que el inbound claim se bypaseó (reintento de execute):
    await useCase.execute(input);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendGate.claimOutbound('wamid.RETRY_EXEC')).toBe(false);

    await useCase.execute(input);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});

afterAll(() => {
  // nothing
});
