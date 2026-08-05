import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CopilotService,
  CopilotValidationError,
} from '../../src/application/services/CopilotService';
import { AutomationService } from '../../src/application/services/AutomationService';
import { BillingService } from '../../src/application/services/BillingService';
import { CompanyService } from '../../src/application/services/CompanyService';
import { KnowledgeService } from '../../src/application/services/KnowledgeService';
import { MarketplaceService } from '../../src/application/services/MarketplaceService';
import { WorkflowService } from '../../src/application/services/WorkflowService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import type { AiProvider } from '../../src/domain/copilot/AiProvider';
import {
  isCopilotIntent,
  isCopilotSessionStatus,
  isCopilotTemplateType,
  summarizeCopilotResponse,
  type CopilotGeneratedResponse,
} from '../../src/domain/dashboard/copilotDto';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { LocalPromptProvider } from '../../src/infrastructure/ai/LocalPromptProvider';
import { SQLiteAutomationRepository } from '../../src/infrastructure/persistence/SQLiteAutomationRepository';
import { SQLiteBillingRepository } from '../../src/infrastructure/persistence/SQLiteBillingRepository';
import { SQLiteCompanyRepository } from '../../src/infrastructure/persistence/SQLiteCompanyRepository';
import { SQLiteKnowledgeRepository } from '../../src/infrastructure/persistence/SQLiteKnowledgeRepository';
import { SQLitePromptRepository } from '../../src/infrastructure/persistence/SQLitePromptRepository';
import { SQLiteTemplateRepository } from '../../src/infrastructure/persistence/SQLiteTemplateRepository';
import { SQLiteWorkflowRepository } from '../../src/infrastructure/persistence/SQLiteWorkflowRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { createCopilotApiRouter } from '../../src/presentation/http/routes/copilotApiRoutes';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';

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

function sampleResponse(
  overrides: Partial<CopilotGeneratedResponse> = {},
): CopilotGeneratedResponse {
  return {
    intent: 'taller',
    industry: 'Taller automotriz',
    summary: 'test',
    payload: {
      company: { companyName: 'Test Taller', welcomeMessage: 'hola' },
      knowledge: [
        {
          title: 'FAQ 1',
          question: 'q1',
          answer: 'a1',
          tags: ['t'],
        },
      ],
      automations: [
        {
          name: 'Auto test',
          trigger: 'conversation.created',
          action: { type: 'create_task', label: 'x', priority: 'Media' },
        },
      ],
      workflows: [
        {
          name: 'WF test',
          trigger: 'conversation.created',
          steps: [{ nodeId: 'start', type: 'trigger' }],
        },
      ],
      pipeline: { stages: ['A', 'B'] },
      widgets: [{ id: 'w1', title: 'Widget' }],
    },
    suggestedMarketplaceTemplateId: 'tpl-automotriz-basico',
    marketplaceTemplate: {
      name: 'Taller',
      category: 'Automotriz',
      description: 'd',
    },
    ...overrides,
  };
}

class StubAi implements AiProvider {
  constructor(private readonly response: CopilotGeneratedResponse) {}
  async generate(): Promise<CopilotGeneratedResponse> {
    return this.response;
  }
}

function buildStack(dbPath: string, tenantId: string) {
  const prompts = new SQLitePromptRepository(dbPath, { tenantId });
  const knowledge = new KnowledgeService(
    new SQLiteKnowledgeRepository(dbPath, { tenantId }),
  );
  const automation = new AutomationService(
    new SQLiteAutomationRepository(dbPath, { tenantId }),
  );
  const workflow = new WorkflowService(
    new SQLiteWorkflowRepository(dbPath, { tenantId }),
  );
  const company = new CompanyService(
    new SQLiteCompanyRepository(dbPath, { tenantId }),
  );
  const billing = new BillingService(
    new SQLiteBillingRepository(dbPath, { tenantId }),
  );
  const marketplace = new MarketplaceService(
    new SQLiteTemplateRepository(dbPath, { tenantId }),
    { knowledge, automation, workflow, company },
  );
  const ai = new LocalPromptProvider();
  const service = new CopilotService(prompts, ai, {
    knowledge,
    automation,
    workflow,
    company,
    marketplace,
    billing,
  });
  return {
    service,
    prompts,
    knowledge,
    automation,
    workflow,
    company,
    billing,
    marketplace,
  };
}

