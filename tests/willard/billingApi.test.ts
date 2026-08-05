import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BillingService,
  BillingValidationError,
} from '../../src/application/services/BillingService';
import { RealtimeService } from '../../src/application/services/RealtimeService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  currentBillingPeriod,
  defaultPlanLimits,
  isBillingMetric,
  isBillingPlanId,
} from '../../src/domain/dashboard/billingDto';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteBillingRepository } from '../../src/infrastructure/persistence/SQLiteBillingRepository';
import { InMemoryEventBus } from '../../src/infrastructure/realtime/InMemoryEventBus';
import { createApp } from '../../src/presentation/http/createApp';
import { createBillingApiRouter } from '../../src/presentation/http/routes/billingApiRoutes';

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

describe('billingDto helpers', () => {
  it('valida métricas, planes y límites seed', () => {
    expect(isBillingMetric('conversations')).toBe(true);
    expect(isBillingMetric('x')).toBe(false);
    expect(isBillingPlanId('PRO')).toBe(true);
    expect(isBillingPlanId('GOLD')).toBe(false);
    expect(currentBillingPeriod(new Date('2026-08-03T00:00:00Z'))).toBe(
      '2026-08',
    );
    expect(defaultPlanLimits('FREE').automations).toBe(3);
    expect(defaultPlanLimits('ENTERPRISE').users).toBe(-1);
    expect(defaultPlanLimits('STARTER').workflows).toBe(5);
    expect(defaultPlanLimits('PRO').integrations).toBe(10);
  });
});

