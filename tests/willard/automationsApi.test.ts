import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  AutomationService,
  AutomationValidationError,
  matchesCondition,
} from '../../src/application/services/AutomationService';
import { RealtimeService } from '../../src/application/services/RealtimeService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  isAutomationActionType,
  isAutomationConditionField,
  isAutomationTrigger,
} from '../../src/domain/dashboard/automationDto';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteAutomationRepository } from '../../src/infrastructure/persistence/SQLiteAutomationRepository';
import { InMemoryEventBus } from '../../src/infrastructure/realtime/InMemoryEventBus';
import { createApp } from '../../src/presentation/http/createApp';
import { createAutomationsApiRouter } from '../../src/presentation/http/routes/automationsApiRoutes';

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

describe('automationDto helpers', () => {
  it('valida triggers, campos y acciones', () => {
    expect(isAutomationTrigger('conversation.created')).toBe(true);
    expect(isAutomationTrigger('nope')).toBe(false);
    expect(isAutomationConditionField('leadScore')).toBe(true);
    expect(isAutomationConditionField('x')).toBe(false);
    expect(isAutomationActionType('create_task')).toBe(true);
    expect(isAutomationActionType('whatsapp')).toBe(false);
  });
});

describe('matchesCondition', () => {
  it('evalúa numéricos, booleanos y texto', () => {
    expect(matchesCondition(null, {})).toBe(true);
    expect(
      matchesCondition(
        { field: 'leadScore', value: 50 },
        { leadScore: 80 },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { field: 'leadScore', op: '>=', value: 80 },
        { leadScore: 80 },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { field: 'idleMinutes', op: '>', value: 30 },
        { idleMinutes: 10 },
      ),
    ).toBe(false);
    expect(
      matchesCondition(
        { field: 'accepted', value: true },
        { accepted: true },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { field: 'abandoned', op: '!=', value: true },
        { abandoned: false },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { field: 'brand', value: 'renault' },
        { brand: 'RENAULT' },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { field: 'vehicle', op: 'contains', value: 'logan' },
        { vehicle: 'Renault Logan' },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { field: 'salesFlowState', op: '!=', value: 'NEW' },
        { salesFlowState: 'WAITING_CONFIRMATION' },
      ),
    ).toBe(true);
    expect(
      matchesCondition(
        { field: 'leadScore', value: 10 },
        { leadScore: null },
      ),
    ).toBe(false);
  });
});

