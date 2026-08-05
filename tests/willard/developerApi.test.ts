import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DeveloperService,
  DeveloperValidationError,
} from '../../src/application/services/DeveloperService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  isApiKeyPermission,
  isSdkLanguage,
  keyPrefixFromSecret,
  normalizePermissions,
} from '../../src/domain/dashboard/developerDto';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import {
  SQLiteApiKeyRepository,
  generateApiKeySecret,
  hashApiKeySecret,
} from '../../src/infrastructure/persistence/SQLiteApiKeyRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { createDeveloperApiRouter } from '../../src/presentation/http/routes/developerApiRoutes';

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

describe('developerDto helpers', () => {
  it('permisos, idiomas y prefix', () => {
    expect(isApiKeyPermission('read')).toBe(true);
    expect(isApiKeyPermission('x')).toBe(false);
    expect(isSdkLanguage('python')).toBe(true);
    expect(normalizePermissions(undefined)).toEqual(['read']);
    expect(normalizePermissions([])).toEqual(['read']);
    expect(normalizePermissions(['write', 'write', 'bad'])).toEqual(['write']);
    expect(keyPrefixFromSecret('short')).toContain('…');
    expect(keyPrefixFromSecret('rc_live_abcdefghijklmnop')).toMatch(/^rc_live_/);
  });
});

describe('hash helpers', () => {
  it('hash determinístico y secreto único', () => {
    const a = generateApiKeySecret();
    const b = generateApiKeySecret();
    expect(a).not.toBe(b);
    expect(a.startsWith('rc_live_')).toBe(true);
    expect(hashApiKeySecret(a)).toHaveLength(64);
    expect(hashApiKeySecret(a)).toBe(hashApiKeySecret(a));
    expect(hashApiKeySecret(a)).not.toBe(hashApiKeySecret(b));
  });
});

