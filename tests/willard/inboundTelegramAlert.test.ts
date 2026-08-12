import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildBatteryLabelForTelegram,
  buildVehicleLabelForTelegram,
  buildWhatsAppMeUrl,
  formatColombiaDateTime,
  formatInboundCustomerTelegramText,
  NotificationService,
  readSoundSystemFromContext,
  truncateInboundMessage,
} from '../../src/application/services/NotificationService';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { MemoryWhatsAppMessageIdempotency } from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import type { Conversation } from '../../src/domain/entities/Conversation';
import type { ConversationRepository } from '../../src/domain/ports/ConversationRepository';
import { FakeWillardBatteryKnowledge, hit } from './FakeWillardBatteryKnowledge';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Lead } from '../../src/domain/entities/Lead';

function sampleLead(): Lead {
  return {
    id: 'lead-tg-1',
    createdAt: new Date('2026-08-03T15:00:00.000Z'),
    updatedAt: new Date('2026-08-03T15:00:00.000Z'),
    customerId: 'cust-1',
    conversationId: 'conv-1',
    phone: '573001112233',
    name: 'Ana',
    product: 'Batería',
    vehicleBrand: 'CHEVROLET',
    vehicleModel: 'Spark',
    year: '2018',
    optionLabel: 'Planta de sonido',
    optionValue: false,
    recommendation: '75D23L',
    status: 'nuevo',
    channel: 'whatsapp',
  };
}

describe('formatInboundCustomerTelegramText', () => {
  it('omite vehículo y batería si no hay datos', () => {
    const text = formatInboundCustomerTelegramText({
      phone: '573001112233',
      customerName: null,
      messageText: 'Hola',
      at: new Date('2026-08-11T20:00:00.000Z'),
    });
    expect(text).toContain('🔔 NUEVO MENSAJE DE WHATSAPP');
    expect(text).toContain('👤 Cliente: 573001112233');
    expect(text).toContain('📞 WhatsApp: 573001112233');
    expect(text).toContain('"Hola"');
    expect(text).not.toContain('🚗 Vehículo');
    expect(text).not.toContain('📅 Año');
    expect(text).not.toContain('🔊 Planta de sonido');
    expect(text).not.toContain('🔋 Recomendación');
    expect(text).toContain('🕒 Hora:');
  });

  it('incluye vehículo, año y recomendación cuando existen', () => {
    const text = formatInboundCustomerTelegramText({
      phone: '573001112233',
      customerName: 'Carlos',
      messageText: 'Ok',
      vehicleLabel: 'RENAULT Logan',
      yearLabel: '2015',
      batteryLabel: 'NS40L',
      at: new Date('2026-08-11T20:00:00.000Z'),
    });
    expect(text).toContain('👤 Cliente: Carlos');
    expect(text).toContain('🚗 Vehículo: RENAULT Logan');
    expect(text).toContain('📅 Año: 2015');
    expect(text).toContain('🔋 Recomendación:');
    expect(text).toContain('NS40L');
    expect(text).not.toContain('🔊 Planta de sonido');
  });

  it('formatea hora en America/Bogota (no UTC del servidor)', () => {
    const utc = new Date('2026-08-12T00:08:00.000Z');
    const hour = formatColombiaDateTime(utc);
    expect(hour).toMatch(/11\/08\/2026/);
    expect(hour.toLowerCase()).toMatch(/7:08/);
    expect(hour.toLowerCase()).toMatch(/p\.\s*m\./);
    expect(hour).not.toMatch(/12\/08\/2026/);

    const text = formatInboundCustomerTelegramText({
      phone: '573108918761',
      customerName: 'Juliana',
      messageText: 'no',
      at: utc,
    });
    expect(text).toContain(`🕒 Hora: ${hour}`);
  });

  it('planta de sonido sí / no / omitida', () => {
    const yes = formatInboundCustomerTelegramText({
      phone: '573001112233',
      messageText: 'sí',
      soundSystem: true,
      at: new Date('2026-08-12T00:08:00.000Z'),
    });
    expect(yes).toContain('🔊 Planta de sonido: ✅ Sí');

    const no = formatInboundCustomerTelegramText({
      phone: '573001112233',
      messageText: 'no',
      soundSystem: false,
      at: new Date('2026-08-12T00:08:00.000Z'),
    });
    expect(no).toContain('🔊 Planta de sonido: ❌ No');

    const pending = formatInboundCustomerTelegramText({
      phone: '573001112233',
      messageText: 'Hola',
      at: new Date('2026-08-12T00:08:00.000Z'),
    });
    expect(pending).not.toContain('🔊 Planta de sonido');
  });

  it('trunca mensajes largos', () => {
    const long = 'x'.repeat(2_000);
    const truncated = truncateInboundMessage(long, 50);
    expect(truncated.length).toBe(50);
    expect(truncated.endsWith('…')).toBe(true);
  });
});

