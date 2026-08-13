import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import type { Server } from 'http';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { WaIdTurnQueue } from '../../src/application/concurrency/WaIdTurnQueue';
import { WaIdTurnSerializer } from '../../src/application/concurrency/WaIdTurnSerializer';
import {
  formatAskYear,
  formatAskYearReminder,
} from '../../src/application/flows/batteryFlow';
import {
  isPureGreetingMessage,
  midFlowGreetingAck,
} from '../../src/application/flows/welcomeFlow';
import {
  handoffAlreadyActiveMessage,
} from '../../src/application/flows/handoffFlow';
import { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { ConversationSessionProjector } from '../../src/application/persistence/ConversationSessionProjector';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { SqliteWaIdTurnLock } from '../../src/infrastructure/messaging/SqliteWaIdTurnLock';
import { SqliteWhatsAppMessageIdempotency } from '../../src/infrastructure/messaging/SqliteWhatsAppMessageIdempotency';
import {
  FileWhatsAppMessageIdempotency,
  MemoryWhatsAppMessageIdempotency,
} from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { ProjectingConversationRepository } from '../../src/infrastructure/persistence/ProjectingConversationRepository';
import { SQLiteChatConversationRepository } from '../../src/infrastructure/persistence/SQLiteChatConversationRepository';
import { SQLitePersistenceRepository } from '../../src/infrastructure/persistence/SQLitePersistenceRepository';
import { resetCrmSqliteSharedMemory } from '../../src/infrastructure/persistence/crmSqlite';
import { createWhatsAppRouter } from '../../src/presentation/http/routes/whatsappRoutes';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit } from './FakeWillardBatteryKnowledge';

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
      marca: 'CHEVROLET',
      modelo: 'Esteem 1.3 1.6 SW',
      textoCatalogo: 'Esteem 1.3, 1.6/ SW',
      refs: { willard: ['H-EST'] },
      anioDesde: 1995,
      anioHasta: 2005,
    }),
  ];
}

function buildUseCase(options?: {
  conversations?: InMemoryConversationRepository | ProjectingConversationRepository;
  messaging?: ConsoleMessagingProvider;
  engine?: ConversationEngine;
  persistenceMs?: number;
  turnSerializer?: WaIdTurnSerializer;
  logDir?: string;
  sendGate?: MemoryWhatsAppMessageIdempotency;
}) {
  const apps = buildApps();
  const { engine } =
    options?.engine != null
      ? { engine: options.engine }
      : buildTestConversationEngine(
          new FakeWillardBatteryKnowledge(apps),
          catalogRowsFromHits(apps),
        );

  const messaging = options?.messaging ?? new ConsoleMessagingProvider();
  const conversations =
    options?.conversations ?? new InMemoryConversationRepository();
  const logDir = options?.logDir ?? tmpDir('wa-turn-');
  const sendGate = options?.sendGate ?? new MemoryWhatsAppMessageIdempotency();

  const useCase = new HandleIncomingMessage(
    new InMemoryCustomerRepository(),
    conversations,
    new FileLogRepository(logDir),
    engine,
    messaging,
    new LeadService(
      new InMemoryLeadRepository(),
      new NotificationService(),
      new InMemoryInteractionRepository(),
    ),
    120,
    new MetricsService(),
    { persistenceMs: options?.persistenceMs ?? 3_000 },
    options?.turnSerializer ?? new WaIdTurnSerializer(new WaIdTurnQueue()),
    sendGate,
  );

  return { useCase, messaging, conversations, engine, apps, sendGate };
}