describe('copilotDto helpers', () => {
  it('valida enums y resume payload', () => {
    expect(isCopilotIntent('taller')).toBe(true);
    expect(isCopilotIntent('x')).toBe(false);
    expect(isCopilotSessionStatus('ready')).toBe(true);
    expect(isCopilotSessionStatus('nope')).toBe(false);
    expect(isCopilotTemplateType('full')).toBe(true);
    expect(isCopilotTemplateType('x')).toBe(false);
    expect(summarizeCopilotResponse(sampleResponse())).toMatchObject({
      knowledge: 1,
      automations: 1,
      workflows: 1,
      company: true,
      pipeline: true,
      widgets: 1,
    });
  });
});

describe('LocalPromptProvider', () => {
  const provider = new LocalPromptProvider();

  it('detecta industrias por lenguaje natural', async () => {
    const cases: Array<[string, string]> = [
      ['Crear un taller', 'taller'],
      ['necesito veterinaria para mascotas', 'veterinaria'],
      ['crear una inmobiliaria de arriendos', 'inmobiliaria'],
      ['abrir un restaurante con menú', 'restaurante'],
      ['ferretería de herramientas', 'ferreteria'],
      ['Crear una empresa personalizada', 'personalizada'],
      ['hola mundo random', 'personalizada'],
    ];
    for (const [prompt, intent] of cases) {
      const res = await provider.generate(prompt);
      expect(res.intent).toBe(intent);
      expect(res.payload.knowledge?.length).toBeGreaterThan(0);
      expect(res.payload.automations?.length).toBeGreaterThan(0);
      expect(res.payload.workflows?.length).toBeGreaterThan(0);
      expect(res.payload.company).toBeTruthy();
      expect(res.payload.pipeline).toBeTruthy();
      expect(res.payload.widgets?.length).toBeGreaterThan(0);
    }
  });
});

describe('SQLitePromptRepository', () => {
  it('CRUD sesiones y plantillas + aislamiento tenant', () => {
    const dbPath = tmpDb('copilot-repo');
    const a = new SQLitePromptRepository(dbPath, { tenantId: 'tenant-a' });
    const b = new SQLitePromptRepository(dbPath, { tenantId: 'tenant-b' });

    const session = a.createSession({
      prompt: 'Crear un taller',
      response: sampleResponse(),
      status: 'ready',
    });
    expect(session.tenantId).toBe('tenant-a');
    expect(a.getSession(session.id)?.prompt).toBe('Crear un taller');
    expect(b.getSession(session.id)).toBeNull();

    const updated = a.updateSession(session.id, {
      status: 'applied',
      response: sampleResponse({ summary: 'edited' }),
    });
    expect(updated?.status).toBe('applied');
    expect(updated?.response.summary).toBe('edited');
    expect(a.updateSession('missing', { status: 'failed' })).toBeNull();

    expect(a.listSessions(10)).toHaveLength(1);
    expect(b.listSessions()).toHaveLength(0);

    const tpl = a.saveTemplate({ type: 'full', payload: sampleResponse() });
    expect(a.getTemplate(tpl.id)?.type).toBe('full');
    expect(b.getTemplate(tpl.id)).toBeNull();
    expect(a.listTemplates()).toHaveLength(1);
    expect(a.deleteTemplate(tpl.id)).toBe(true);
    expect(a.deleteTemplate(tpl.id)).toBe(false);
    expect(a.getTemplate(tpl.id)).toBeNull();

    expect(a.deleteSession(session.id)).toBe(true);
    expect(a.deleteSession(session.id)).toBe(false);
    expect(a.listSessions()).toHaveLength(0);

    // file path + WAL branch
    expect(fs.existsSync(dbPath)).toBe(true);
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }
  });

  it('respeta tenant ALS cuando no hay tenant fijo', () => {
    const repo = new SQLitePromptRepository(':memory:');
    runWithTenant('als-tenant', () => {
      const s = repo.createSession({
        prompt: 'x',
        response: sampleResponse(),
      });
      expect(s.tenantId).toBe('als-tenant');
      expect(repo.listSessions()[0]?.id).toBe(s.id);
    });
  });
});