describe('SQLiteApiKeyRepository', () => {
  it('CRUD keys/requests/sdk + tenant isolation + nunca hash', () => {
    const dbPath = tmpDb('dev-keys');
    const a = new SQLiteApiKeyRepository(dbPath, { tenantId: 't-a' });
    const b = new SQLiteApiKeyRepository(dbPath, { tenantId: 't-b' });

    const secret = 'rc_live_test_secret_value_001';
    const key = a.createKey({
      name: 'Prod',
      keyHash: hashApiKeySecret(secret),
      keyPrefix: keyPrefixFromSecret(secret),
      permissions: ['read', 'knowledge'],
    });
    expect(key.keyPrefix).toContain('…');
    expect(a.getKeyHashById(key.id)).toBe(hashApiKeySecret(secret));
    expect(JSON.stringify(a.listKeys())).not.toContain(secret);
    expect(b.getKeyById(key.id)).toBeNull();
    expect(b.listKeys()).toHaveLength(0);

    expect(a.findKeyByHash(hashApiKeySecret(secret))?.id).toBe(key.id);
    a.touchLastUsed(key.id);
    expect(a.getKeyById(key.id)?.lastUsedAt).toBeTruthy();

    const updated = a.updateKey(key.id, {
      name: 'Prod 2',
      enabled: false,
      permissions: ['admin'],
    });
    expect(updated?.name).toBe('Prod 2');
    expect(updated?.enabled).toBe(false);
    expect(a.updateKey('missing', { name: 'x' })).toBeNull();

    const req = a.appendRequest({
      apiKeyId: key.id,
      endpoint: '/api/knowledge',
      method: 'GET',
      status: 200,
      latencyMs: 12,
    });
    expect(a.listRequests({ apiKeyId: key.id })).toHaveLength(1);
    expect(a.listRequests({ limit: 10 })[0]?.id).toBe(req.id);
    expect(b.listRequests()).toHaveLength(0);

    expect(a.listSdkTokens().length).toBeGreaterThanOrEqual(8);
    expect(b.listSdkTokens().length).toBeGreaterThanOrEqual(8);

    expect(a.deleteKey(key.id)).toBe(true);
    expect(a.getKeyById(key.id)).toBeNull();
    expect(a.listRequests({ apiKeyId: key.id })).toHaveLength(0);
    expect(a.deleteKey(key.id)).toBe(false);

    expect(fs.existsSync(dbPath)).toBe(true);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('tenant ALS', () => {
    const repo = new SQLiteApiKeyRepository(':memory:');
    runWithTenant('als-dev', () => {
      const key = repo.createKey({
        name: 'ALS',
        keyHash: hashApiKeySecret('x'),
        keyPrefix: 'x…',
        permissions: ['read'],
      });
      expect(key.tenantId).toBe('als-dev');
    });
  });
});

describe('DeveloperService', () => {
  it('create/update/rotate/verify/requests/stats/sdk', () => {
    const service = new DeveloperService(
      new SQLiteApiKeyRepository(':memory:', { tenantId: 'rodacenter' }),
    );

    expect(() => service.createKey({ name: '' })).toThrow(
      DeveloperValidationError,
    );
    expect(() =>
      service.createKey({ name: 'x', permissions: ['nope'] }),
    ).toThrow(DeveloperValidationError);

    const created = service.createKey({
      name: 'Integrador',
      permissions: ['read', 'automation'],
    });
    expect(created.secret.startsWith('rc_live_')).toBe(true);
    expect(service.listKeys()).toHaveLength(1);
    expect(service.getKey(created.key.id)?.name).toBe('Integrador');

    // hash only — secret never stored in list
    expect(JSON.stringify(service.listKeys())).not.toContain(created.secret);

    const verified = service.verifySecret(created.secret);
    expect(verified?.id).toBe(created.key.id);
    expect(service.verifySecret('wrong')).toBeNull();
    expect(service.verifySecret('')).toBeNull();

    expect(() => service.updateKey('', { name: 'x' })).toThrow(
      DeveloperValidationError,
    );
    expect(() => service.updateKey(created.key.id, {})).toThrow(
      DeveloperValidationError,
    );
    expect(() =>
      service.updateKey(created.key.id, { name: '  ' }),
    ).toThrow(DeveloperValidationError);

    const updated = service.updateKey(created.key.id, {
      name: 'Integrador 2',
      permissions: ['write'],
      enabled: true,
    });
    expect(updated?.permissions).toEqual(['write']);
    expect(service.updateKey('missing', { name: 'x' })).toBeNull();

    service.updateKey(created.key.id, { enabled: false });
    expect(service.verifySecret(created.secret)).toBeNull();
    service.updateKey(created.key.id, { enabled: true });

    const rotated = service.rotateKey(created.key.id);
    expect(rotated.secret).not.toBe(created.secret);
    expect(service.verifySecret(created.secret)).toBeNull();
    expect(service.verifySecret(rotated.secret)?.id).toBe(created.key.id);

    expect(() => service.rotateKey('missing')).toThrow(
      DeveloperValidationError,
    );
    expect(() => service.rotateKey('')).toThrow(DeveloperValidationError);

    const req = service.recordRequest({
      apiKeyId: created.key.id,
      endpoint: '/api/knowledge',
      method: 'get',
      status: 200,
      latencyMs: 15,
    });
    expect(req.method).toBe('GET');
    service.recordRequest({
      apiKeyId: created.key.id,
      endpoint: '/api/knowledge',
      method: 'GET',
      status: 500,
      latencyMs: 40,
    });
    service.recordRequest({
      apiKeyId: created.key.id,
      endpoint: '/api/workflows',
      method: 'POST',
      status: 201,
      latencyMs: 20,
    });

    expect(() =>
      service.recordRequest({
        apiKeyId: '',
        endpoint: '/x',
        method: 'GET',
        status: 200,
        latencyMs: 1,
      }),
    ).toThrow(DeveloperValidationError);
    expect(() =>
      service.recordRequest({
        apiKeyId: created.key.id,
        endpoint: '',
        method: 'GET',
        status: 200,
        latencyMs: 1,
      }),
    ).toThrow(DeveloperValidationError);
    expect(() =>
      service.recordRequest({
        apiKeyId: 'missing',
        endpoint: '/x',
        method: 'GET',
        status: 200,
        latencyMs: 1,
      }),
    ).toThrow(DeveloperValidationError);

    const stats = service.getUsageStats();
    expect(stats.totalRequests).toBe(3);
    expect(stats.errorCount).toBe(1);
    expect(stats.byEndpoint.length).toBeGreaterThan(0);
    expect(stats.byApiKey[0]?.apiKeyId).toBe(created.key.id);
    expect(service.getUsageStats(0).totalRequests).toBeGreaterThanOrEqual(0);

    const sdk = service.getSdkCatalog();
    expect(sdk.sdks.length).toBeGreaterThanOrEqual(8);
    expect(sdk.examples.some((e) => e.language === 'curl')).toBe(true);
    expect(sdk.permissions).toContain('copilot');

    expect(() => service.deleteKey('')).toThrow(DeveloperValidationError);
    expect(service.deleteKey(created.key.id)).toBe(true);
    expect(service.deleteKey(created.key.id)).toBe(false);
  });
});

describe('HTTP developer', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;
  let service: DeveloperService;

  beforeAll(async () => {
    service = new DeveloperService(
      new SQLiteApiKeyRepository(':memory:', { tenantId: 'rodacenter' }),
    );
    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(
      path.join(os.tmpdir(), 'developer-api-logs'),
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
      developerService: service,
      authRequired: false,
    });
    const server = await listen(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it('CRUD HTTP + rotate + requests + sdk', async () => {
    const createRes = await fetch(`${baseUrl}/api/developer/keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'CI Key',
        permissions: ['read', 'marketplace'],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      key: { id: string };
      secret: string;
    };
    expect(created.secret).toBeTruthy();

    expect(
      (
        await fetch(`${baseUrl}/api/developer/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '' }),
        })
      ).status,
    ).toBe(400);

    const listRes = await fetch(`${baseUrl}/api/developer/keys`);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { total: number; keys: unknown[] };
    expect(listed.total).toBeGreaterThan(0);
    expect(JSON.stringify(listed)).not.toContain(created.secret);

    const putRes = await fetch(
      `${baseUrl}/api/developer/keys/${created.key.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true, name: 'CI Key 2' }),
      },
    );
    expect(putRes.status).toBe(200);
    expect(
      (
        await fetch(`${baseUrl}/api/developer/keys/missing`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'x' }),
        })
      ).status,
    ).toBe(404);

    const rotateRes = await fetch(
      `${baseUrl}/api/developer/keys/${created.key.id}/rotate`,
      { method: 'POST' },
    );
    expect(rotateRes.status).toBe(200);
    const rotated = (await rotateRes.json()) as { secret: string };
    expect(rotated.secret).not.toBe(created.secret);

    expect(
      (
        await fetch(`${baseUrl}/api/developer/keys/missing/rotate`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);

    service.recordRequest({
      apiKeyId: created.key.id,
      endpoint: '/api/developer/keys',
      method: 'GET',
      status: 200,
      latencyMs: 8,
    });

    const reqRes = await fetch(
      `${baseUrl}/api/developer/requests?apiKeyId=${created.key.id}&limit=10`,
    );
    expect(reqRes.status).toBe(200);
    const reqBody = (await reqRes.json()) as {
      total: number;
      usage: { totalRequests: number };
    };
    expect(reqBody.total).toBeGreaterThan(0);
    expect(reqBody.usage.totalRequests).toBeGreaterThan(0);

    const sdkRes = await fetch(`${baseUrl}/api/developer/sdk`);
    expect(sdkRes.status).toBe(200);
    expect(
      ((await sdkRes.json()) as { sdks: unknown[] }).sdks.length,
    ).toBeGreaterThan(0);

    const delRes = await fetch(
      `${baseUrl}/api/developer/keys/${created.key.id}`,
      { method: 'DELETE' },
    );
    expect(delRes.status).toBe(204);
    expect(
      (
        await fetch(`${baseUrl}/api/developer/keys/${created.key.id}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
  });
});

