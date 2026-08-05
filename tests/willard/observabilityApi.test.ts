import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ObservabilityService,
  ObservabilityValidationError,
} from '../../src/application/services/ObservabilityService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  aggregateHealthStatus,
  formatUptime,
  isAuditAction,
  isMonitoredComponent,
  isObservabilityHealthStatus,
  isObservabilityLogLevel,
  isObservabilityMetricName,
} from '../../src/domain/dashboard/observabilityDto';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteObservabilityRepository } from '../../src/infrastructure/persistence/SQLiteObservabilityRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { createObservabilityApiRouter } from '../../src/presentation/http/routes/observabilityApiRoutes';

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

describe('observabilityDto helpers', () => {
  it('valida enums, agrega health y formatea uptime', () => {
    expect(isObservabilityHealthStatus('ONLINE')).toBe(true);
    expect(isObservabilityHealthStatus('X')).toBe(false);
    expect(isObservabilityLogLevel('error')).toBe(true);
    expect(isMonitoredComponent('SQLite')).toBe(true);
    expect(isObservabilityMetricName('conversations')).toBe(true);
    expect(isAuditAction('login')).toBe(true);
    expect(aggregateHealthStatus([])).toBe('OFFLINE');
    expect(aggregateHealthStatus(['ONLINE', 'ONLINE'])).toBe('ONLINE');
    expect(aggregateHealthStatus(['ONLINE', 'DEGRADED'])).toBe('DEGRADED');
    expect(aggregateHealthStatus(['ONLINE', 'OFFLINE'])).toBe('DEGRADED');
    expect(aggregateHealthStatus(['ONLINE', 'ERROR'])).toBe('ERROR');
    expect(formatUptime(500)).toMatch(/s$/);
    expect(formatUptime(90_000)).toMatch(/m/);
    expect(formatUptime(3_700_000)).toMatch(/h/);
    expect(formatUptime(90_000_000)).toMatch(/d/);
  });
});