describe('buildWhatsAppMeUrl / labels', () => {
  it('número válido → wa.me', () => {
    expect(buildWhatsAppMeUrl('whatsapp:573001112233')).toBe(
      'https://wa.me/573001112233',
    );
    expect(buildWhatsAppMeUrl('+57 300 111 2233')).toBe(
      'https://wa.me/573001112233',
    );
  });

  it('número inválido → null (sin enlace inventado)', () => {
    expect(buildWhatsAppMeUrl('wa:prod')).toBeNull();
    expect(buildWhatsAppMeUrl('123')).toBeNull();
    expect(buildWhatsAppMeUrl('')).toBeNull();
  });

  it('vehicle/battery labels omiten vacíos', () => {
    expect(buildVehicleLabelForTelegram({})).toBeNull();
    expect(
      buildVehicleLabelForTelegram({ brand: 'MAZDA', model: '2', year: '2008' }),
    ).toBe('MAZDA 2');
    expect(buildBatteryLabelForTelegram({})).toBeNull();
    expect(
      buildBatteryLabelForTelegram({ lastRecommendedReference: ' 75D23L ' }),
    ).toBe('75D23L');
    expect(
      buildBatteryLabelForTelegram({
        lastRecommendedReferences: ['24BD-900', '36D-750'],
      }),
    ).toBe('24BD-900\n36D-750');
    expect(readSoundSystemFromContext({})).toBeUndefined();
    expect(
      readSoundSystemFromContext({ battery: { soundSystem: false } }),
    ).toBe(false);
    expect(
      readSoundSystemFromContext({
        salesFlow: { vehicle: { soundSystem: true } },
      }),
    ).toBe(true);
  });
});

describe('notifyInboundCustomerMessage', () => {
  const originalFetch = globalThis.fetch;
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevChat = process.env.TELEGRAM_CHAT_ID;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.TELEGRAM_BOT_TOKEN = prevToken;
    process.env.TELEGRAM_CHAT_ID = prevChat;
  });

  it('envía texto + botón wa.me con número válido', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ok = await new NotificationService().notifyInboundCustomerMessage({
      phone: '573001112233',
      customerName: 'Ana',
      messageText: 'Necesito batería',
      vehicleLabel: 'CHEVROLET Spark 2018',
      batteryLabel: '75D23L',
      correlationId: 'wamid.IN1',
    });
    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = decodeURIComponent(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? '').replace(/\+/g, ' '),
    );
    expect(body).toContain('NUEVO MENSAJE DE WHATSAPP');
    expect(body).toContain('reply_markup');
    expect(body).toContain('https://wa.me/573001112233');
    expect(body).toContain('👉 Abrir WhatsApp');
  });

  it('número inválido → envía sin reply_markup', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await new NotificationService().notifyInboundCustomerMessage({
      phone: 'prod',
      messageText: 'Hola',
      correlationId: 'wamid.BAD',
    });
    const body = String(fetchSpy.mock.calls[0]?.[1]?.body ?? '');
    expect(body).not.toContain('reply_markup');
  });

  it('notifyNewLead sigue intacto (sin reply_markup inbound)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await new NotificationService().notifyNewLead(sampleLead());
    const body = decodeURIComponent(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? '').replace(/\+/g, ' '),
    );
    expect(body).toContain('Nuevo cliente en Rodacenter AI');
    expect(body).not.toContain('Abrir WhatsApp');
  });
});