describe('developerApiRoutes error paths', () => {
  it('500 y 400', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const stub = {
      listKeys: boom,
      createKey: () => {
        throw new DeveloperValidationError('bad');
      },
      updateKey: boom,
      deleteKey: boom,
      rotateKey: async () => {
        throw new Error('boom');
      },
      listRequests: boom,
      getUsageStats: boom,
      getSdkCatalog: boom,
    } as unknown as DeveloperService;

    // rotate is sync in real service
    const stubSync = {
      ...stub,
      rotateKey: () => {
        throw new Error('boom');
      },
    } as unknown as DeveloperService;

    const app = express();
    app.use(express.json());
    app.use('/api', createDeveloperApiRouter(stubSync));
    const server = await listen(app);

    expect(
      (await fetch(`${server.baseUrl}/api/developer/keys`)).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/developer/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${server.baseUrl}/api/developer/keys/x`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'a' }),
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/developer/keys/x`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/developer/keys/x/rotate`, {
          method: 'POST',
        })
      ).status,
    ).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/developer/requests`)).status,
    ).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/developer/sdk`)).status,
    ).toBe(500);

    const stub2 = {
      listKeys: () => [],
      createKey: boom,
      updateKey: () => {
        throw new DeveloperValidationError('bad');
      },
      deleteKey: () => {
        throw new DeveloperValidationError('id es obligatorio');
      },
      rotateKey: () => {
        throw new DeveloperValidationError('id es obligatorio');
      },
      listRequests: () => [],
      getUsageStats: () => ({
        totalRequests: 0,
        errorCount: 0,
        avgLatencyMs: 0,
        byEndpoint: [],
        byApiKey: [],
      }),
      getSdkCatalog: boom,
    } as unknown as DeveloperService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createDeveloperApiRouter(stub2));
    const s2 = await listen(app2);

    expect(
      (
        await fetch(`${s2.baseUrl}/api/developer/keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'x' }),
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/developer/keys/x`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'a' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/developer/keys/x`, { method: 'DELETE' })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/developer/keys/x/rotate`, {
          method: 'POST',
        })
      ).status,
    ).toBe(400);
    expect((await fetch(`${s2.baseUrl}/api/developer/sdk`)).status).toBe(500);

    await server.close();
    await s2.close();
  });
});