describe('SQLiteAutomationRepository', () => {
  it('CRUD, duplicate, logs y triggers', () => {
    let n = 0;
    const repo = new SQLiteAutomationRepository(':memory:', {
      tenantId: 'rodacenter',
      now: () => 1_700_000_000_000 + n++,
      idFactory: () => `id-${n}`,
    });

    const created = repo.createRule({
      name: 'Lead alto',
      trigger: 'lead.updated',
      condition: { field: 'leadScore', op: '>', value: 70 },
      action: { type: 'create_task', label: 'Llamar', priority: 'Alta' },
      priority: 10,
    });
    expect(created.trigger).toBe('lead.updated');
    expect(repo.getRule(created.id)?.name).toBe('Lead alto');

    const updated = repo.updateRule(created.id, {
      enabled: false,
      name: 'Lead alto v2',
      action: { type: 'raise_priority', priority: 'Alta' },
    });
    expect(updated?.enabled).toBe(false);
    expect(repo.listEnabledByTrigger('lead.updated')).toHaveLength(0);

    repo.updateRule(created.id, { enabled: true });
    expect(repo.listEnabledByTrigger('lead.updated')).toHaveLength(1);

    const dup = repo.duplicateRule(created.id);
    expect(dup?.name).toContain('copia');
    expect(repo.listRules().length).toBe(2);

    const log = repo.appendLog({
      ruleId: created.id,
      trigger: 'lead.updated',
      result: JSON.stringify({ matched: true, message: 'ok' }),
    });
    expect(repo.listLogs({ ruleId: created.id })[0]?.id).toBe(log.id);
    expect(repo.listLogs({ limit: 1 })).toHaveLength(1);

    expect(repo.deleteRule(created.id)).toBe(true);
    expect(repo.getRule(created.id)).toBeNull();
    expect(repo.updateRule('missing', { name: 'x' })).toBeNull();
    expect(repo.duplicateRule('missing')).toBeNull();
    expect(repo.deleteRule('missing')).toBe(false);

    // trigger inválido → fallback conversation.updated
    const fallback = repo.createRule({
      name: 'X',
      trigger: 'invalid.trigger',
      action: { type: 'bad' as 'record_event' },
    });
    expect(fallback.trigger).toBe('conversation.updated');
    expect(fallback.action.type).toBe('record_event');

    repo.close();
  });

  it('aísla reglas y logs por tenant', () => {
    const shared = tmpDb('auto-iso');
    const a = new SQLiteAutomationRepository(shared, { tenantId: 'tenant-a' });
    const b = new SQLiteAutomationRepository(shared, { tenantId: 'tenant-b' });
    a.createRule({
      name: 'Solo A',
      trigger: 'task.created',
      action: { type: 'add_tag', tag: 'a' },
    });
    expect(a.listRules()).toHaveLength(1);
    expect(b.listRules()).toHaveLength(0);
    a.appendLog({ ruleId: 'r', trigger: 'task.created', result: '{}' });
    expect(a.listLogs()).toHaveLength(1);
    expect(b.listLogs()).toHaveLength(0);
    a.close();
    b.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('AutomationService', () => {
  it('CRUD, evaluación, test y acciones', () => {
    const repo = new SQLiteAutomationRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const service = new AutomationService(repo);

    const rule = service.create({
      name: 'Abandonados',
      trigger: 'conversation.updated',
      condition: { field: 'abandoned', value: true },
      action: { type: 'mark_followup', label: 'Recontactar' },
    });

    const matched = service.evaluateRule(
      rule,
      { abandoned: true },
      { dryRun: false, trigger: rule.trigger },
    );
    expect(matched.matched).toBe(true);
    expect(matched.effects?.followup).toBe(true);

    const miss = service.evaluateRule(
      rule,
      { abandoned: false },
      { dryRun: true, trigger: rule.trigger },
    );
    expect(miss.matched).toBe(false);

    const actions = [
      'create_task',
      'raise_priority',
      'create_notification',
      'add_tag',
      'record_event',
    ] as const;
    for (const type of actions) {
      const r = service.create({
        name: type,
        trigger: 'analytics.updated',
        action: {
          type,
          label: 'L',
          tag: 't',
          eventName: 'e',
          priority: 'Alta',
        },
      });
      const detail = service.evaluateRule(
        r,
        { conversationId: 'c1' },
        { dryRun: false, trigger: 'analytics.updated' },
      );
      expect(detail.matched).toBe(true);
    }

    const test = service.test({
      trigger: 'conversation.updated',
      ruleId: rule.id,
      dryRun: true,
      context: { abandoned: true },
    });
    expect(test.matched).toBe(1);
    expect(service.listLogs({ ruleId: rule.id }).length).toBeGreaterThan(0);

    expect(service.duplicate(rule.id)?.name).toContain('copia');
    expect(service.update(rule.id, { enabled: false })?.enabled).toBe(false);
    expect(service.delete(rule.id)).toBe(true);

    expect(() =>
      service.create({
        name: '',
        trigger: 'conversation.created',
        action: { type: 'add_tag' },
      }),
    ).toThrow(AutomationValidationError);
    expect(() =>
      service.create({
        name: 'x',
        trigger: 'bad',
        action: { type: 'add_tag' },
      }),
    ).toThrow(AutomationValidationError);
    expect(() =>
      service.create({
        name: 'x',
        trigger: 'task.created',
        action: { type: 'nope' as 'add_tag' },
      }),
    ).toThrow(AutomationValidationError);
    expect(() =>
      service.create({
        name: 'x',
        trigger: 'task.created',
        action: { type: 'add_tag' },
        condition: { field: 'nope' as 'brand', value: 'x' },
      }),
    ).toThrow(AutomationValidationError);
    expect(() => service.update('', { name: 'x' })).toThrow(
      AutomationValidationError,
    );
    expect(() => service.update(rule.id, { name: '   ' })).toThrow(
      AutomationValidationError,
    );
    expect(() => service.update(rule.id, { trigger: 'bad' })).toThrow(
      AutomationValidationError,
    );
    expect(() => service.test({ trigger: 'bad' })).toThrow(
      AutomationValidationError,
    );
    expect(() => service.delete('')).toThrow(AutomationValidationError);
    expect(() => service.duplicate('')).toThrow(AutomationValidationError);

    repo.close();
  });

  it('escucha EventBus y aísla tenant', () => {
    const shared = tmpDb('auto-bus');
    const repoA = new SQLiteAutomationRepository(shared, {
      tenantId: 'tenant-a',
    });
    const serviceA = new AutomationService(repoA);
    serviceA.create({
      name: 'Creada',
      trigger: 'conversation.created',
      action: { type: 'create_notification', label: 'Nueva' },
    });

    const bus = new InMemoryEventBus();
    serviceA.start(bus);
    const realtime = new RealtimeService(bus);

    runWithTenant('tenant-a', () => {
      realtime.onTurnCompleted({
        conversationId: 'c1',
        waId: 'wa:1',
        createdConversation: true,
        tenantId: 'tenant-a',
      });
    });

    // onRealtimeEvent usa runWithTenant del payload; repoA tiene tenant fijo
    expect(repoA.listLogs().length).toBeGreaterThan(0);

    const repoB = new SQLiteAutomationRepository(shared, {
      tenantId: 'tenant-b',
    });
    expect(repoB.listLogs()).toHaveLength(0);

    serviceA.stop();
    serviceA.stop();
    repoA.close();
    repoB.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('HTTP /api/automations', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;
  let service: AutomationService;
  let bus: InMemoryEventBus;

  beforeAll(async () => {
    const repo = new SQLiteAutomationRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    service = new AutomationService(repo);
    bus = new InMemoryEventBus();
    service.start(bus);

    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(path.join(os.tmpdir(), 'auto-api-logs'));
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
      automationService: service,
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

  it('CRUD, test, logs y eventos', async () => {
    const createRes = await fetch(`${baseUrl}/api/automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Pipeline notify',
        trigger: 'pipeline.updated',
        condition: { field: 'leadScore', op: '>', value: 50 },
        action: { type: 'create_notification', label: 'Revisar pipeline' },
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const listRes = await fetch(`${baseUrl}/api/automations`);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { total: number };
    expect(listed.total).toBeGreaterThan(0);

    const putRes = await fetch(`${baseUrl}/api/automations/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, priority: 5 }),
    });
    expect(putRes.status).toBe(200);

    const testRes = await fetch(`${baseUrl}/api/automations/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: 'pipeline.updated',
        ruleId: created.id,
        dryRun: true,
        context: { leadScore: 90 },
      }),
    });
    expect(testRes.status).toBe(200);
    expect(((await testRes.json()) as { matched: number }).matched).toBe(1);

    const logsRes = await fetch(
      `${baseUrl}/api/automations/logs?ruleId=${created.id}&limit=10`,
    );
    expect(logsRes.status).toBe(200);
    expect(
      ((await logsRes.json()) as { logs: unknown[] }).logs.length,
    ).toBeGreaterThan(0);

    const dupRes = await fetch(
      `${baseUrl}/api/automations/${created.id}/duplicate`,
      { method: 'POST' },
    );
    expect(dupRes.status).toBe(201);

    bus.publish({
      type: 'pipeline.updated',
      payload: {
        at: new Date().toISOString(),
        tenantId: 'rodacenter',
        leadScore: 99,
      },
    });

    const delRes = await fetch(`${baseUrl}/api/automations/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);

    expect(
      (
        await fetch(`${baseUrl}/api/automations/missing`, { method: 'DELETE' })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/automations/missing`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/automations/missing/duplicate`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);

    const bad = await fetch(`${baseUrl}/api/automations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '', trigger: 'x', action: { type: 'x' } }),
    });
    expect(bad.status).toBe(400);

    const badTest = await fetch(`${baseUrl}/api/automations/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'nope' }),
    });
    expect(badTest.status).toBe(400);
  });
});

describe('automationsApiRoutes error paths', () => {
  it('devuelve 500/400 en fallos', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const validation = () => {
      throw new AutomationValidationError('bad');
    };
    const stub = {
      listLogs: boom,
      test: validation,
      list: boom,
      create: boom,
      duplicate: validation,
      update: validation,
      delete: boom,
    } as unknown as AutomationService;

    const app = express();
    app.use(express.json());
    app.use('/api/automations', createAutomationsApiRouter(stub));
    const server = await listen(app);

    const calls: Array<[string, RequestInit]> = [
      ['/api/automations/logs', {}],
      [
        '/api/automations/test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      ],
      ['/api/automations', {}],
      [
        '/api/automations',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      ],
      ['/api/automations/x/duplicate', { method: 'POST' }],
      [
        '/api/automations/x',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      ],
      ['/api/automations/x', { method: 'DELETE' }],
    ];

    for (const [url, init] of calls) {
      const res = await fetch(`${server.baseUrl}${url}`, init);
      expect([400, 500]).toContain(res.status);
    }

    // 500 en update/duplicate cuando no es validation
    const stub2 = {
      listLogs: () => [],
      test: boom,
      list: () => [],
      create: validation,
      duplicate: boom,
      update: boom,
      delete: validation,
    } as unknown as AutomationService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/automations', createAutomationsApiRouter(stub2));
    const s2 = await listen(app2);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/automations/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(500);
    expect(
      (await fetch(`${s2.baseUrl}/api/automations/x/duplicate`, { method: 'POST' }))
        .status,
    ).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/automations/x`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(500);
    expect(
      (await fetch(`${s2.baseUrl}/api/automations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })).status,
    ).toBe(400);

    await server.close();
    await s2.close();
    void vi;
  });
});
