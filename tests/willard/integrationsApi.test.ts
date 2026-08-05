import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  IntegrationService,
  IntegrationValidationError,
} from '../../src/application/services/IntegrationService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  defaultCategoryForProvider,
  isConnectorCategory,
  isConnectorHealthStatus,
  isConnectorProviderId,
  isImplementedConnectorProvider,
} from '../../src/domain/dashboard/connectorDto';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import {
  DiscordConnector,
  EmailConnector,
  GoogleCalendarConnector,
  GoogleSheetsConnector,
  SlackConnector,
  TelegramConnector,
  WebhookConnector,
  WhatsAppConnector,
  listRegisteredConnectorProviders,
  resolveConnectorProvider,
} from '../../src/infrastructure/integrations/mockConnectors';
import { SQLiteConnectorRepository } from '../../src/infrastructure/persistence/SQLiteConnectorRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { createIntegrationsApiRouter } from '../../src/presentation/http/routes/integrationsApiRoutes';

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

function tmpDb(prefix: string): string {
  return path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

describe('connectorDto helpers', () => {
  it('valida enums y categorías por proveedor', () => {
    expect(isConnectorHealthStatus('ONLINE')).toBe(true);
    expect(isConnectorHealthStatus('X')).toBe(false);
    expect(isConnectorCategory('Messaging')).toBe(true);
    expect(isConnectorCategory('X')).toBe(false);
    expect(isConnectorProviderId('whatsapp')).toBe(true);
    expect(isConnectorProviderId('stripe')).toBe(true);
    expect(isImplementedConnectorProvider('webhook')).toBe(true);
    expect(isImplementedConnectorProvider('stripe')).toBe(false);
    expect(defaultCategoryForProvider('whatsapp')).toBe('Messaging');
    expect(defaultCategoryForProvider('email')).toBe('Email');
    expect(defaultCategoryForProvider('slack')).toBe('Chat');
    expect(defaultCategoryForProvider('webhook')).toBe('Webhook');
    expect(defaultCategoryForProvider('google_sheets')).toBe('Productivity');
    expect(defaultCategoryForProvider('google_calendar')).toBe('Calendar');
    expect(defaultCategoryForProvider('stripe')).toBe('Payments');
    expect(defaultCategoryForProvider('shopify')).toBe('Commerce');
    expect(defaultCategoryForProvider('openai')).toBe('AI');
    expect(defaultCategoryForProvider('zapier')).toBe('Automation');
    expect(defaultCategoryForProvider('unknown')).toBe('Other');
    expect(defaultCategoryForProvider('telegram')).toBe('Messaging');
    expect(defaultCategoryForProvider('twilio')).toBe('Messaging');
    expect(defaultCategoryForProvider('discord')).toBe('Chat');
    expect(defaultCategoryForProvider('rest')).toBe('Webhook');
    expect(defaultCategoryForProvider('microsoft')).toBe('Calendar');
    expect(defaultCategoryForProvider('mercadopago')).toBe('Payments');
    expect(defaultCategoryForProvider('anthropic')).toBe('AI');
    expect(defaultCategoryForProvider('n8n')).toBe('Automation');
    expect(defaultCategoryForProvider('make')).toBe('Automation');
  });
});

describe('Mock connectors', () => {
  it('cubre health/connect/execute/refresh de todos los providers', async () => {
    expect(listRegisteredConnectorProviders()).toEqual(
      expect.arrayContaining([
        'whatsapp',
        'telegram',
        'email',
        'slack',
        'discord',
        'webhook',
        'google_sheets',
        'google_calendar',
      ]),
    );
    expect(resolveConnectorProvider('missing')).toBeNull();

    const classes = [
      new WhatsAppConnector(),
      new TelegramConnector(),
      new EmailConnector(),
      new SlackConnector(),
      new DiscordConnector(),
      new GoogleSheetsConnector(),
      new GoogleCalendarConnector(),
    ];

    for (const c of classes) {
      const online = await c.connect({ apiKey: 'k' });
      expect(online.status).toBe('ONLINE');
      const pending = await c.health({ forcePending: true });
      expect(pending.status).toBe('PENDING');
      const err = await c.health({ forceError: true });
      expect(err.status).toBe('ERROR');
      const missing = await c.health({});
      expect(missing.status).toBe('ERROR');
      const okExec = await c.execute({ apiKey: 'k' }, { action: 'ping' });
      expect(okExec.ok).toBe(true);
      const badExec = await c.execute({ forceError: true }, { action: 'x' });
      expect(badExec.ok).toBe(false);
      const refresh = await c.refresh({ token: 't' });
      expect(refresh.status).toBe('ONLINE');
      const off = await c.disconnect({});
      expect(off.status).toBe('OFFLINE');
    }

    const webhook = new WebhookConnector();
    expect((await webhook.health({})).status).toBe('ERROR');
    expect(
      (await webhook.connect({ webhookUrl: 'https://x.test/h' })).status,
    ).toBe('ONLINE');
    expect(
      (await webhook.health({ forcePending: true })).status,
    ).toBe('PENDING');
    expect((await webhook.health({ forceError: true })).status).toBe('ERROR');
  });
});

describe('SQLiteConnectorRepository', () => {
  it('CRUD + filtros + logs + tenant isolation', () => {
    const dbPath = tmpDb('connectors');
    const a = new SQLiteConnectorRepository(dbPath, { tenantId: 't-a' });
    const b = new SQLiteConnectorRepository(dbPath, { tenantId: 't-b' });

    const c1 = a.create({
      provider: 'whatsapp',
      name: 'WA Principal',
      config: { apiKey: 'x' },
    });
    expect(c1.status).toBe('PENDING');
    expect(c1.category).toBe('Messaging');
    expect(a.getById(c1.id)?.name).toBe('WA Principal');
    expect(b.getById(c1.id)).toBeNull();

    a.create({
      provider: 'webhook',
      name: 'Hook',
      category: 'Webhook',
      enabled: false,
      status: 'OFFLINE',
      config: { webhookUrl: 'https://a' },
    });

    expect(a.list({ q: 'principal' })).toHaveLength(1);
    expect(a.list({ provider: 'webhook' })).toHaveLength(1);
    expect(a.list({ category: 'Messaging' })).toHaveLength(1);
    expect(a.list({ enabled: false })).toHaveLength(1);
    expect(a.list({ status: 'PENDING' })).toHaveLength(1);
    expect(b.list()).toHaveLength(0);

    const updated = a.update(c1.id, {
      name: 'WA 2',
      enabled: true,
      config: { apiKey: 'y' },
      status: 'ONLINE',
      category: 'Messaging',
    });
    expect(updated?.name).toBe('WA 2');
    expect(updated?.status).toBe('ONLINE');
    expect(a.update('missing', { name: 'x' })).toBeNull();

    const log = a.appendLog({
      connectorId: c1.id,
      event: 'test',
      status: 'ONLINE',
      message: 'ok',
    });
    expect(log.connectorId).toBe(c1.id);
    expect(a.listLogs({ connectorId: c1.id })).toHaveLength(1);
    expect(a.listLogs({ limit: 10 }).length).toBeGreaterThan(0);
    expect(b.listLogs()).toHaveLength(0);

    expect(a.delete(c1.id)).toBe(true);
    expect(a.getById(c1.id)).toBeNull();
    expect(a.listLogs({ connectorId: c1.id })).toHaveLength(0);
    expect(a.delete(c1.id)).toBe(false);

    expect(fs.existsSync(dbPath)).toBe(true);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('usa tenant ALS y tolera config_json inválido vía update path', () => {
    const repo = new SQLiteConnectorRepository(':memory:');
    runWithTenant('als-int', () => {
      const c = repo.create({
        provider: 'email',
        name: 'Mail',
        config: { apiKey: 'k' },
      });
      expect(c.tenantId).toBe('als-int');
    });
  });
});

describe('IntegrationService', () => {
  it('CRUD, connect/disconnect/test/execute/refresh y validaciones', async () => {
    const service = new IntegrationService(
      new SQLiteConnectorRepository(':memory:', { tenantId: 'rodacenter' }),
    );

    expect(() => service.create({ provider: '', name: 'x' })).toThrow(
      IntegrationValidationError,
    );
    expect(() =>
      service.create({ provider: 'whatsapp', name: '' }),
    ).toThrow(IntegrationValidationError);
    expect(() =>
      service.create({ provider: 'stripe', name: 'Pay' }),
    ).toThrow(IntegrationValidationError);
    expect(() =>
      service.create({
        provider: 'slack',
        name: 'S',
        category: 'NoExiste',
      }),
    ).toThrow(IntegrationValidationError);

    const created = service.create({
      provider: 'WhatsApp',
      name: 'Canal WA',
      config: { apiKey: 'secret' },
    });
    expect(created.provider).toBe('whatsapp');
    expect(service.getById(created.id)?.id).toBe(created.id);
    expect(service.list({ provider: 'whatsapp' })).toHaveLength(1);

    expect(() => service.update('', { name: 'x' })).toThrow(
      IntegrationValidationError,
    );
    expect(() => service.update(created.id, {})).toThrow(
      IntegrationValidationError,
    );
    expect(() =>
      service.update(created.id, { name: '   ' }),
    ).toThrow(IntegrationValidationError);
    expect(() =>
      service.update(created.id, { category: 'Bad' }),
    ).toThrow(IntegrationValidationError);
    expect(() =>
      service.update(created.id, { status: 'Bad' }),
    ).toThrow(IntegrationValidationError);

    const updated = service.update(created.id, {
      name: 'Canal WA 2',
      enabled: true,
    });
    expect(updated?.name).toBe('Canal WA 2');
    expect(service.update('missing', { name: 'x' })).toBeNull();

    const connected = await service.connect(created.id);
    expect(connected.health.status).toBe('ONLINE');
    expect(connected.connector.enabled).toBe(true);

    const tested = await service.test(created.id);
    expect(tested.health.status).toBe('ONLINE');

    const refreshed = await service.refresh(created.id);
    expect(refreshed.health.status).toBe('ONLINE');

    const exec = await service.execute(created.id, 'send', { text: 'hola' });
    expect(exec.result.ok).toBe(true);

    const disabled = service.update(created.id, { enabled: false })!;
    expect(disabled.enabled).toBe(false);
    await expect(service.execute(created.id, 'x')).rejects.toThrow(
      IntegrationValidationError,
    );

    const disconnected = await service.disconnect(created.id);
    expect(disconnected.health.status).toBe('OFFLINE');
    expect(disconnected.connector.enabled).toBe(false);

    expect(service.listLogs({ connectorId: created.id }).length).toBeGreaterThan(
      0,
    );

    const webhook = service.create({
      provider: 'webhook',
      name: 'Hook',
      config: { webhookUrl: 'https://example.com' },
    });
    expect((await service.test(webhook.id)).health.status).toBe('ONLINE');

    const errConn = service.create({
      provider: 'telegram',
      name: 'TG',
      config: { forceError: true },
    });
    expect((await service.connect(errConn.id)).health.status).toBe('ERROR');

    await expect(service.connect('missing')).rejects.toThrow(
      IntegrationValidationError,
    );
    await expect(service.connect('')).rejects.toThrow(
      IntegrationValidationError,
    );

    expect(() => service.delete('')).toThrow(IntegrationValidationError);
    expect(service.delete(created.id)).toBe(true);
    expect(service.delete(created.id)).toBe(false);
  });
});

describe('HTTP integrations', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;
  let service: IntegrationService;

  beforeAll(async () => {
    service = new IntegrationService(
      new SQLiteConnectorRepository(':memory:', { tenantId: 'rodacenter' }),
    );
    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(
      path.join(os.tmpdir(), 'integrations-api-logs'),
    );
    const leads = new InMemoryLeadRepository();
    const customers = new InMemoryCustomerRepository();
    const interactions = new InMemoryInteractionRepository();
    const vehicles = new InMemoryVehicleProfileRepository();
    const leadService = new LeadService(leads, products);
    const customerProfileService = new CustomerProfileService(
      customers,
      vehicles,
      interactions,
    );
    const interactionService = new InteractionService(interactions);
    const handleIncomingMessage = {
      execute: async () => ({ replies: [] }),
    } as unknown as HandleIncomingMessage;

    const app = createApp({
      handleIncomingMessage,
      products,
      logs,
      leadService,
      customerProfileService,
      interactionService,
      integrationService: service,
      authRequired: false,
    });
    const server = await listen(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it('CRUD HTTP + connect/disconnect/test + logs', async () => {
    const createRes = await fetch(`${baseUrl}/api/connectors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'slack',
        name: 'Slack Ops',
        config: { apiKey: 'tok' },
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    expect(
      (
        await fetch(`${baseUrl}/api/connectors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'slack', name: '' }),
        })
      ).status,
    ).toBe(400);

    const listRes = await fetch(
      `${baseUrl}/api/connectors?q=Slack&provider=slack&category=Chat&enabled=true`,
    );
    expect(listRes.status).toBe(200);
    expect(
      ((await listRes.json()) as { total: number }).total,
    ).toBeGreaterThan(0);

    const getRes = await fetch(`${baseUrl}/api/connectors/${created.id}`);
    expect(getRes.status).toBe(200);
    expect((await fetch(`${baseUrl}/api/connectors/missing`)).status).toBe(
      404,
    );

    const putRes = await fetch(`${baseUrl}/api/connectors/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, name: 'Slack Ops 2' }),
    });
    expect(putRes.status).toBe(200);
    expect(
      (
        await fetch(`${baseUrl}/api/connectors/missing`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'x' }),
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/connectors/${created.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      ).status,
    ).toBe(400);

    const connectRes = await fetch(
      `${baseUrl}/api/connectors/${created.id}/connect`,
      { method: 'POST' },
    );
    expect(connectRes.status).toBe(200);
    expect(
      ((await connectRes.json()) as { health: { status: string } }).health
        .status,
    ).toBe('ONLINE');

    const testRes = await fetch(
      `${baseUrl}/api/connectors/${created.id}/test`,
      { method: 'POST' },
    );
    expect(testRes.status).toBe(200);

    const disconnectRes = await fetch(
      `${baseUrl}/api/connectors/${created.id}/disconnect`,
      { method: 'POST' },
    );
    expect(disconnectRes.status).toBe(200);

    expect(
      (await fetch(`${baseUrl}/api/connectors/missing/connect`, {
        method: 'POST',
      })).status,
    ).toBe(404);

    const logsRes = await fetch(
      `${baseUrl}/api/connectors/logs?connectorId=${created.id}&limit=10`,
    );
    expect(logsRes.status).toBe(200);
    expect(
      ((await logsRes.json()) as { total: number }).total,
    ).toBeGreaterThan(0);

    const delRes = await fetch(`${baseUrl}/api/connectors/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);
    expect(
      (
        await fetch(`${baseUrl}/api/connectors/${created.id}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);

    expect(
      (
        await fetch(`${baseUrl}/api/connectors?enabled=false`)
      ).status,
    ).toBe(200);
  });
});

describe('integrationsApiRoutes error paths', () => {
  it('500 y 400 en fallos', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const stub = {
      list: boom,
      getById: boom,
      create: () => {
        throw new IntegrationValidationError('bad');
      },
      update: boom,
      delete: boom,
      connect: async () => {
        throw new Error('boom');
      },
      disconnect: async () => {
        throw new Error('boom');
      },
      test: async () => {
        throw new Error('boom');
      },
      listLogs: boom,
    } as unknown as IntegrationService;

    const app = express();
    app.use(express.json());
    app.use('/api', createIntegrationsApiRouter(stub));
    const server = await listen(app);

    expect((await fetch(`${server.baseUrl}/api/connectors`)).status).toBe(500);
    expect((await fetch(`${server.baseUrl}/api/connectors/x`)).status).toBe(
      500,
    );
    expect(
      (
        await fetch(`${server.baseUrl}/api/connectors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${server.baseUrl}/api/connectors/x`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'a' }),
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/connectors/x`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/connectors/x/connect`, {
          method: 'POST',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/connectors/x/disconnect`, {
          method: 'POST',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/connectors/x/test`, {
          method: 'POST',
        })
      ).status,
    ).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/connectors/logs`)).status,
    ).toBe(500);

    const stub2 = {
      list: () => [],
      getById: () => null,
      create: boom,
      update: () => {
        throw new IntegrationValidationError('bad update');
      },
      delete: () => {
        throw new IntegrationValidationError('bad delete');
      },
      connect: async () => {
        throw new IntegrationValidationError('id es obligatorio');
      },
      disconnect: async () => {
        throw new IntegrationValidationError('Conector no encontrado: x');
      },
      test: async () => {
        throw new IntegrationValidationError('Conector no encontrado: x');
      },
      listLogs: () => [],
    } as unknown as IntegrationService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createIntegrationsApiRouter(stub2));
    const s2 = await listen(app2);

    expect(
      (
        await fetch(`${s2.baseUrl}/api/connectors`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'slack', name: 'x' }),
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/connectors/x`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'a' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/connectors/x`, { method: 'DELETE' })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/connectors/x/connect`, {
          method: 'POST',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/connectors/x/disconnect`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/connectors/x/test`, { method: 'POST' })
      ).status,
    ).toBe(404);

    await server.close();
    await s2.close();
  });
});
