import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutomationService } from '../../src/application/services/AutomationService';
import {
  WorkflowService,
  WorkflowValidationError,
} from '../../src/application/services/WorkflowService';
import { RealtimeService } from '../../src/application/services/RealtimeService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  isWorkflowConditionField,
  isWorkflowNodeType,
  isWorkflowTrigger,
} from '../../src/domain/dashboard/workflowDto';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteAutomationRepository } from '../../src/infrastructure/persistence/SQLiteAutomationRepository';
import { SQLiteWorkflowRepository } from '../../src/infrastructure/persistence/SQLiteWorkflowRepository';
import { InMemoryEventBus } from '../../src/infrastructure/realtime/InMemoryEventBus';
import { createApp } from '../../src/presentation/http/createApp';
import { createWorkflowsApiRouter } from '../../src/presentation/http/routes/workflowsApiRoutes';

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

describe('workflowDto helpers', () => {
  it('valida triggers, nodos y condiciones', () => {
    expect(isWorkflowTrigger('task.created')).toBe(true);
    expect(isWorkflowTrigger('x')).toBe(false);
    expect(isWorkflowNodeType('Condition')).toBe(true);
    expect(isWorkflowNodeType('Foo')).toBe(false);
    expect(isWorkflowConditionField('salesFlow')).toBe(true);
    expect(isWorkflowConditionField('nope')).toBe(false);
  });
});

