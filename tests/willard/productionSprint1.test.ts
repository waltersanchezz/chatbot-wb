import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/application/services/AuthService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  assertProductionReady,
  PRODUCTION_INSECURE_DEFAULTS,
} from '../../src/infrastructure/config/productionGuard';
import { JwtService } from '../../src/infrastructure/auth/JwtService';
import { PasswordHasher } from '../../src/infrastructure/auth/PasswordHasher';
import {
  FileWhatsAppMessageIdempotency,
  MemoryWhatsAppMessageIdempotency,
} from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import {
  signWhatsAppBody,
  summarizeWhatsAppPayload,
  verifyWhatsAppSignature,
} from '../../src/infrastructure/messaging/whatsappSignature';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteTenantRepository } from '../../src/infrastructure/persistence/SQLiteTenantRepository';
import { SQLiteUserRepository } from '../../src/infrastructure/persistence/SQLiteUserRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { createWhatsAppRouter } from '../../src/presentation/http/routes/whatsappRoutes';

const APP_SECRET = 'meta-app-secret-for-ps1-tests-32chars!!';

function samplePayload(wamid: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ profile: { name: 'Test' }, wa_id: '573001112233' }],
              messages: [
                {
                  from: '573001112233',
                  id: wamid,
                  timestamp: '1700000000',
                  type: 'text',
                  text: { body: 'Necesito batería para Spark 2018' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function listen(app: Express): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function stubHandleIncoming(): HandleIncomingMessage {
  return {
    execute: vi.fn(async () => ({
      conversationId: 'c',
      customerId: 'u',
      reply: 'ok',
      needsHumanHandoff: false,
      durationMs: 1,
    })),
  } as unknown as HandleIncomingMessage;
}

describe('Production Sprint 1 — WhatsApp signature helpers', () => {
  it('verifies valid X-Hub-Signature-256 and rejects tampering', () => {
    const raw = Buffer.from(JSON.stringify(samplePayload('wamid.OK')), 'utf8');
    const sig = signWhatsAppBody(raw, APP_SECRET);
    expect(verifyWhatsAppSignature(raw, sig, APP_SECRET)).toBe(true);
    expect(verifyWhatsAppSignature(raw, 'sha256=deadbeef', APP_SECRET)).toBe(
      false,
    );
    expect(verifyWhatsAppSignature(raw, undefined, APP_SECRET)).toBe(false);
    expect(verifyWhatsAppSignature(raw, sig, '')).toBe(false);
    expect(
      verifyWhatsAppSignature(raw, 'sha256=not-a-valid-hex-digest!!!!!', APP_SECRET),
    ).toBe(false);
    expect(verifyWhatsAppSignature(raw, 'md5=abc', APP_SECRET)).toBe(false);
  });

  it('summarizes payload without exposing message text', () => {
    const summary = summarizeWhatsAppPayload(samplePayload('wamid.SUM'));
    expect(summary.entryCount).toBe(1);
    expect(summary.textMessageCount).toBe(1);
    expect(summary.wamids).toContain('wamid.SUM');
    expect(JSON.stringify(summary)).not.toMatch(/Spark/i);
  });
});

describe('Production Sprint 1 — webhook verify + firma', () => {
  it('GET verify_token correcto → challenge; incorrecto → 403', async () => {
    const app = express();
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(stubHandleIncoming(), 'verify-ok'),
    );
    const { baseUrl, close } = await listen(app);
    try {
      const ok = await fetch(
        `${baseUrl}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=verify-ok&hub.challenge=12345`,
      );
      expect(ok.status).toBe(200);
      expect(await ok.text()).toBe('12345');
      const bad = await fetch(
        `${baseUrl}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1`,
      );
      expect(bad.status).toBe(403);
    } finally {
      await close();
    }
  });

  it('rejects POST without signature when requireSignature=true', async () => {
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as express.Request & { rawBody?: Buffer }).rawBody =
            Buffer.from(buf);
        },
      }),
    );
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(stubHandleIncoming(), 'verify', undefined, {
        appSecret: APP_SECRET,
        requireSignature: true,
      }),
    );
    const { baseUrl, close } = await listen(app);
    try {
      const res = await fetch(`${baseUrl}/webhook/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samplePayload('wamid.NOSIG')),
      });
      expect(res.status).toBe(403);
    } finally {
      await close();
    }
  });

  it('accepts POST with valid signature and processes once', async () => {
    const useCase = stubHandleIncoming();
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as express.Request & { rawBody?: Buffer }).rawBody =
            Buffer.from(buf);
        },
      }),
    );
    app.use(
      '/webhook/whatsapp',
      createWhatsAppRouter(
        useCase,
        'verify',
        new MemoryWhatsAppMessageIdempotency(),
        { appSecret: APP_SECRET, requireSignature: true },
      ),
    );
    const { baseUrl, close } = await listen(app);
    try {
      const body = JSON.stringify(samplePayload('wamid.SIGNED'));
      const sig = signWhatsAppBody(body, APP_SECRET);
      const res = await fetch(`${baseUrl}/webhook/whatsapp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': sig,
        },
        body,
      });
      expect(res.status).toBe(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(useCase.execute).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });
});

