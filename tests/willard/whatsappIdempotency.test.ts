import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createWhatsAppRouter } from '../../src/presentation/http/routes/whatsappRoutes';
import {
  FileWhatsAppMessageIdempotency,
  MemoryWhatsAppMessageIdempotency,
} from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';

describe('MemoryWhatsAppMessageIdempotency', () => {
  it('claims a new id once and rejects the retry', () => {
    const store = new MemoryWhatsAppMessageIdempotency(60_000);
    expect(store.claim('wamid.ABC')).toBe(true);
    expect(store.claim('wamid.ABC')).toBe(false);
    expect(store.claim('wamid.OTHER')).toBe(true);
  });

  it('expires old ids after ttl', () => {
    const store = new MemoryWhatsAppMessageIdempotency(1_000);
    expect(store.claim('wamid.X', 1_000)).toBe(true);
    expect(store.claim('wamid.X', 1_500)).toBe(false);
    expect(store.claim('wamid.X', 3_000)).toBe(true);
  });
  it('claims outbound send once per inbound wamid', () => {
    const store = new MemoryWhatsAppMessageIdempotency(60_000);
    expect(store.claim('wamid.ABC')).toBe(true);
    expect(store.claimOutbound('wamid.ABC')).toBe(true);
    expect(store.claimOutbound('wamid.ABC')).toBe(false);
    // inbound claim remains independent of outbound key
    expect(store.claim('wamid.OTHER')).toBe(true);
  });
});

describe('FileWhatsAppMessageIdempotency (survives process restart)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-idem-'));
  const filePath = path.join(dir, 'whatsapp-processed-wamids.json');

  beforeEach(() => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  it('persists claim to disk and rejects after reloadFromDisk', () => {
    const a = new FileWhatsAppMessageIdempotency(filePath, 60_000);
    expect(a.claim('wamid.PERSIST_1')).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);

    // Simula reinicio: nueva instancia lee el mismo archivo
    const b = new FileWhatsAppMessageIdempotency(filePath, 60_000);
    expect(b.claim('wamid.PERSIST_1')).toBe(false);
    expect(b.claim('wamid.PERSIST_2')).toBe(true);
  });

  it('reloadFromDisk picks up writes from another instance', () => {
    const a = new FileWhatsAppMessageIdempotency(filePath, 60_000);
    expect(a.claim('wamid.RELOAD')).toBe(true);

    const b = new FileWhatsAppMessageIdempotency(filePath, 60_000);
    b.reloadFromDisk();
    expect(b.claim('wamid.RELOAD')).toBe(false);
  });
});

describe('WhatsApp webhook duplicate delivery', () => {
  let server: Server;
  let baseUrl = '';
  let executeCount = 0;

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('processes the same wamid only once even if Meta POSTs twice', async () => {
    executeCount = 0;
    const useCase = {
      execute: async () => {
        executeCount += 1;
        return {
          conversationId: 'c',
          customerId: 'u',
          reply: 'ok',
          needsHumanHandoff: false,
          durationMs: 1,
        };
      },
    };

    const app = express();
    app.use(express.json());
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(
        useCase as any,
        'verify-test',
        new MemoryWhatsAppMessageIdempotency(),
      ),
    );

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${addr.port}`;

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
                    id: 'wamid.DUPLICATE_TEST',
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: '2003' },
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

    const r1 = await post();
    const r2 = await post();
    await new Promise((r) => setTimeout(r, 50));

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(executeCount).toBe(1);
  });
});