describe('SQLiteBillingRepository', () => {
  it('planes, suscripción, uso y eventos', () => {
    let n = 0;
    let ids = 0;
    const repo = new SQLiteBillingRepository(':memory:', {
      tenantId: 'rodacenter',
      now: () => Date.UTC(2026, 7, 3, 12) + n++,
      idFactory: () => `b-${++ids}`,
    });

    expect(repo.listPlans()).toHaveLength(4);
    expect(repo.getPlan('STARTER')?.monthlyPrice).toBe(49);
    expect(repo.getPlan('missing')).toBeNull();

    const sub = repo.getSubscription();
    expect(sub.planId).toBe('FREE');
    expect(sub.status).toBe('trialing');
    expect(repo.getSubscription().id).toBe(sub.id);

    const upgraded = repo.updateSubscription({
      planId: 'PRO',
      billingCycle: 'annual',
    });
    expect(upgraded.planId).toBe('PRO');
    expect(upgraded.status).toBe('active');

    const canceled = repo.updateSubscription({ cancel: true });
    expect(canceled.status).toBe('canceled');
    expect(canceled.cancelDate).toBeTruthy();

    const reactivated = repo.updateSubscription({ reactivate: true });
    expect(reactivated.status).toBe('active');
    expect(reactivated.cancelDate).toBeNull();

    const usage = repo.registerUsage('conversations', 10);
    expect(usage.value).toBe(10);
    expect(repo.registerUsage('conversations', 5).value).toBe(15);
    expect(repo.getUsage('2026-08').some((u) => u.metric === 'conversations')).toBe(
      true,
    );

    const ev = repo.appendEvent('test.event', { ok: true });
    expect(repo.listEvents(10)[0]?.id).toBe(ev.id);

    expect(() => repo.updateSubscription({ planId: 'NOPE' })).toThrow(/Plan/);

    repo.close();
  });

  it('aísla suscripción y uso por tenant', () => {
    const shared = tmpDb('bill-iso');
    const a = new SQLiteBillingRepository(shared, { tenantId: 'tenant-a' });
    const b = new SQLiteBillingRepository(shared, { tenantId: 'tenant-b' });
    a.updateSubscription({ planId: 'STARTER' });
    a.registerUsage('automations', 3);
    expect(a.getSubscription().planId).toBe('STARTER');
    expect(b.getSubscription().planId).toBe('FREE');
    expect(b.getUsage()).toHaveLength(0);
    a.close();
    b.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('BillingService', () => {
  it('límites, warnings, change plan y EventBus', () => {
    const repo = new SQLiteBillingRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const service = new BillingService(repo);

    expect(service.listPlans()).toHaveLength(4);
    expect(service.getPlan().id).toBe('FREE');
    expect(service.getSubscription().planId).toBe('FREE');

    // FREE conversations=100 → warning at 80+
    service.registerUsage('conversations', 85);
    const usage = service.getUsage();
    expect(usage.warnings.some((w) => w.level === 'warning')).toBe(true);

    service.registerUsage('conversations', 30);
    expect(
      service.validateLimit('conversations').warning?.level,
    ).toBe('exceeded');
    expect(service.validateLimit('conversations').allowed).toBe(false);

    // integrations limit 0 on FREE
    service.registerUsage('integrations', 1);
    expect(service.validateLimit('integrations').warning?.level).toBe(
      'exceeded',
    );

    const changed = service.updateSubscription({
      planId: 'ENTERPRISE',
      billingCycle: 'monthly',
    });
    expect(changed.planId).toBe('ENTERPRISE');
    expect(service.validateLimit('conversations').allowed).toBe(true);
    expect(service.validateLimit('conversations').remaining).toBe(-1);

    service.updateSubscription({ cancel: true });
    service.updateSubscription({ reactivate: true });
    service.updateSubscription({ status: 'past_due' });

    expect(service.listEvents().length).toBeGreaterThan(0);
    expect(service.getBillingOverview().plan.id).toBe('ENTERPRISE');

    expect(() => service.validateLimit('nope')).toThrow(BillingValidationError);
    expect(() => service.registerUsage('nope')).toThrow(BillingValidationError);
    expect(() => service.updateSubscription({ planId: '  ' })).toThrow(
      BillingValidationError,
    );
    expect(() => service.updateSubscription({ planId: 'NOPE' })).toThrow(
      BillingValidationError,
    );
    expect(() => service.getPlan('MISSING')).toThrow(BillingValidationError);

    const bus = new InMemoryEventBus();
    service.start(bus);
    const realtime = new RealtimeService(bus);
    const before = service.getUsage().byMetric.conversations ?? 0;
    realtime.onTurnCompleted({
      conversationId: 'c1',
      waId: 'wa:1',
      createdConversation: true,
      tenantId: 'rodacenter',
    });
    expect(service.getUsage().byMetric.conversations ?? 0).toBeGreaterThan(
      before,
    );
    service.stop();
    service.stop();

    repo.close();
  });
});

describe('HTTP billing endpoints', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;
  let service: BillingService;

  beforeAll(async () => {
    const repo = new SQLiteBillingRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    service = new BillingService(repo);
    const bus = new InMemoryEventBus();
    service.start(bus);

    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(path.join(os.tmpdir(), 'bill-api-logs'));
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
      billingService: service,
      eventBus: bus,
      authRequired: false,
    });
    const server = await listen(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterAll(async () => {
    service.stop();
    await close();
  });

  it('plans, subscription, usage, events y registro', async () => {
    const plansRes = await fetch(`${baseUrl}/api/plans`);
    expect(plansRes.status).toBe(200);
    expect(((await plansRes.json()) as { total: number }).total).toBe(4);

    const subRes = await fetch(`${baseUrl}/api/subscription`);
    expect(subRes.status).toBe(200);
    const overview = (await subRes.json()) as {
      subscription: { planId: string };
      plan: { id: string };
    };
    expect(overview.subscription.planId).toBe('FREE');

    const putRes = await fetch(`${baseUrl}/api/subscription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'STARTER', billingCycle: 'monthly' }),
    });
    expect(putRes.status).toBe(200);
    expect(
      ((await putRes.json()) as { subscription: { planId: string } })
        .subscription.planId,
    ).toBe('STARTER');

    const usagePost = await fetch(`${baseUrl}/api/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: 'workflows', delta: 2 }),
    });
    expect(usagePost.status).toBe(201);

    const usageGet = await fetch(`${baseUrl}/api/usage`);
    expect(usageGet.status).toBe(200);
    expect(
      ((await usageGet.json()) as { byMetric: { workflows?: number } }).byMetric
        .workflows,
    ).toBe(2);

    const eventsRes = await fetch(`${baseUrl}/api/billing/events?limit=10`);
    expect(eventsRes.status).toBe(200);
    expect(
      ((await eventsRes.json()) as { events: unknown[] }).events.length,
    ).toBeGreaterThan(0);

    const cancelRes = await fetch(`${baseUrl}/api/subscription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancel: true }),
    });
    expect(cancelRes.status).toBe(200);

    const bad = await fetch(`${baseUrl}/api/subscription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'NOPE' }),
    });
    expect(bad.status).toBe(400);

    const badUsage = await fetch(`${baseUrl}/api/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric: 'bad' }),
    });
    expect(badUsage.status).toBe(400);
  });
});

describe('billingApiRoutes error paths', () => {
  it('500/400 en fallos', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const validation = () => {
      throw new BillingValidationError('bad');
    };
    const stub = {
      listPlans: boom,
      getBillingOverview: boom,
      updateSubscription: validation,
      getUsage: boom,
      listEvents: boom,
      registerUsage: validation,
      getPlan: () => ({ id: 'FREE' }),
    } as unknown as BillingService;

    const app = express();
    app.use(express.json());
    app.use('/api', createBillingApiRouter(stub));
    const server = await listen(app);

    expect((await fetch(`${server.baseUrl}/api/plans`)).status).toBe(500);
    expect((await fetch(`${server.baseUrl}/api/subscription`)).status).toBe(
      500,
    );
    expect((await fetch(`${server.baseUrl}/api/usage`)).status).toBe(500);
    expect(
      (await fetch(`${server.baseUrl}/api/billing/events`)).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${server.baseUrl}/api/subscription`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${server.baseUrl}/api/usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(400);

    const stub2 = {
      listPlans: () => [],
      getBillingOverview: () => ({}),
      updateSubscription: boom,
      getUsage: () => ({ period: 'x', metrics: [], byMetric: {}, warnings: [] }),
      listEvents: () => [],
      registerUsage: boom,
      getPlan: () => ({ id: 'FREE' }),
    } as unknown as BillingService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createBillingApiRouter(stub2));
    const s2 = await listen(app2);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/subscription`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/usage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metric: 'users' }),
        })
      ).status,
    ).toBe(500);

    await server.close();
    await s2.close();
  });
});