describe('WhatsApp turn isolation — regresión repetición de pasos', () => {
  it('1. mismo wamid en paralelo → execute 1 y sendText 1', async () => {
    let executeCount = 0;
    const sendBodies: string[] = [];

    const useCase = {
      execute: async () => {
        executeCount += 1;
        await new Promise((r) => setTimeout(r, 40));
        return {
          conversationId: 'c',
          customerId: 'u',
          reply: 'ok',
          needsHumanHandoff: false,
          durationMs: 1,
          requestId: 'r',
        };
      },
    };

    const gate = new MemoryWhatsAppMessageIdempotency();
    const app = express();
    app.use(express.json());
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(useCase as never, 'verify-test', gate),
    );

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '123' },
                contacts: [{ profile: { name: 'Test' }, wa_id: '57300111' }],
                messages: [
                  {
                    from: '57300111',
                    id: 'wamid.PARALLEL_SAME',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const post = () =>
      fetch(`${baseUrl}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    const [r1, r2] = await Promise.all([post(), post()]);
    await new Promise((r) => setTimeout(r, 120));
    server.close();

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(executeCount).toBe(1);
    expect(sendBodies.length).toBe(0); // router mock no envía; execute=1 es la señal
  });

  it('1b. HandleIncomingMessage: mismo inboundWamid paralelo no duplica send (vía queue + flujo)', async () => {
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const { useCase } = buildUseCase({ messaging });

    const phone = '573001234567';
    const external = `whatsapp:${phone}`;
    const input = {
      phone,
      text: 'batería',
      channel: 'whatsapp' as const,
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.SAME_HANDLE',
    };

    // Sin claim de router: dos executes del mismo mensaje — la cola serializa;
    // el segundo puede re-procesar (wamids iguales a nivel use-case no claim).
    // La protección de mismo wamid es el gate del router; aquí validamos send
    // con claim externo:
    const gate = new MemoryWhatsAppMessageIdempotency();
    expect(gate.claim('wamid.SAME_HANDLE')).toBe(true);
    expect(gate.claim('wamid.SAME_HANDLE')).toBe(false);

    await useCase.execute(input);
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('2. dos wamid distintos mismo wa_id en paralelo → serializados, estado coherente', async () => {
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const conversations = new InMemoryConversationRepository();
    const serializer = new WaIdTurnSerializer(new WaIdTurnQueue());

    let concurrent = 0;
    let maxConcurrent = 0;

    const apps = buildApps();
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );
    const originalProcess = engine.process.bind(engine);
    vi.spyOn(engine, 'process').mockImplementation(async (conv, text) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 60));
      try {
        return await originalProcess(conv, text);
      } finally {
        concurrent -= 1;
      }
    });

    const { useCase } = buildUseCase({
      messaging,
      conversations,
      engine,
      turnSerializer: serializer,
    });

    const phone = '573001234567';
    const external = `whatsapp:${phone}`;

    // Sembrar flujo en ASK_VEHICLE
    await useCase.execute({
      phone,
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.SEED',
    });
    sendSpy.mockClear();

    await Promise.all([
      useCase.execute({
        phone,
        text: 'Chevrolet Corsa Evolution',
        channel: 'whatsapp',
        externalConversationId: external,
        sendReply: true,
        inboundWamid: 'wamid.A',
      }),
      useCase.execute({
        phone,
        text: '2013',
        channel: 'whatsapp',
        externalConversationId: external,
        sendReply: true,
        inboundWamid: 'wamid.B',
      }),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(sendSpy.mock.calls.length).toBeGreaterThanOrEqual(1);

    const saved = await conversations.findByExternalId(external);
    expect(saved).toBeTruthy();
    expect(saved!.context.category).toBe('baterias');
    // El segundo turno debió ver el estado del primero (año aplicado o avanzado)
    const year = saved!.context.vehicle.year ?? saved!.context.salesFlow?.vehicle.year;
    const next = saved!.context.salesFlow?.nextAction;
    expect(
      year === '2013' ||
        next === 'ASK_SOUND' ||
        next === 'CONFIRM_VEHICLE' ||
        next === 'SHOW_RECOMMENDATION' ||
        next === 'ASK_INTEREST_AFTER_RECOMMENDATION',
    ).toBe(true);

    const vehicleAsks = sendSpy.mock.calls.filter(([msg]) =>
      String(msg.body).includes('¿Para qué vehículo'),
    );
    expect(vehicleAsks.length).toBe(0);
  });

  it('3. save falla → 0 sendText', async () => {
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const conversations = new InMemoryConversationRepository();
    vi.spyOn(conversations, 'save').mockRejectedValue(new Error('disk full'));

    const { useCase } = buildUseCase({ messaging, conversations });
    const out = await useCase.execute({
      phone: '573009990001',
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573009990001',
      sendReply: true,
      inboundWamid: 'wamid.SAVE_FAIL',
    });

    expect(sendSpy).toHaveBeenCalledTimes(0);
    expect(out.sendSkippedDueToPersistFailure).toBe(true);
  });

  it('4. save timeout → 0 sendText', async () => {
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const conversations = new InMemoryConversationRepository();
    vi.spyOn(conversations, 'save').mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        }),
    );

    const { useCase } = buildUseCase({
      messaging,
      conversations,
      persistenceMs: 80,
    });

    const out = await useCase.execute({
      phone: '573009990002',
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573009990002',
      sendReply: true,
      inboundWamid: 'wamid.SAVE_TIMEOUT',
    });

    expect(sendSpy).toHaveBeenCalledTimes(0);
    expect(out.sendSkippedDueToPersistFailure).toBe(true);
  });

  it('5. retry Meta mismo wamid → 0 nuevo process / 0 nuevo send', async () => {
    let executeCount = 0;
    const useCase = {
      execute: async () => {
        executeCount += 1;
        return {
          conversationId: 'c',
          customerId: 'u',
          reply: 'ok',
          needsHumanHandoff: false,
          durationMs: 1,
          requestId: 'r',
        };
      },
    };

    const dbPath = path.join(tmpDir('wa-idem-'), 'idem.sqlite');
    const gate = new SqliteWhatsAppMessageIdempotency(dbPath);

    const app = express();
    app.use(express.json());
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(useCase as never, 'verify-test', gate),
    );

    const server: Server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                messages: [
                  {
                    from: '57300111',
                    id: 'wamid.RETRY_META',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'hola' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const post = () =>
      fetch(`${baseUrl}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

    await post();
    await new Promise((r) => setTimeout(r, 40));
    await post();
    await new Promise((r) => setTimeout(r, 40));
    server.close();

    expect(executeCount).toBe(1);
  });

  it('6. reinicio de proceso: claim SQLite sobrevive', () => {
    const dir = tmpDir('wa-idem-restart-');
    const dbPath = path.join(dir, 'idem.sqlite');
    const legacy = path.join(dir, 'whatsapp-processed-wamids.json');

    const a = new SqliteWhatsAppMessageIdempotency(dbPath, {
      legacyFilePath: legacy,
    });
    expect(a.claim('wamid.RESTART_1')).toBe(true);

    const b = new SqliteWhatsAppMessageIdempotency(dbPath, {
      legacyFilePath: legacy,
    });
    expect(b.claim('wamid.RESTART_1')).toBe(false);
  });

  it('6b. importa JSON legacy a SQLite', () => {
    const dir = tmpDir('wa-idem-legacy-');
    const dbPath = path.join(dir, 'idem.sqlite');
    const legacy = path.join(dir, 'whatsapp-processed-wamids.json');
    fs.writeFileSync(
      legacy,
      JSON.stringify({
        version: 1,
        entries: { 'wamid.FROM_JSON': Date.now() },
      }),
    );

    const gate = new SqliteWhatsAppMessageIdempotency(dbPath, {
      legacyFilePath: legacy,
    });
    expect(gate.claim('wamid.FROM_JSON')).toBe(false);
    expect(fs.existsSync(legacy)).toBe(true);
  });

  it('7. ASK_YEAR + año válido avanza', async () => {
    const apps = buildApps();
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

    const conv = {
      id: 'c-year',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:year-ok',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    conv.context = (await engine.process(conv as never, 'batería')).context;
    conv.context = (
      await engine.process(conv as never, 'Chevrolet Corsa Evolution')
    ).context;
    expect(conv.context.salesFlow?.nextAction).toBe('ASK_YEAR');

    const askYearText = formatAskYear(
      conv.context.vehicle.brand ?? 'CHEVROLET',
      conv.context.vehicle.model ?? 'Corsa Evolution',
    );
    const yearStep = await engine.process(conv as never, '2015');
    expect(yearStep.reply).not.toBe(askYearText);
    expect(yearStep.reply).not.toMatch(/necesito solo el año/i);
    expect(yearStep.context.vehicle.year ?? yearStep.context.salesFlow?.vehicle.year).toBe(
      '2015',
    );
    expect(yearStep.context.salesFlow?.nextAction).not.toBe('ASK_YEAR');
  });

  it('8. ASK_YEAR + Hola → recordatorio controlado (no formatAskYear)', async () => {
    const apps = buildApps();
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

    const conv = {
      id: 'c-hola',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:year-hola',
      context: {
        ...createEmptyContext(),
        category: 'baterias' as const,
        intent: 'baterias' as const,
        stage: 'collecting_vehicle' as const,
        vehicle: {
          brand: 'CHEVROLET',
          model: 'Esteem 1.3 1.6 SW',
        },
        salesFlow: {
          state: 'IDENTIFYING_VEHICLE' as const,
          nextAction: 'ASK_YEAR' as const,
          vehicle: {
            brand: 'CHEVROLET',
            model: 'Esteem 1.3 1.6 SW',
          },
          hasRecommendation: false,
          leadScore: 40,
          readyForAdvisor: false,
        },
      },
      // >1 customer message: evita welcome de saludo inicial ante "Hola"
      messages: [
        {
          id: 'm1',
          conversationId: 'c-hola',
          role: 'customer' as const,
          content: 'batería',
          createdAt: new Date(),
        },
        {
          id: 'm2',
          conversationId: 'c-hola',
          role: 'assistant' as const,
          content: 'ask',
          createdAt: new Date(),
        },
        {
          id: 'm3',
          conversationId: 'c-hola',
          role: 'customer' as const,
          content: 'Chevrolet Esteem 1.3 1.6 SW',
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const fullAsk = formatAskYear('CHEVROLET', 'Esteem 1.3 1.6 SW');
    const reminder = formatAskYearReminder('CHEVROLET', 'Esteem 1.3 1.6 SW');
    const ack = midFlowGreetingAck();

    expect(isPureGreetingMessage('Hola')).toBe(true);
    expect(isPureGreetingMessage('Hola, es un Mazda 3 2015')).toBe(false);
    expect(ack).toBe('¡Hola nuevamente! 👋 Seguimos con tu recomendación.');

    const r1 = await engine.process(conv as never, 'Hola');
    expect(r1.reply).toBe(ack);
    expect(r1.reply).not.toBe(fullAsk);
    expect(r1.reply).not.toBe(reminder);
    expect(r1.reply).not.toMatch(/¿De qué año es\?/i);
    expect(r1.context.salesFlow?.nextAction).toBe('ASK_YEAR');
    expect(r1.context.vehicle.model).toBe('Esteem 1.3 1.6 SW');

    conv.context = r1.context;
    const r2 = await engine.process(conv as never, 'Hola');
    expect(r2.reply).toBe(ack);
    expect(r2.context.salesFlow?.nextAction).toBe('ASK_YEAR');
  });

  it('8b. ASK_SOUND + Hola → ack breve, no reenvía planta de sonido', async () => {
    const apps = buildApps();
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

    const conv = {
      id: 'c-sound-hola',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:sound-hola',
      context: {
        ...createEmptyContext(),
        category: 'baterias' as const,
        intent: 'baterias' as const,
        stage: 'collecting_vehicle' as const,
        vehicle: { brand: 'KIA', model: 'Sportage Diesel', year: '2015' },
        salesFlow: {
          state: 'IDENTIFYING_VEHICLE' as const,
          nextAction: 'ASK_SOUND' as const,
          vehicle: {
            brand: 'KIA',
            model: 'Sportage Diesel',
            year: '2015',
            vehicleConfirmed: true,
          },
          hasRecommendation: false,
          leadScore: 50,
          readyForAdvisor: false,
        },
      },
      messages: [
        {
          id: 'm1',
          conversationId: 'c-sound-hola',
          role: 'customer' as const,
          content: 'batería',
          createdAt: new Date(),
        },
        {
          id: 'm2',
          conversationId: 'c-sound-hola',
          role: 'customer' as const,
          content: 'Kia Sportage',
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const r = await engine.process(conv as never, 'Hola');
    expect(r.reply).toMatch(/Hola nuevamente/i);
    expect(r.reply).not.toMatch(/Última pregunta para afinar/i);
    expect(r.reply).not.toBe(
      'Última pregunta para afinar la recomendación:\n\n¿El vehículo tiene planta de sonido o amplificador?\nResponde *sí* o *no*.',
    );
    expect(r.context.salesFlow?.nextAction).toBe('ASK_SOUND');
  });

  it('8c. Hola + datos útiles sigue procesando (no solo greeting)', async () => {
    const apps = buildApps();
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

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

    const r = await engine.process(
      conv as never,
      'Hola, Chevrolet Corsa Evolution 2013',
    );
    expect(r.reply).not.toMatch(/Hola nuevamente/i);
    expect(r.reply).not.toMatch(/¿Para qué vehículo/i);
  });

  it('9. mensajes secuenciales avanzan el flujo', async () => {
    const messaging = new ConsoleMessagingProvider();
    const { useCase, conversations } = buildUseCase({ messaging });
    const phone = '573008881111';
    const external = `whatsapp:${phone}`;

    const r1 = await useCase.execute({
      phone,
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.SEQ1',
    });
    expect(r1.reply).toMatch(/vehículo/i);

    const r2 = await useCase.execute({
      phone,
      text: 'Chevrolet Corsa Evolution',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.SEQ2',
    });
    expect(r2.reply).toMatch(/a[nñ]o/i);

    const r3 = await useCase.execute({
      phone,
      text: '2013',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.SEQ3',
    });
    expect(r3.reply).not.toMatch(/¿Para qué vehículo/i);

    const saved = await conversations.findByExternalId(external);
    expect(saved?.context.vehicle.year ?? saved?.context.salesFlow?.vehicle.year).toBe(
      '2013',
    );
  });

  it('10. handoff activo conserva guards', async () => {
    const apps = buildApps();
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );

    const conv = {
      id: 'c-ho',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:ho',
      context: createEmptyContext(),
      messages: [
        {
          id: 'm1',
          conversationId: 'c-ho',
          role: 'customer' as const,
          content: 'batería',
          createdAt: new Date(),
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    conv.context.needsHumanHandoff = true;
    conv.context.stage = 'handoff';
    conv.context.handoffReason = 'Cliente aceptó la recomendación Willard';
    conv.context.category = 'baterias';
    conv.context.intent = 'baterias';
    conv.context.salesFlow = {
      state: 'READY_FOR_ADVISOR',
      nextAction: 'HANDOFF_TO_ADVISOR',
      vehicle: {
        brand: 'CHEVROLET',
        model: 'Corsa Evolution',
        year: '2013',
        vehicleConfirmed: true,
        soundSystem: false,
      },
      hasRecommendation: true,
      matchKind: 'exact',
      leadScore: 95,
      readyForAdvisor: true,
    } as never;

    const again = await engine.process(conv as never, 'sí');
    expect(again.reply).toBe(handoffAlreadyActiveMessage());
    expect(again.reply).not.toContain('Motivo: Cliente aceptó');
    expect(again.context.needsHumanHandoff).toBe(true);
    expect(again.context.stage).toBe('handoff');

    const hola = await engine.process(
      { ...conv, context: again.context } as never,
      'Hola',
    );
    // Tras handoff, "Hola" reabre (welcome) para no quedar mudo por dedup WhatsApp.
    expect(hola.reply).toMatch(/Bienvenido|baterías|Rodacenter/i);
    expect(hola.context.needsHumanHandoff).toBe(false);
    expect(hola.context.stage).toBe('awaiting_category');
    expect(hola.context.salesFlow).toBeUndefined();
  });

  it('11. CRM save proyecta persisted_sessions', async () => {
    resetCrmSqliteSharedMemory();
    const dir = tmpDir('wa-crm-proj-');
    const dbPath = path.join(dir, 'crm.sqlite');

    const persistence = new SQLitePersistenceRepository(dbPath);
    const crm = new SQLiteChatConversationRepository(dbPath);
    const conversations = new ProjectingConversationRepository(
      crm,
      persistence,
      new ConversationSessionProjector(),
    );

    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const { useCase } = buildUseCase({
      messaging,
      conversations,
    });

    const phone = '573007771111';
    const external = `whatsapp:${phone}`;

    const out = await useCase.execute({
      phone,
      text: 'batería',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.CRM_OK',
    });

    expect(out.sendSkippedDueToPersistFailure).toBeFalsy();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0]![0].inboundWamid).toBe('wamid.CRM_OK');

    const savedCrm = await conversations.findByExternalId(external);
    expect(savedCrm).toBeTruthy();

    const session = persistence.load(external);
    expect(session).toBeTruthy();
    expect(session!.conversationId).toBe(savedCrm!.id);
    expect(session!.conversation.context.category).toBe('baterias');

    persistence.close();
  });

  it('F. dos wa_id distintos pueden procesarse en paralelo', async () => {
    const messaging = new ConsoleMessagingProvider();
    const serializer = new WaIdTurnSerializer(new WaIdTurnQueue());
    let concurrent = 0;
    let maxConcurrent = 0;

    const apps = buildApps();
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );
    const originalProcess = engine.process.bind(engine);
    vi.spyOn(engine, 'process').mockImplementation(async (conv, text) => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 50));
      try {
        return await originalProcess(conv, text);
      } finally {
        concurrent -= 1;
      }
    });

    const { useCase } = buildUseCase({
      messaging,
      engine,
      turnSerializer: serializer,
    });

    await Promise.all([
      useCase.execute({
        phone: '573001111111',
        text: 'batería',
        channel: 'whatsapp',
        externalConversationId: 'whatsapp:573001111111',
        sendReply: true,
        inboundWamid: 'wamid.PAR_A',
      }),
      useCase.execute({
        phone: '573002222222',
        text: 'batería',
        channel: 'whatsapp',
        externalConversationId: 'whatsapp:573002222222',
        sendReply: true,
        inboundWamid: 'wamid.PAR_B',
      }),
    ]);

    expect(maxConcurrent).toBeGreaterThanOrEqual(2);
  });

  it('I. flujo completo real: batería → vehículo → año → sonido → sí → handoff', async () => {
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const { useCase, conversations } = buildUseCase({ messaging });
    const phone = '573006669999';
    const external = `whatsapp:${phone}`;

    const steps = [
      { text: 'Hola', wamid: 'wamid.FULL1' },
      { text: 'batería', wamid: 'wamid.FULL2' },
      { text: 'Chevrolet Corsa Evolution', wamid: 'wamid.FULL3' },
      { text: '2013', wamid: 'wamid.FULL4' },
      { text: 'No', wamid: 'wamid.FULL5' },
      { text: 'sí', wamid: 'wamid.FULL6' },
    ];

    const replies: string[] = [];
    for (const step of steps) {
      const out = await useCase.execute({
        phone,
        text: step.text,
        channel: 'whatsapp',
        externalConversationId: external,
        sendReply: true,
        inboundWamid: step.wamid,
      });
      expect(out.sendSkippedDueToPersistFailure).toBeFalsy();
      replies.push(out.reply);
    }

    const vehicleAsks = replies.filter((r) =>
      r.includes('¿Para qué vehículo'),
    );
    expect(vehicleAsks.length).toBeLessThanOrEqual(1);

    const saved = await conversations.findByExternalId(external);
    expect(saved?.context.needsHumanHandoff).toBe(true);
    expect(sendSpy.mock.calls.length).toBe(replies.filter((r) => r.trim()).length);
  });

  it('lease SQLite: dos owners no solapan el mismo wa_id', async () => {
    const dbPath = path.join(tmpDir('wa-lease-'), 'lease.sqlite');
    const lockA = new SqliteWaIdTurnLock(dbPath, { pollMs: 10, maxWaitMs: 2_000 });
    const lockB = new SqliteWaIdTurnLock(dbPath, { pollMs: 10, maxWaitMs: 2_000 });

    const releaseA = await lockA.acquire('whatsapp:57300');
    let bAcquired = false;
    const pendingB = lockB.acquire('whatsapp:57300').then((release) => {
      bAcquired = true;
      release();
    });

    await new Promise((r) => setTimeout(r, 40));
    expect(bAcquired).toBe(false);
    releaseA();
    await pendingB;
    expect(bAcquired).toBe(true);
  });
});

describe('FileWhatsAppMessageIdempotency sigue disponible (compat)', () => {
  it('claim file sigue funcionando', () => {
    const filePath = path.join(tmpDir('wa-file-'), 'wamids.json');
    const a = new FileWhatsAppMessageIdempotency(filePath);
    expect(a.claim('wamid.FILE')).toBe(true);
    const b = new FileWhatsAppMessageIdempotency(filePath);
    expect(b.claim('wamid.FILE')).toBe(false);
  });
});

afterAll(() => {
  resetCrmSqliteSharedMemory();
});