describe('SQLiteWorkflowRepository', () => {
  it('CRUD, steps, runs y duplicate', () => {
    let n = 0;
    let ids = 0;
    const repo = new SQLiteWorkflowRepository(':memory:', {
      tenantId: 'rodacenter',
      now: () => 1_700_000_000_000 + n++,
      idFactory: () => `id-${++ids}`,
    });

    const created = repo.create({
      name: 'Flujo A',
      description: 'desc',
      trigger: 'pipeline.updated',
    });
    expect(created.steps.length).toBe(2);
    expect(created.graph.edges.length).toBe(1);

    const updated = repo.update(created.id, {
      name: 'Flujo A2',
      enabled: false,
      steps: [
        {
          nodeId: 't1',
          type: 'Trigger',
          config: { event: 'pipeline.updated' },
          positionX: 10,
          positionY: 10,
        },
        {
          nodeId: 'c1',
          type: 'Condition',
          config: { field: 'leadScore', op: '>', value: 50 },
          positionX: 160,
          positionY: 10,
        },
        {
          nodeId: 'end',
          type: 'End',
          config: {},
          positionX: 320,
          positionY: 10,
        },
      ],
      graph: {
        edges: [
          { id: 'e1', source: 't1', target: 'c1' },
          { id: 'e2', source: 'c1', target: 'end', label: 'true' },
          { id: 'e3', source: 'c1', target: 'end', label: 'false' },
        ],
      },
    });
    expect(updated?.name).toBe('Flujo A2');
    expect(updated?.steps).toHaveLength(3);
    expect(repo.listEnabledByTrigger('pipeline.updated')).toHaveLength(0);

    repo.update(created.id, { enabled: true });
    const run = repo.startRun(created.id);
    expect(run.status).toBe('running');
    const finished = repo.finishRun(run.id, 'completed');
    expect(finished?.status).toBe('completed');
    expect(finished?.durationMs).toBeGreaterThanOrEqual(0);
    expect(repo.listRuns({ workflowId: created.id })).toHaveLength(1);

    const dup = repo.duplicate(created.id);
    expect(dup?.name).toContain('copia');
    expect(repo.list().length).toBe(2);

    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeNull();
    expect(repo.update('missing', { name: 'x' })).toBeNull();
    expect(repo.duplicate('missing')).toBeNull();
    expect(repo.finishRun('missing', 'failed')).toBeNull();

    const badTrigger = repo.create({
      name: 'X',
      trigger: 'invalid',
      steps: [{ nodeId: 'n', type: 'Weird', config: {} }],
    });
    expect(badTrigger.trigger).toBe('conversation.updated');
    expect(badTrigger.steps[0]?.type).toBe('End');

    repo.close();
  });

  it('aísla por tenant', () => {
    const shared = tmpDb('wf-iso');
    const a = new SQLiteWorkflowRepository(shared, { tenantId: 'tenant-a' });
    const b = new SQLiteWorkflowRepository(shared, { tenantId: 'tenant-b' });
    a.create({ name: 'Solo A', trigger: 'task.created' });
    expect(a.list()).toHaveLength(1);
    expect(b.list()).toHaveLength(0);
    a.close();
    b.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('WorkflowService', () => {
  it('ejecuta nodos, condiciones y AutomationService', () => {
    const autoRepo = new SQLiteAutomationRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const automation = new AutomationService(autoRepo);
    const rule = automation.create({
      name: 'Regla WF',
      trigger: 'conversation.updated',
      condition: null,
      action: { type: 'create_notification', label: 'Hola' },
    });

    const repo = new SQLiteWorkflowRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const service = new WorkflowService(repo, automation);

    const wf = service.create({
      name: 'Orquestado',
      trigger: 'conversation.updated',
      steps: [
        {
          nodeId: 't1',
          type: 'Trigger',
          config: {},
          positionX: 0,
          positionY: 0,
        },
        {
          nodeId: 'c1',
          type: 'Condition',
          config: { field: 'leadScore', op: '>', value: 40 },
          positionX: 100,
          positionY: 0,
        },
        {
          nodeId: 'd1',
          type: 'Delay',
          config: { ms: 500 },
          positionX: 200,
          positionY: 0,
        },
        {
          nodeId: 'task1',
          type: 'Task',
          config: { label: 'Llamar' },
          positionX: 300,
          positionY: 0,
        },
        {
          nodeId: 'p1',
          type: 'Pipeline',
          config: { stage: 'READY' },
          positionX: 400,
          positionY: 0,
        },
        {
          nodeId: 'a1',
          type: 'Automation',
          config: { ruleId: rule.id },
          positionX: 500,
          positionY: 0,
        },
        {
          nodeId: 'n1',
          type: 'Notification',
          config: { message: 'Ping' },
          positionX: 600,
          positionY: 0,
        },
        {
          nodeId: 'an1',
          type: 'Analytics',
          config: { metric: 'wf', value: 2 },
          positionX: 700,
          positionY: 0,
        },
        {
          nodeId: 'e1',
          type: 'End',
          config: {},
          positionX: 800,
          positionY: 0,
        },
      ],
      graph: {
        edges: [
          { id: '1', source: 't1', target: 'c1' },
          { id: '2', source: 'c1', target: 'd1', label: 'true' },
          { id: '3', source: 'c1', target: 'e1', label: 'false' },
          { id: '4', source: 'd1', target: 'task1' },
          { id: '5', source: 'task1', target: 'p1' },
          { id: '6', source: 'p1', target: 'a1' },
          { id: '7', source: 'a1', target: 'n1' },
          { id: '8', source: 'n1', target: 'an1' },
          { id: '9', source: 'an1', target: 'e1' },
        ],
      },
    });

    const exec = service.executeWorkflow(
      wf,
      { leadScore: 90 },
      { dryRun: false, trigger: 'conversation.updated' },
    );
    expect(exec.run.status).toBe('completed');
    expect(exec.steps.some((s) => s.type === 'Automation')).toBe(true);
    expect(exec.steps.some((s) => s.type === 'Task')).toBe(true);

    const skipped = service.executeWorkflow(
      wf,
      { leadScore: 10 },
      { dryRun: true, trigger: 'conversation.updated' },
    );
    expect(skipped.steps.some((s) => s.nodeId === 'e1')).toBe(true);

    const test = service.test({
      trigger: 'conversation.updated',
      workflowId: wf.id,
      dryRun: true,
      context: { leadScore: 99, salesFlow: 'WAITING_CONFIRMATION' },
    });
    expect(test.executions).toHaveLength(1);
    expect(service.listRuns({ workflowId: wf.id }).length).toBeGreaterThan(0);

    // Automation sin ruleId / sin servicio
    const wfBad = service.create({
      name: 'Bad auto',
      trigger: 'analytics.updated',
      steps: [
        { nodeId: 't', type: 'Trigger', config: {} },
        { nodeId: 'a', type: 'Automation', config: {} },
        { nodeId: 'e', type: 'End', config: {} },
      ],
      graph: {
        edges: [
          { id: '1', source: 't', target: 'a' },
          { id: '2', source: 'a', target: 'e' },
        ],
      },
    });
    const badExec = service.executeWorkflow(
      wfBad,
      {},
      { dryRun: true, trigger: 'analytics.updated' },
    );
    expect(badExec.run.status).toBe('failed');

    const solo = new WorkflowService(repo);
    const noAuto = service.create({
      name: 'No svc',
      trigger: 'lead.updated',
      steps: [
        { nodeId: 't', type: 'Trigger', config: {} },
        {
          nodeId: 'a',
          type: 'Automation',
          config: { ruleId: rule.id },
        },
        { nodeId: 'e', type: 'End', config: {} },
      ],
      graph: {
        edges: [
          { id: '1', source: 't', target: 'a' },
          { id: '2', source: 'a', target: 'e' },
        ],
      },
    });
    // use solo service without automation
    const r2 = solo.executeWorkflow(
      noAuto,
      {},
      { dryRun: true, trigger: 'lead.updated' },
    );
    expect(r2.steps.some((s) => s.message.includes('no disponible'))).toBe(
      true,
    );

    expect(service.duplicate(wf.id)?.name).toContain('copia');
    expect(service.update(wf.id, { enabled: false })?.enabled).toBe(false);
    expect(service.delete(wf.id)).toBe(true);

    expect(() =>
      service.create({ name: '', trigger: 'task.created' }),
    ).toThrow(WorkflowValidationError);
    expect(() =>
      service.create({ name: 'x', trigger: 'bad' }),
    ).toThrow(WorkflowValidationError);
    expect(() => service.update('', { name: 'x' })).toThrow(
      WorkflowValidationError,
    );
    expect(() => service.update(wf.id, { name: '  ' })).toThrow(
      WorkflowValidationError,
    );
    expect(() => service.update(wf.id, { trigger: 'bad' })).toThrow(
      WorkflowValidationError,
    );
    expect(() => service.test({ trigger: 'bad' })).toThrow(
      WorkflowValidationError,
    );
    expect(() => service.delete('')).toThrow(WorkflowValidationError);
    expect(() => service.duplicate('')).toThrow(WorkflowValidationError);

    repo.close();
    autoRepo.close();
  });

  it('cubre ciclos, nodos rotos y condiciones inválidas', () => {
    const autoRepo = new SQLiteAutomationRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const automation = new AutomationService(autoRepo);
    const repo = new SQLiteWorkflowRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const service = new WorkflowService(repo, automation);

    const empty = {
      id: 'empty',
      tenantId: 'rodacenter',
      name: 'empty',
      description: '',
      enabled: true,
      trigger: 'task.created' as const,
      graph: { edges: [] },
      steps: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(
      service.executeWorkflow(empty, {}, { dryRun: true, trigger: 'task.created' })
        .run.status,
    ).toBe('failed');

    const cycle = service.create({
      name: 'cycle',
      trigger: 'task.created',
      steps: [
        { nodeId: 't', type: 'Trigger', config: {} },
        { nodeId: 'a', type: 'Notification', config: { message: 'x' } },
        { nodeId: 'b', type: 'Notification', config: { message: 'y' } },
      ],
      graph: {
        edges: [
          { id: '1', source: 't', target: 'a' },
          { id: '2', source: 'a', target: 'b' },
          { id: '3', source: 'b', target: 'a' },
        ],
      },
    });
    expect(
      service.executeWorkflow(cycle, {}, { dryRun: true, trigger: 'task.created' })
        .steps.some((s) => s.message.includes('Ciclo')),
    ).toBe(true);

    const missing = service.create({
      name: 'missing-target',
      trigger: 'task.created',
      steps: [{ nodeId: 't', type: 'Trigger', config: {} }],
      graph: {
        edges: [{ id: '1', source: 't', target: 'ghost' }],
      },
    });
    expect(
      service.executeWorkflow(
        missing,
        {},
        { dryRun: true, trigger: 'task.created' },
      ).steps.some((s) => s.message.includes('no encontrado')),
    ).toBe(true);

    const badCond = service.create({
      name: 'bad-cond',
      trigger: 'task.created',
      steps: [
        { nodeId: 't', type: 'Trigger', config: {} },
        {
          nodeId: 'c',
          type: 'Condition',
          config: { field: 'nope', value: 1 },
        },
        { nodeId: 'e', type: 'End', config: {} },
      ],
      graph: {
        edges: [
          { id: '1', source: 't', target: 'c' },
          { id: '2', source: 'c', target: 'e' },
        ],
      },
    });
    const badCondExec = service.executeWorkflow(
      badCond,
      {},
      { dryRun: true, trigger: 'task.created' },
    );
    expect(badCondExec.steps.some((s) => s.message.includes('inválido'))).toBe(
      true,
    );

    const missingRule = service.create({
      name: 'missing-rule',
      trigger: 'task.created',
      steps: [
        { nodeId: 't', type: 'Trigger', config: {} },
        {
          nodeId: 'a',
          type: 'Automation',
          config: { ruleId: 'does-not-exist' },
        },
        { nodeId: 'e', type: 'End', config: {} },
      ],
      graph: {
        edges: [
          { id: '1', source: 't', target: 'a' },
          { id: '2', source: 'a', target: 'e' },
        ],
      },
    });
    expect(
      service.executeWorkflow(
        missingRule,
        {},
        { dryRun: false, trigger: 'task.created' },
      ).run.status,
    ).toBe('failed');

    // salesFlow + condition labels + delay dry-run
    const sales = service.create({
      name: 'sales',
      trigger: 'lead.updated',
      steps: [
        { nodeId: 't', type: 'Trigger', config: {} },
        {
          nodeId: 'c',
          type: 'Condition',
          config: { field: 'salesFlow', value: 'READY' },
        },
        {
          nodeId: 'd',
          type: 'Delay',
          config: { ms: 10 },
        },
        { nodeId: 'e', type: 'End', config: {} },
      ],
      graph: {
        edges: [
          { id: '1', source: 't', target: 'c' },
          { id: '2', source: 'c', target: 'd', label: 'true' },
          { id: '3', source: 'c', target: 'e', label: 'false' },
          { id: '4', source: 'd', target: 'e' },
        ],
      },
    });
    const salesExec = service.executeWorkflow(
      sales,
      { salesFlow: 'READY' },
      { dryRun: true, trigger: 'lead.updated' },
    );
    expect(salesExec.steps.some((s) => s.type === 'Delay')).toBe(true);

    // graph JSON corrupto + status desconocido
    const file = tmpDb('wf-corrupt');
    const fileRepo = new SQLiteWorkflowRepository(file, { tenantId: 't1' });
    const wf = fileRepo.create({ name: 'c', trigger: 'task.created' });
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(file);
    db.prepare(
      `UPDATE workflows SET graph_json = ? WHERE tenant_id = ? AND id = ?`,
    ).run('not-json', 't1', wf.id);
    expect(fileRepo.getById(wf.id)?.graph.edges).toEqual([]);
    const run = fileRepo.startRun(wf.id);
    db.prepare(
      `UPDATE workflow_runs SET status = ? WHERE tenant_id = ? AND id = ?`,
    ).run('weird', 't1', run.id);
    expect(fileRepo.listRuns()[0]?.status).toBe('failed');
    db.close();
    fileRepo.close();
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }

    repo.close();
    autoRepo.close();
  });

  it('escucha EventBus', () => {
    const shared = tmpDb('wf-bus');
    const repo = new SQLiteWorkflowRepository(shared, {
      tenantId: 'tenant-a',
    });
    const service = new WorkflowService(repo);
    service.create({
      name: 'On create',
      trigger: 'conversation.created',
    });
    const bus = new InMemoryEventBus();
    service.start(bus);
    const realtime = new RealtimeService(bus);
    realtime.onTurnCompleted({
      conversationId: 'c1',
      waId: 'wa:1',
      createdConversation: true,
      tenantId: 'tenant-a',
    });
    expect(repo.listRuns().length).toBeGreaterThan(0);
    service.stop();
    service.stop();
    repo.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('HTTP /api/workflows', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;
  let service: WorkflowService;
  let bus: InMemoryEventBus;

  beforeAll(async () => {
    const autoRepo = new SQLiteAutomationRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const automation = new AutomationService(autoRepo);
    const repo = new SQLiteWorkflowRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    service = new WorkflowService(repo, automation);
    bus = new InMemoryEventBus();
    service.start(bus);

    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(path.join(os.tmpdir(), 'wf-api-logs'));
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
      automationService: automation,
      workflowService: service,
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

  it('CRUD, test, runs y eventos', async () => {
    const createRes = await fetch(`${baseUrl}/api/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'HTTP WF',
        trigger: 'pipeline.updated',
        description: 'via http',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string };

    const listRes = await fetch(`${baseUrl}/api/workflows`);
    expect(listRes.status).toBe(200);
    expect(((await listRes.json()) as { total: number }).total).toBeGreaterThan(
      0,
    );

    const putRes = await fetch(`${baseUrl}/api/workflows/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    expect(putRes.status).toBe(200);

    const testRes = await fetch(`${baseUrl}/api/workflows/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: 'pipeline.updated',
        workflowId: created.id,
        dryRun: true,
        context: { leadScore: 70 },
      }),
    });
    expect(testRes.status).toBe(200);
    expect(
      ((await testRes.json()) as { executions: unknown[] }).executions.length,
    ).toBe(1);

    const runsRes = await fetch(
      `${baseUrl}/api/workflows/runs?workflowId=${created.id}&limit=10`,
    );
    expect(runsRes.status).toBe(200);
    expect(
      ((await runsRes.json()) as { runs: unknown[] }).runs.length,
    ).toBeGreaterThan(0);

    expect(
      (
        await fetch(`${baseUrl}/api/workflows/${created.id}/duplicate`, {
          method: 'POST',
        })
      ).status,
    ).toBe(201);

    bus.publish({
      type: 'pipeline.updated',
      payload: {
        at: new Date().toISOString(),
        tenantId: 'rodacenter',
        leadScore: 88,
      },
    });

    expect(
      (
        await fetch(`${baseUrl}/api/workflows/${created.id}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(204);

    expect(
      (await fetch(`${baseUrl}/api/workflows/missing`, { method: 'DELETE' }))
        .status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/workflows/missing`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/workflows/missing/duplicate`, {
          method: 'POST',
        })
      ).status,
    ).toBe(404);

    expect(
      (
        await fetch(`${baseUrl}/api/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '', trigger: 'x' }),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await fetch(`${baseUrl}/api/workflows/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trigger: 'nope' }),
        })
      ).status,
    ).toBe(400);
  });
});

describe('workflowsApiRoutes error paths', () => {
  it('500/400 en fallos', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const validation = () => {
      throw new WorkflowValidationError('bad');
    };
    const stub = {
      listRuns: boom,
      test: validation,
      list: boom,
      create: boom,
      duplicate: validation,
      update: validation,
      delete: boom,
    } as unknown as WorkflowService;

    const app = express();
    app.use(express.json());
    app.use('/api/workflows', createWorkflowsApiRouter(stub));
    const server = await listen(app);

    const calls: Array<[string, RequestInit]> = [
      ['/api/workflows/runs', {}],
      [
        '/api/workflows/test',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      ],
      ['/api/workflows', {}],
      [
        '/api/workflows',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      ],
      ['/api/workflows/x/duplicate', { method: 'POST' }],
      [
        '/api/workflows/x',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      ],
      ['/api/workflows/x', { method: 'DELETE' }],
    ];
    for (const [url, init] of calls) {
      const res = await fetch(`${server.baseUrl}${url}`, init);
      expect([400, 500]).toContain(res.status);
    }

    const stub2 = {
      listRuns: () => [],
      test: boom,
      list: () => [],
      create: validation,
      duplicate: boom,
      update: boom,
      delete: validation,
    } as unknown as WorkflowService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/workflows', createWorkflowsApiRouter(stub2));
    const s2 = await listen(app2);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/workflows/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/workflows/x/duplicate`, {
          method: 'POST',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/workflows/x`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(500);
    expect(
      (await fetch(`${s2.baseUrl}/api/workflows/x`, { method: 'DELETE' })).status,
    ).toBe(400);

    await server.close();
    await s2.close();
  });
});