describe('Production Sprint 1 — fail-fast production', () => {
  const base = {
    nodeEnv: 'production' as const,
    jwtSecret: 'a'.repeat(40),
    sqlitePath: '/var/data/rodacenter.sqlite',
    auth: { adminPassword: 'StrongPass!2026', required: true },
    whatsapp: {
      appSecret: 'meta-secret',
      verifyToken: 'custom-verify-token',
      accessToken: 'EAAG-test-token',
      phoneNumberId: '1234567890',
    },
    telegram: {
      botToken: '123456:ABC',
      chatId: '999001',
    },
  };

  it('passes with strong secrets', () => {
    expect(() => assertProductionReady(base as never)).not.toThrow();
  });

  it('rejects insecure JWT default', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        jwtSecret: PRODUCTION_INSECURE_DEFAULTS.jwtSecret,
      } as never),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects admin123', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        auth: {
          adminPassword: PRODUCTION_INSECURE_DEFAULTS.adminPassword,
          required: true,
        },
      } as never),
    ).toThrow(/AUTH_ADMIN_PASSWORD/);
  });

  it('rejects missing WhatsApp app secret', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        whatsapp: { ...base.whatsapp, appSecret: '' },
      } as never),
    ).toThrow(/WHATSAPP_APP_SECRET/);
  });

  it('rejects default verify token', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        whatsapp: {
          ...base.whatsapp,
          verifyToken: PRODUCTION_INSECURE_DEFAULTS.verifyToken,
        },
      } as never),
    ).toThrow(/WHATSAPP_VERIFY_TOKEN/);
  });

  it('rejects missing Cloud API credentials', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        whatsapp: { ...base.whatsapp, accessToken: '', phoneNumberId: '' },
      } as never),
    ).toThrow(/WHATSAPP_ACCESS_TOKEN/);
  });

  it('rejects AUTH_REQUIRED=false and :memory: sqlite', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        auth: { ...base.auth, required: false },
      } as never),
    ).toThrow(/AUTH_REQUIRED/);
    expect(() =>
      assertProductionReady({
        ...base,
        sqlitePath: ':memory:',
      } as never),
    ).toThrow(/SQLITE_PATH/);
  });

  it('rejects missing Telegram handoff credentials', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        telegram: { botToken: '', chatId: '' },
      } as never),
    ).toThrow(/TELEGRAM/);
  });

  it('no-ops outside production', () => {
    expect(() =>
      assertProductionReady({
        ...base,
        nodeEnv: 'development',
        jwtSecret: PRODUCTION_INSECURE_DEFAULTS.jwtSecret,
      } as never),
    ).not.toThrow();
  });
});

describe('Production Sprint 1 — APIs protegidas + debug off', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let users: SQLiteUserRepository;
  let token = '';

  beforeAll(async () => {
    users = new SQLiteUserRepository(':memory:');
    const tenants = new SQLiteTenantRepository(':memory:');
    tenants.ensureDefault('rodacenter', 'Rodacenter');
    const hasher = new PasswordHasher();
    const jwt = new JwtService('test-secret-production-sprint1!!', 3600);
    const authService = new AuthService(users, jwt, hasher);
    authService.ensureSeedAdmin({
      tenantId: 'rodacenter',
      email: 'admin@rodacenter.local',
      name: 'Admin',
      password: 'StrongPass!2026',
    });
    const login = authService.login(
      'admin@rodacenter.local',
      'StrongPass!2026',
    );
    token = login?.token ?? '';

    const app = createApp({
      handleIncomingMessage: stubHandleIncoming(),
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-ps1'),
      leadService: new LeadService(
        new InMemoryLeadRepository(),
        { notifyNewLead: vi.fn(async () => false) } as never,
        new InMemoryInteractionRepository(),
      ),
      customerProfileService: new CustomerProfileService(
        new InMemoryCustomerRepository(),
        new InMemoryLeadRepository(),
        new InMemoryVehicleProfileRepository(),
        new InMemoryInteractionRepository(),
      ),
      interactionService: new InteractionService(
        new InMemoryInteractionRepository(),
      ),
      authService,
      authRequired: true,
      whatsappSecurity: {
        appSecret: APP_SECRET,
        requireSignature: true,
      },
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    users.close();
  });

  it.each([
    ['GET', '/api/leads'],
    ['GET', '/api/customers'],
    ['POST', '/api/chat'],
    ['GET', '/api/logs/recent'],
  ] as const)('%s %s sin Bearer → 401', async (method, route) => {
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:
        method === 'POST'
          ? JSON.stringify({ phone: '573001112233', message: 'hola' })
          : undefined,
    });
    expect(res.status).toBe(401);
  });

  it('/api/leads con Bearer → no 401', async () => {
    const res = await fetch(`${baseUrl}/api/leads`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).not.toBe(401);
  });

  it('/api/debug no montado (404)', async () => {
    const res = await fetch(
      `${baseUrl}/api/debug/whatsapp-delivery/trace?wamid=x`,
    );
    expect(res.status).toBe(404);
  });

  it('createApp webhook exige firma', async () => {
    const res = await fetch(`${baseUrl}/webhook/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(samplePayload('wamid.APP')),
    });
    expect(res.status).toBe(403);
  });
});

describe('Production Sprint 1 — idempotencia en path durable (restart)', () => {
  it('sobrevive reinicio de proceso en DATA_DIR simulado', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps1-data-'));
    const idemPath = path.join(dataDir, 'whatsapp-processed-wamids.json');

    const a = new FileWhatsAppMessageIdempotency(idemPath, 60_000);
    expect(a.claim('wamid.VOLUME_1')).toBe(true);
    expect(fs.existsSync(idemPath)).toBe(true);

    const b = new FileWhatsAppMessageIdempotency(idemPath, 60_000);
    expect(b.claim('wamid.VOLUME_1')).toBe(false);
    expect(b.claim('wamid.VOLUME_2')).toBe(true);
  });
});
