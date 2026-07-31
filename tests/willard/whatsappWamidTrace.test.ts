import { describe, expect, it, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createWhatsAppRouter } from '../../src/presentation/http/routes/whatsappRoutes';
import { createWhatsAppAuditRouter } from '../../src/presentation/http/routes/whatsappAuditRoutes';
import { MemoryWhatsAppMessageIdempotency } from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import { whatsappDeliveryAudit } from '../../src/infrastructure/messaging/WhatsAppDeliveryAudit';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { RecommendationService } from '../../src/application/services/RecommendationService';
import { LeadService } from '../../src/application/services/LeadService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { FakeWillardBatteryKnowledge, hit } from './FakeWillardBatteryKnowledge';
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('WhatsApp wamid end-to-end chronological trace', () => {
  let server: Server;
  let baseUrl = '';
  const verifyToken = 'trace-token';

  beforeEach(() => {
    whatsappDeliveryAudit.reset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('dual POST same wamid → full timeline shows where second POST stops', async () => {
    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-trace-'));
    const knowledge = new FakeWillardBatteryKnowledge([
      hit({
        marca: 'RENAULT',
        modelo: 'Symbol',
        textoCatalogo: 'Symbol',
        refs: { willard: ['FAKE-SYM'] },
      }),
    ]);
    const messaging = new ConsoleMessagingProvider();
    const useCase = new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      new InMemoryConversationRepository(),
      new FileLogRepository(tmpLog),
      new ConversationEngine(
        new InMemoryProductRepository(),
        new RecommendationService(knowledge),
        { appName: 'Test', companyName: 'Rodacenter' },
      ),
      messaging,
      new LeadService(
        new InMemoryLeadRepository(),
        new NotificationService(),
        new InMemoryInteractionRepository(),
      ),
      120,
    );

    const app = express();
    app.use(express.json());
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(
        useCase,
        verifyToken,
        new MemoryWhatsAppMessageIdempotency(),
      ),
    );
    app.use('/api/debug', createWhatsAppAuditRouter(verifyToken));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const wamid = 'wamid.TRACE_SAME_ID_001';
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
                contacts: [{ profile: { name: 'Trace' }, wa_id: '573009990002' }],
                messages: [
                  {
                    from: '573009990002',
                    id: wamid,
                    timestamp: '1700000000',
                    type: 'text',
                    text: { body: 'batería' },
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

    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));

    const trace = await fetch(
      `${baseUrl}/api/debug/whatsapp-delivery/trace?wamid=${encodeURIComponent(wamid)}&token=${verifyToken}`,
    ).then((r) => r.json());

    expect(trace.wamid).toBe(wamid);
    expect(trace.auditInstance).toBeTruthy();
    expect(trace.pid).toBe(process.pid);
    expect(trace.postCount).toBe(2);

    type Ev = {
      event: string;
      requestId: string;
      claimResult?: string;
      postCountForWamid?: number;
      ok?: boolean;
      providerMessageId?: string;
      callSite?: string;
      stack?: string;
      metaHttpStatus?: number;
      pid: number;
      auditInstance: string;
      timestamp: string;
    };
    const timeline = trace.timeline as Ev[];

    const posts = timeline.filter((e) => e.event === 'POST_RECEIVED');
    expect(posts).toHaveLength(2);
    expect(posts[0].postCountForWamid).toBe(1);
    expect(posts[1].postCountForWamid).toBe(2);
    expect(posts[0].requestId).not.toBe(posts[1].requestId);
    expect(posts[0].pid).toBe(process.pid);
    expect(posts[0].auditInstance).toBe(trace.auditInstance);
    expect(posts[0].timestamp).toBeTruthy();

    const winnerId = posts[0].requestId;
    const loserId = posts[1].requestId;

    const of = (requestId: string) =>
      timeline.filter((e) => e.requestId === requestId).map((e) => e.event);

    // Ganador: procesa completo (orden relativo por requestId).
    expect(of(winnerId)).toEqual([
      'POST_RECEIVED',
      'CLAIM',
      'HANDLE_ENTER',
      'SEND_TEXT',
      'HANDLE_EXIT',
    ]);
    expect(
      timeline.find((e) => e.requestId === winnerId && e.event === 'CLAIM'),
    ).toMatchObject({ claimResult: 'claim_ok' });

    const send = timeline.find(
      (e) => e.requestId === winnerId && e.event === 'SEND_TEXT',
    );
    expect(send).toMatchObject({
      ok: true,
      metaHttpStatus: 200,
    });
    expect(send?.providerMessageId).toBeTruthy();
    expect(send?.callSite).toContain('HandleIncomingMessage');
    expect(send?.stack).toBeTruthy();

    // Perdedor: se detiene en STOPPED_DUPLICATE — sin HANDLE ni SEND.
    expect(of(loserId)).toEqual([
      'POST_RECEIVED',
      'CLAIM',
      'STOPPED_DUPLICATE',
    ]);
    expect(
      timeline.find((e) => e.requestId === loserId && e.event === 'CLAIM'),
    ).toMatchObject({ claimResult: 'duplicate_skipped' });

    expect(timeline.filter((e) => e.event === 'SEND_TEXT')).toHaveLength(1);
    expect(timeline.filter((e) => e.event === 'HANDLE_ENTER')).toHaveLength(1);
  });
});