describe('CopilotService', () => {
  it('genera, aplica, guarda plantilla y elimina historial', async () => {
    const { service, knowledge, automation, workflow, company } = buildStack(
      ':memory:',
      'rodacenter',
    );

    await expect(service.generate('')).rejects.toThrow(CopilotValidationError);

    const session = await service.generate('Crear un taller automotriz');
    expect(session.status).toBe('ready');
    expect(session.response.intent).toBe('taller');
    expect(session.response.suggestedMarketplaceTemplateId).toBe(
      'tpl-automotriz-basico',
    );
    expect(service.getSession(session.id)?.id).toBe(session.id);
    expect(service.summarize(session.response).knowledge).toBeGreaterThan(0);

    const applied = service.apply({
      sessionId: session.id,
      saveAsTemplate: true,
      templateType: 'full',
    });
    expect(applied.session.status).toBe('applied');
    expect(applied.applied.knowledge).toBeGreaterThan(0);
    expect(applied.applied.automations).toBeGreaterThan(0);
    expect(applied.applied.workflows).toBeGreaterThan(0);
    expect(applied.applied.company).toBe(true);
    expect(applied.applied.pipeline).toBe(true);
    expect(applied.applied.widgets).toBeGreaterThan(0);
    expect(applied.template?.type).toBe('full');
    expect(knowledge.list().items.length).toBeGreaterThan(0);
    expect(automation.list().length).toBeGreaterThan(0);
    expect(workflow.list().length).toBeGreaterThan(0);
    expect(company.getCompany().companyName).toContain('Taller');

    const history = service.listHistory(5);
    expect(history.sessions.length).toBeGreaterThan(0);
    expect(history.templates.length).toBeGreaterThan(0);

    expect(service.deleteHistory(session.id)).toBe(true);
    expect(service.deleteHistory(session.id)).toBe(false);
    expect(() => service.deleteHistory('')).toThrow(CopilotValidationError);
    expect(() => service.apply({ sessionId: '' })).toThrow(
      CopilotValidationError,
    );
    expect(() => service.apply({ sessionId: 'missing' })).toThrow(
      CopilotValidationError,
    );
  });

  it('aplica vía Marketplace cuando installMarketplace=true', async () => {
    const { service, marketplace } = buildStack(':memory:', 'mkt-tenant');
    const session = await service.generate('Crear un taller');
    const before = marketplace.listInstalls().length;
    const result = service.apply({
      sessionId: session.id,
      installMarketplace: true,
    });
    expect(result.applied.marketplaceInstalled).toBe(true);
    expect(marketplace.listInstalls().length).toBe(before + 1);
  });

  it('limpia sugerencia Marketplace inválida y soporta AI stub', async () => {
    const prompts = new SQLitePromptRepository(':memory:', {
      tenantId: 'stub',
    });
    const marketplace = new MarketplaceService(
      new SQLiteTemplateRepository(':memory:', { tenantId: 'stub' }),
    );
    const service = new CopilotService(
      prompts,
      new StubAi(
        sampleResponse({
          suggestedMarketplaceTemplateId: 'tpl-no-existe',
        }),
      ),
      { marketplace },
    );
    const session = await service.generate('cualquiera');
    expect(session.response.suggestedMarketplaceTemplateId).toBeNull();
  });

  it('marca failed si falla apply y templateType inválido usa full', async () => {
    const prompts = new SQLitePromptRepository(':memory:', {
      tenantId: 'fail',
    });
    const knowledge = {
      create: () => {
        throw new Error('kb down');
      },
    } as unknown as KnowledgeService;
    const service = new CopilotService(
      prompts,
      new StubAi(sampleResponse({ suggestedMarketplaceTemplateId: null })),
      { knowledge },
    );
    const session = await service.generate('x');
    expect(() =>
      service.apply({
        sessionId: session.id,
        saveAsTemplate: true,
        templateType: 'nope',
      }),
    ).toThrow(/kb down/);
    expect(service.getSession(session.id)?.status).toBe('failed');
  });

  it('trackUsage sin billing y apply sin payload', async () => {
    const prompts = new SQLitePromptRepository(':memory:', {
      tenantId: 'bare',
    });
    const service = new CopilotService(
      prompts,
      new StubAi(sampleResponse()),
      {},
    );
    const session = await service.generate('Crear veterinaria');
    const applied = service.apply({ sessionId: session.id });
    expect(applied.applied.knowledge).toBe(0);
    expect(applied.billingWarning).toBeNull();

    const broken = prompts.createSession({
      prompt: 'x',
      response: { ...sampleResponse(), payload: undefined as never },
    });
    // force empty payload via update
    prompts.updateSession(broken.id, {
      response: {
        intent: 'taller',
        industry: 'x',
        summary: 'x',
        payload: undefined as never,
      },
    });
    expect(() => service.apply({ sessionId: broken.id })).toThrow(
      CopilotValidationError,
    );
  });

  it('billing registerUsage warning path y error silencioso', async () => {
    const prompts = new SQLitePromptRepository(':memory:', {
      tenantId: 'bill',
    });
    const billingOk = {
      registerUsage: () => ({
        usage: { value: 1 },
        warning: { message: 'casi límite', level: 'warn' },
      }),
    } as unknown as BillingService;
    const service = new CopilotService(
      prompts,
      new StubAi(sampleResponse()),
      { billing: billingOk },
    );
    const session = await service.generate('taller');
    const applied = service.apply({ sessionId: session.id });
    expect(applied.billingWarning).toContain('casi');

    const billingBoom = {
      registerUsage: () => {
        throw new Error('billing down');
      },
    } as unknown as BillingService;
    const service2 = new CopilotService(
      prompts,
      new StubAi(sampleResponse()),
      { billing: billingBoom },
    );
    const s2 = await service2.generate('x');
    expect(s2.id).toBeTruthy();
  });
});