describe('HandleIncomingMessage → Telegram inbound', () => {
  const originalFetch = globalThis.fetch;
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevChat = process.env.TELEGRAM_CHAT_ID;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.TELEGRAM_BOT_TOKEN = prevToken;
    process.env.TELEGRAM_CHAT_ID = prevChat;
  });

  function buildUseCase(opts: {
    conversations?: ConversationRepository;
    notifications?: NotificationService;
    sendGate?: MemoryWhatsAppMessageIdempotency;
  }) {
    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Symbol',
        textoCatalogo: 'Symbol',
        refs: { willard: ['FAKE-SYM'] },
      }),
    ];
    const knowledge = new FakeWillardBatteryKnowledge(apps);
    const { engine } = buildTestConversationEngine(
      knowledge,
      catalogRowsFromHits(apps),
    );
    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-inbound-'));
    return new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      opts.conversations ?? new InMemoryConversationRepository(),
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
      undefined,
      undefined,
      opts.sendGate ?? new MemoryWhatsAppMessageIdempotency(),
      undefined,
      opts.notifications ?? new NotificationService(),
    );
  }

  it('mensaje cliente → 1 Telegram; bot no dispara otro', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const notifications = new NotificationService();
    const spy = vi.spyOn(notifications, 'notifyInboundCustomerMessage');
    const useCase = buildUseCase({ notifications });

    await useCase.execute({
      phone: '573001112233',
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573001112233',
      inboundWamid: 'wamid.TG_CLIENT_1',
      customerName: 'Ana',
      sendReply: true,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    // Esperar fire-and-forget
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = decodeURIComponent(
      String(fetchSpy.mock.calls[0]?.[1]?.body ?? '').replace(/\+/g, ' '),
    );
    expect(body).toContain('NUEVO MENSAJE DE WHATSAPP');
    expect(body).not.toContain('Nuevo cliente en Rodacenter AI');
  });

  it('mismo inboundWamid repetido → 1 Telegram', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const gate = new MemoryWhatsAppMessageIdempotency();
    const notifications = new NotificationService();
    const spy = vi.spyOn(notifications, 'notifyInboundCustomerMessage');
    const useCase = buildUseCase({ notifications, sendGate: gate });

    const input = {
      phone: '573009998877',
      text: 'Hola',
      channel: 'whatsapp' as const,
      externalConversationId: 'whatsapp:573009998877',
      inboundWamid: 'wamid.TG_DEDUP',
      sendReply: false,
    };

    await useCase.execute(input);
    await useCase.execute({ ...input, text: 'Hola otra vez' });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('conversations.save falla → 0 Telegram', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const notifications = new NotificationService();
    const spy = vi.spyOn(notifications, 'notifyInboundCustomerMessage');
    const failingRepo: ConversationRepository = {
      findByExternalId: async () => null,
      findById: async () => null,
      save: async (_c: Conversation) => {
        throw new Error('sqlite down');
      },
      deleteExpired: async () => 0,
    };

    const useCase = buildUseCase({
      conversations: failingRepo,
      notifications,
    });
    const result = await useCase.execute({
      phone: '573001110000',
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573001110000',
      inboundWamid: 'wamid.TG_SAVE_FAIL',
      sendReply: false,
    });

    expect(result.sendSkippedDueToPersistFailure).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Telegram falla → WhatsApp continúa (sendText OK)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('fail', { status: 500 }),
    ) as unknown as typeof fetch;

    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');

    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Symbol',
        textoCatalogo: 'Symbol',
        refs: { willard: ['FAKE-SYM'] },
      }),
    ];
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps),
      catalogRowsFromHits(apps),
    );
    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-fail-'));
    const notifications = new NotificationService();
    vi.spyOn(notifications, 'notifyInboundCustomerMessage').mockRejectedValue(
      new Error('telegram down'),
    );

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
      undefined,
      undefined,
      new MemoryWhatsAppMessageIdempotency(),
      undefined,
      notifications,
    );

    const result = await useCase.execute({
      phone: '573007778889',
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573007778889',
      inboundWamid: 'wamid.TG_FAIL_OK',
      sendReply: true,
    });

    expect(result.reply.length).toBeGreaterThan(0);
    expect(sendSpy).toHaveBeenCalled();
    expect(result.sendSkippedDueToPersistFailure).not.toBe(true);
  });

  it('incluye vehículo/batería del context cuando existen', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('{"ok":true}', { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const repo = new InMemoryConversationRepository();
    const notifications = new NotificationService();
    const spy = vi.spyOn(notifications, 'notifyInboundCustomerMessage');
    const useCase = buildUseCase({ conversations: repo, notifications });

    // Primer turno crea conversación
    await useCase.execute({
      phone: '573002221111',
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573002221111',
      inboundWamid: 'wamid.TG_CTX_1',
      sendReply: false,
    });

    const conv = await repo.findByExternalId('whatsapp:573002221111');
    expect(conv).toBeTruthy();
    conv!.context.vehicle = {
      brand: 'MAZDA',
      model: '2',
      year: '2008',
    };
    conv!.context.lastRecommendedReference = 'NS40L';
    conv!.context.battery = { soundSystem: false };
    await repo.save(conv!);

    await useCase.execute({
      phone: '573002221111',
      text: 'Gracias',
      channel: 'whatsapp',
      externalConversationId: 'whatsapp:573002221111',
      inboundWamid: 'wamid.TG_CTX_2',
      sendReply: false,
    });

    expect(spy).toHaveBeenCalledTimes(2);
    const second = spy.mock.calls[1]?.[0];
    expect(second?.vehicleLabel).toBe('MAZDA 2');
    expect(second?.yearLabel).toBe('2008');
    expect(second?.soundSystem).toBe(false);
    expect(second?.batteryLabel).toBe('NS40L');
  });
});
