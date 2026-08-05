import { describe, expect, it, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createWhatsAppRouter } from '../../src/presentation/http/routes/whatsappRoutes';
import { createWhatsAppAuditRouter } from '../../src/presentation/http/routes/whatsappAuditRoutes';
import { MemoryWhatsAppMessageIdempotency } from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import { whatsappDeliveryAudit } from '../../src/infrastructure/messaging/WhatsAppDeliveryAudit';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { InMemoryConversationRepository } from '../../src/infrastructure/persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { FakeWillardBatteryKnowledge, hit } from './FakeWillardBatteryKnowledge';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import os from 'os';
import path from 'path';
import fs from 'fs';

describe('WhatsApp delivery evidence (dual POST same wamid)', () => {
  let server: Server;
  let baseUrl = '';
  const verifyToken = 'evidence-token';

  beforeEach(() => {
    whatsappDeliveryAudit.reset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('same wamid → 2 POSTs, 1 claim_ok, 1 duplicate_skipped, 1 sendText', async () => {
    const tmpLog = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ev-'));
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
    const messaging = new ConsoleMessagingProvider();
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

    const wamid = 'wamid.EVIDENCE_SAME_ID_001';
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
                contacts: [{ profile: { name: 'Evidence' }, wa_id: '573009990001' }],
                messages: [
                  {
                    from: '573009990001',
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
    await new Promise((r) => setTimeout(r, 80));

    const audit = await fetch(
      `${baseUrl}/api/debug/whatsapp-delivery?token=${verifyToken}`,
    ).then((r) => r.json());

    expect(audit.auditInstance).toBeTruthy();
    expect(audit.postsReceived).toBe(2);
    expect(audit.claimsOk).toBe(1);
    expect(audit.duplicatesSkipped).toBe(1);
    expect(audit.sendTextCalls).toBe(1);
    expect(audit.metaMessagesSent).toBe(1);
    expect(audit.posts.every((p: { wamids: string[] }) => p.wamids[0] === wamid)).toBe(
      true,
    );
    expect(audit.claims[0]).toMatchObject({ wamid, result: 'claim_ok' });
    expect(audit.claims[1]).toMatchObject({ wamid, result: 'duplicate_skipped' });
    expect(audit.sends[0].wamid).toBe(wamid);
    expect(audit.sends[0].callSite).toContain('HandleIncomingMessage');
  });
});