describe('HTTP copilot', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;

  beforeAll(async () => {
    const built = buildStack(':memory:', 'rodacenter');
    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(path.join(os.tmpdir(), 'copilot-api-logs'));
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
      copilotService: built.service,
      knowledgeService: built.knowledge,
      automationService: built.automation,
      workflowService: built.workflow,
      companyService: built.company,
      billingService: built.billing,
      marketplaceService: built.marketplace,
      authRequired: false,
    });
    const server = await listen(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it('generate, history, apply, delete', async () => {
    const genRes = await fetch(`${baseUrl}/api/copilot/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Crear una veterinaria' }),
    });
    expect(genRes.status).toBe(201);
    const genBody = (await genRes.json()) as {
      session: { id: string; response: CopilotGeneratedResponse };
    };
    expect(genBody.session.response.intent).toBe('veterinaria');

    const badGen = await fetch(`${baseUrl}/api/copilot/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });
    expect(badGen.status).toBe(400);

    const histRes = await fetch(`${baseUrl}/api/copilot/history?limit=10`);
    expect(histRes.status).toBe(200);
    const hist = (await histRes.json()) as { sessions: unknown[] };
    expect(hist.sessions.length).toBeGreaterThan(0);

    const applyRes = await fetch(`${baseUrl}/api/copilot/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: genBody.session.id,
        saveAsTemplate: true,
        templateType: 'marketplace',
        response: genBody.session.response,
      }),
    });
    expect(applyRes.status).toBe(200);
    const applied = (await applyRes.json()) as {
      applied: { knowledge: number };
      template: { type: string } | null;
    };
    expect(applied.applied.knowledge).toBeGreaterThan(0);
    expect(applied.template?.type).toBe('marketplace');

    const badApply = await fetch(`${baseUrl}/api/copilot/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: '' }),
    });
    expect(badApply.status).toBe(400);

    const delRes = await fetch(
      `${baseUrl}/api/copilot/history/${genBody.session.id}`,
      { method: 'DELETE' },
    );
    expect(delRes.status).toBe(204);

    expect(
      (
        await fetch(`${baseUrl}/api/copilot/history/${genBody.session.id}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
  });
});

describe('copilotApiRoutes error paths', () => {
  it('propaga 500 en fallos no de validación', async () => {
    const boom = async () => {
      throw new Error('boom');
    };
    const stub = {
      generate: boom,
      apply: () => {
        throw new Error('boom');
      },
      listHistory: () => {
        throw new Error('boom');
      },
      deleteHistory: () => {
        throw new Error('boom');
      },
    } as unknown as CopilotService;

    const app = express();
    app.use(express.json());
    app.use('/api', createCopilotApiRouter(stub));
    const server = await listen(app);

    expect(
      (
        await fetch(`${server.baseUrl}/api/copilot/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: 'x' }),
        })
      ).status,
    ).toBe(500);

    expect(
      (
        await fetch(`${server.baseUrl}/api/copilot/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: 'x' }),
        })
      ).status,
    ).toBe(500);

    expect(
      (await fetch(`${server.baseUrl}/api/copilot/history`)).status,
    ).toBe(500);

    expect(
      (
        await fetch(`${server.baseUrl}/api/copilot/history/x`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(500);

    const stub2 = {
      generate: async () => ({}),
      apply: () => ({}),
      listHistory: () => ({ sessions: [], templates: [] }),
      deleteHistory: () => {
        throw new CopilotValidationError('id es obligatorio');
      },
    } as unknown as CopilotService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createCopilotApiRouter(stub2));
    const s2 = await listen(app2);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/copilot/history/x`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(400);

    await server.close();
    await s2.close();
  });
});