describe('SQLiteObservabilityRepository', () => {
  it('CRUD logs/audit/metrics/health + tenant isolation', () => {
    const dbPath = tmpDb('obs');
    const a = new SQLiteObservabilityRepository(dbPath, { tenantId: 't-a' });
    const b = new SQLiteObservabilityRepository(dbPath, { tenantId: 't-b' });

    const log = a.appendSystemLog({
      level: 'error',
      module: 'HTTP',
      event: 'request_failed',
      message: 'boom',
      metadata: { code: 500 },
    });
    expect(log.level).toBe('error');
    a.appendSystemLog({
      level: 'nope' as never,
      module: 'X',
      event: 'e',
      message: 'm',
    });
    expect(a.listSystemLogs({ level: 'error' })).toHaveLength(1);
    expect(a.listSystemLogs({ module: 'HTTP' })).toHaveLength(1);
    expect(a.listSystemLogs({ q: 'boom' })).toHaveLength(1);
    expect(b.listSystemLogs()).toHaveLength(0);

    const from = new Date(Date.now() - 60_000).toISOString();
    const to = new Date(Date.now() + 60_000).toISOString();
    expect(a.listSystemLogs({ from, to }).length).toBeGreaterThan(0);
    expect(a.countSystemLogs()).toBeGreaterThan(0);

    const audit = a.appendAuditLog({
      userId: 'u1',
      action: 'login',
      resource: 'auth',
      resourceId: 'sess',
      oldValue: { a: 1 },
      newValue: { b: 2 },
    });
    expect(audit.userId).toBe('u1');
    expect(a.listAuditLogs({ userId: 'u1', action: 'login' })).toHaveLength(1);
    expect(a.listAuditLogs({ resource: 'auth' })).toHaveLength(1);
    expect(b.listAuditLogs()).toHaveLength(0);
    expect(a.countAuditLogs()).toBeGreaterThan(0);

    const h1 = a.upsertHealthCheck({
      component: 'SQLite',
      status: 'ONLINE',
      latencyMs: 2,
      details: { ok: true },
    });
    const h2 = a.upsertHealthCheck({
      component: 'SQLite',
      status: 'DEGRADED',
      latencyMs: 5,
    });
    expect(h2.id).toBe(h1.id);
    expect(a.listHealthChecks()).toHaveLength(1);
    expect(a.getLatestHealthByComponent()[0]?.status).toBe('DEGRADED');

    const metric = a.recordMetric({
      metric: 'conversations',
      value: 10,
      unit: 'count',
    });
    expect(metric.value).toBe(10);
    a.recordMetric({ metric: 'conversations', value: 12 });
    expect(a.listMetrics({ metric: 'conversations' }).length).toBeGreaterThan(0);
    expect(a.latestMetricsByName().some((m) => m.metric === 'conversations')).toBe(
      true,
    );
    expect(a.countMetrics()).toBeGreaterThan(0);
    expect(b.listMetrics()).toHaveLength(0);

    expect(a.ping().ok).toBe(true);
    expect(fs.existsSync(dbPath)).toBe(true);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('respeta tenant ALS', () => {
    const repo = new SQLiteObservabilityRepository(':memory:');
    runWithTenant('als-obs', () => {
      const log = repo.appendSystemLog({
        level: 'info',
        module: 'M',
        event: 'e',
        message: 'hola',
      });
      expect(log.tenantId).toBe('als-obs');
    });
  });
});

describe('ObservabilityService', () => {
  it('health check, overview, recorders y probes', () => {
    const repo = new SQLiteObservabilityRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const service = new ObservabilityService(
      repo,
      {
        knowledge: { list: () => ({ items: [1, 2] }) },
        automation: { list: () => [1] },
        workflow: { list: () => [] },
        marketplace: { listTemplates: () => [{ id: 't' }] },
        billing: { listPlans: () => [{ id: 'free' }] },
        integration: { list: () => [{ id: 'c' }] },
        copilot: { listHistory: () => ({ sessions: [], templates: [] }) },
        eventBus: { emit: () => undefined },
        aiProvider: {},
      },
      { startedAt: Date.now() - 5_000 },
    );

    expect(() =>
      service.recordLog({ level: 'info', module: '', event: 'e', message: 'm' }),
    ).toThrow(ObservabilityValidationError);
    expect(() =>
      service.recordAudit({ action: '', resource: 'x' }),
    ).toThrow(ObservabilityValidationError);
    expect(() => service.recordMetric({ metric: '', value: 1 })).toThrow(
      ObservabilityValidationError,
    );
    expect(() =>
      service.recordMetric({ metric: 'x', value: Number.NaN }),
    ).toThrow(ObservabilityValidationError);

    service.recordLog({
      level: 'error',
      module: 'HTTP',
      event: 'fail',
      message: 'err',
    });
    service.recordAudit({
      action: 'create',
      resource: 'knowledge',
      userId: 'u1',
    });
    service.recordMetric({ metric: 'ai_queries', value: 3, unit: 'count' });

    const check = service.runHealthCheck();
    expect(check.components.length).toBeGreaterThan(10);
    expect(check.status).toBe('ONLINE');
    expect(service.getHealth().components.length).toBeGreaterThan(0);

    const overview = service.getSystemOverview();
    expect(overview.uptimeMs).toBeGreaterThan(0);
    expect(overview.memory.heapUsedMb).toBeGreaterThan(0);
    expect(overview.cpu.available).toBe(true);
    expect(overview.recentErrors.length).toBeGreaterThan(0);
    expect(service.listLogs({ level: 'info' }).length).toBeGreaterThan(0);
    expect(service.listAudit().length).toBeGreaterThan(0);
    expect(service.listMetrics({ metric: 'memory_mb' }).length).toBeGreaterThan(
      0,
    );

    // probes degradados sin deps
    const bare = new ObservabilityService(repo, {});
    const degraded = bare.runHealthCheck();
    expect(
      degraded.components.some(
        (c) => c.component === 'Knowledge' && c.status === 'DEGRADED',
      ),
    ).toBe(true);

    // probe ERROR
    const boomService = new ObservabilityService(repo, {
      knowledge: {
        list: () => {
          throw new Error('kb down');
        },
      },
    });
    const errored = boomService.runHealthCheck();
    expect(
      errored.components.some(
        (c) => c.component === 'Knowledge' && c.status === 'ERROR',
      ),
    ).toBe(true);
  });
});

describe('HTTP observability', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    const service = new ObservabilityService(
      new SQLiteObservabilityRepository(':memory:', { tenantId: 'rodacenter' }),
      {
        eventBus: {},
        aiProvider: {},
        knowledge: { list: () => ({ items: [] }) },
        automation: { list: () => [] },
        workflow: { list: () => [] },
        marketplace: { listTemplates: () => [] },
        billing: { listPlans: () => [] },
        integration: { list: () => [] },
        copilot: { listHistory: () => ({ sessions: [], templates: [] }) },
      },
    );
    service.runHealthCheck();

    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(
      path.join(os.tmpdir(), 'obs-api-logs'),
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
      observabilityService: service,
      authRequired: false,
    });
    const server = await listen(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it('endpoints health/logs/audit/metrics/system/check', async () => {
    const healthRes = await fetch(`${baseUrl}/api/observability/health`);
    expect(healthRes.status).toBe(200);
    expect(
      ((await healthRes.json()) as { components: unknown[] }).components
        .length,
    ).toBeGreaterThan(0);

    const checkRes = await fetch(`${baseUrl}/api/observability/health/check`, {
      method: 'POST',
    });
    expect(checkRes.status).toBe(200);

    const logsRes = await fetch(
      `${baseUrl}/api/observability/logs?level=info&limit=10`,
    );
    expect(logsRes.status).toBe(200);

    const auditRes = await fetch(
      `${baseUrl}/api/observability/audit?action=health_check&limit=10`,
    );
    expect(auditRes.status).toBe(200);
    expect(
      ((await auditRes.json()) as { total: number }).total,
    ).toBeGreaterThan(0);

    const metricsRes = await fetch(
      `${baseUrl}/api/observability/metrics?metric=memory_mb`,
    );
    expect(metricsRes.status).toBe(200);

    const systemRes = await fetch(`${baseUrl}/api/observability/system`);
    expect(systemRes.status).toBe(200);
    const system = (await systemRes.json()) as {
      status: string;
      memory: { heapUsedMb: number };
    };
    expect(system.memory.heapUsedMb).toBeGreaterThan(0);
  });
});

describe('observabilityApiRoutes error paths', () => {
  it('500 en fallos', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const stub = {
      getHealth: boom,
      runHealthCheck: boom,
      listLogs: boom,
      listAudit: boom,
      listMetrics: boom,
      getSystemOverview: boom,
    } as unknown as ObservabilityService;

    const app = express();
    app.use(express.json());
    app.use('/api', createObservabilityApiRouter(stub));
    const server = await listen(app);

    expect(
      (await fetch(`${server.baseUrl}/api/observability/health`)).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/observability/health/check`, {
          method: 'POST',
        })
      ).status,
    ).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/observability/logs`)).status,
    ).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/observability/audit`)).status,
    ).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/observability/metrics`)).status,
    ).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/observability/system`)).status,
    ).toBe(500);

    const stub2 = {
      getHealth: () => ({ status: 'ONLINE', components: [] }),
      runHealthCheck: () => {
        throw new ObservabilityValidationError('bad');
      },
      listLogs: () => [],
      listAudit: () => [],
      listMetrics: () => [],
      getSystemOverview: () => ({}),
    } as unknown as ObservabilityService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createObservabilityApiRouter(stub2));
    const s2 = await listen(app2);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/observability/health/check`, {
          method: 'POST',
        })
      ).status,
    ).toBe(400);

    await server.close();
    await s2.close();
  });
});
