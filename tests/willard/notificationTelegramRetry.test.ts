import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from '../../src/application/services/NotificationService';
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

describe('NotificationService Telegram retry (PS4)', () => {
  const originalFetch = globalThis.fetch;
  const prevToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevChat = process.env.TELEGRAM_CHAT_ID;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.TELEGRAM_BOT_TOKEN = prevToken;
    process.env.TELEGRAM_CHAT_ID = prevChat;
    vi.useRealTimers();
  });

  it('retorna false si faltan credenciales (sin fetch)', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '';
    process.env.TELEGRAM_CHAT_ID = '';
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ok = await new NotificationService().notifyNewLead(sampleLead());
    expect(ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reintenta ante 500 y termina OK', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';
    vi.useFakeTimers();

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('fail', { status: 500, statusText: 'ERR' }),
      )
      .mockResolvedValueOnce(
        new Response('{"ok":true}', { status: 200, statusText: 'OK' }),
      );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const service = new NotificationService();
    const promise = service.notifyNewLead(sampleLead());
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('no reintenta ante 400 permanente', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC';
    process.env.TELEGRAM_CHAT_ID = '999';

    const fetchSpy = vi.fn().mockResolvedValue(
      new Response('bad', { status: 400, statusText: 'Bad' }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const ok = await new NotificationService().notifyNewLead(sampleLead());
    expect(ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
