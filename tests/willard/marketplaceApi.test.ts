import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AutomationService } from '../../src/application/services/AutomationService';
import { CompanyService } from '../../src/application/services/CompanyService';
import { KnowledgeService } from '../../src/application/services/KnowledgeService';
import {
  MarketplaceService,
  MarketplaceValidationError,
} from '../../src/application/services/MarketplaceService';
import { WorkflowService } from '../../src/application/services/WorkflowService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  isTemplateCategory,
  summarizePayload,
} from '../../src/domain/dashboard/templateDto';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteAutomationRepository } from '../../src/infrastructure/persistence/SQLiteAutomationRepository';
import { SQLiteCompanyRepository } from '../../src/infrastructure/persistence/SQLiteCompanyRepository';
import { SQLiteKnowledgeRepository } from '../../src/infrastructure/persistence/SQLiteKnowledgeRepository';
import { SQLiteTemplateRepository } from '../../src/infrastructure/persistence/SQLiteTemplateRepository';
import { SQLiteWorkflowRepository } from '../../src/infrastructure/persistence/SQLiteWorkflowRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { createMarketplaceApiRouter } from '../../src/presentation/http/routes/marketplaceApiRoutes';

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

function buildMarketplace(dbPath: string, tenantId: string) {
  const templates = new SQLiteTemplateRepository(dbPath, { tenantId });
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
  const service = new MarketplaceService(templates, {
    knowledge,
    automation,
    workflow,
    company,
  });
  return { service, templates, knowledge, automation, workflow, company };
}

describe('templateDto helpers', () => {
  it('categorías y resumen', () => {
    expect(isTemplateCategory('Automotriz')).toBe(true);
    expect(isTemplateCategory('X')).toBe(false);
    expect(
      summarizePayload({
        knowledge: [{ title: 'a', question: 'q', answer: 'a' }],
        company: { welcomeMessage: 'hi' },
      }),
    ).toEqual({
      knowledge: 1,
      automations: 0,
      workflows: 0,
      company: true,
      pipeline: false,
      tasks: 0,
      widgets: 0,
    });
  });
});

describe('SQLiteTemplateRepository', () => {
  it('lista, filtra y gestiona installs', () => {
    const repo = new SQLiteTemplateRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    expect(repo.list().length).toBeGreaterThanOrEqual(8);
    expect(repo.list({ category: 'Automotriz' }).length).toBeGreaterThan(0);
    expect(repo.list({ q: 'veterinaria' }).length).toBeGreaterThan(0);
    expect(repo.getById('tpl-generico')?.name).toContain('genérico');
    expect(repo.getById('missing')).toBeNull();

    const install = repo.upsertInstall({
      templateId: 'tpl-generico',
      version: '1.0.0',
      resources: {
        knowledgeIds: ['k1'],
        automationIds: [],
        workflowIds: [],
        companyApplied: true,
      },
    });
    expect(repo.getInstall('tpl-generico')?.id).toBe(install.id);
    const updated = repo.upsertInstall({
      templateId: 'tpl-generico',
      version: '1.1.0',
      resources: {
        knowledgeIds: ['k2'],
        automationIds: ['a1'],
        workflowIds: [],
        companyApplied: false,
      },
    });
    expect(updated.version).toBe('1.1.0');
    expect(repo.listInstalls()).toHaveLength(1);
    expect(repo.deleteInstall('tpl-generico')).toBe(true);
    expect(repo.deleteInstall('tpl-generico')).toBe(false);
    repo.close();
  });

  it('aísla instalaciones por tenant', () => {
    const shared = tmpDb('mkt-iso');
    const a = new SQLiteTemplateRepository(shared, { tenantId: 'tenant-a' });
    const b = new SQLiteTemplateRepository(shared, { tenantId: 'tenant-b' });
    a.upsertInstall({
      templateId: 'tpl-retail',
      version: '1.0.0',
      resources: {
        knowledgeIds: [],
        automationIds: [],
        workflowIds: [],
        companyApplied: false,
      },
    });
    expect(a.listInstalls()).toHaveLength(1);
    expect(b.listInstalls()).toHaveLength(0);
    a.close();
    b.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('MarketplaceService', () => {
  it('instala, actualiza versión y desinstala', () => {
    const { service, knowledge, automation, workflow, company, templates } =
      buildMarketplace(':memory:', 'rodacenter');

    const result = service.install('tpl-automotriz-basico');
    expect(result.created.knowledge).toBeGreaterThan(0);
    expect(result.created.automations).toBeGreaterThan(0);
    expect(result.created.workflows).toBeGreaterThan(0);
    expect(result.created.company).toBe(true);
    expect(company.getCompany().businessType).toBe('Automotriz');
    expect(service.listInstalls()).toHaveLength(1);

    // segunda install misma versión → no-op
    const again = service.install('tpl-automotriz-basico');
    expect(again.updated).toBe(false);
    expect(again.created.knowledge).toBe(0);

    // bump version → update
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    // in-memory can't share — use force instead
    const forced = service.install('tpl-automotriz-basico', { force: true });
    expect(forced.updated).toBe(true);
    expect(forced.created.knowledge).toBeGreaterThan(0);

    const kbBefore = knowledge.list().total;
    expect(service.uninstall('tpl-automotriz-basico')).toBe(true);
    expect(service.listInstalls()).toHaveLength(0);
    expect(knowledge.list().total).toBeLessThan(kbBefore);
    expect(automation.list().every((r) => !r.name.includes('[Plantilla]'))).toBe(
      true,
    );
    expect(
      workflow.list().every((w) => !w.name.includes('[Plantilla]')),
    ).toBe(true);

    expect(service.uninstall('tpl-automotriz-basico')).toBe(false);
    expect(() => service.install('missing')).toThrow(MarketplaceValidationError);

    // install without deps still records declarative content
    const bare = new MarketplaceService(templates);
    const retail = bare.install('tpl-retail');
    expect(retail.created.knowledge).toBe(0);
    expect(retail.install.resources.widgets?.length).toBeGreaterThan(0);

    void DatabaseSync;
  });
});

describe('HTTP marketplace', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;
  let service: MarketplaceService;

  beforeAll(async () => {
    const built = buildMarketplace(':memory:', 'rodacenter');
    service = built.service;

    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(path.join(os.tmpdir(), 'mkt-api-logs'));
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
      marketplaceService: service,
      knowledgeService: built.knowledge,
      automationService: built.automation,
      workflowService: built.workflow,
      companyService: built.company,
      authRequired: false,
    });
    const server = await listen(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it('lista, detalle, install, installs y uninstall', async () => {
    const listRes = await fetch(`${baseUrl}/api/templates?category=Genérico`);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as { total: number; templates: Array<{ id: string }> };
    expect(listed.total).toBeGreaterThan(0);

    const id = 'tpl-generico';
    const getRes = await fetch(`${baseUrl}/api/templates/${id}`);
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()) as { id: string }).id).toBe(id);

    expect(
      (await fetch(`${baseUrl}/api/templates/missing`)).status,
    ).toBe(404);

    const installRes = await fetch(`${baseUrl}/api/templates/${id}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(installRes.status).toBe(201);

    const installsRes = await fetch(`${baseUrl}/api/template-installs`);
    expect(installsRes.status).toBe(200);
    expect(
      ((await installsRes.json()) as { total: number }).total,
    ).toBeGreaterThan(0);

    const updateRes = await fetch(`${baseUrl}/api/templates/${id}/install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });
    expect(updateRes.status).toBe(200);

    const delRes = await fetch(`${baseUrl}/api/templates/${id}/install`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);

    expect(
      (
        await fetch(`${baseUrl}/api/templates/${id}/install`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);

    expect(
      (
        await fetch(`${baseUrl}/api/templates/nope/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(400);
  });
});

describe('marketplaceApiRoutes error paths', () => {
  it('500/400 en fallos', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const validation = () => {
      throw new MarketplaceValidationError('bad');
    };
    const stub = {
      listTemplates: boom,
      getTemplate: () => null,
      install: validation,
      uninstall: boom,
      listInstalls: boom,
    } as unknown as MarketplaceService;

    const app = express();
    app.use(express.json());
    app.use('/api', createMarketplaceApiRouter(stub));
    const server = await listen(app);

    expect((await fetch(`${server.baseUrl}/api/templates`)).status).toBe(500);
    expect((await fetch(`${server.baseUrl}/api/template-installs`)).status).toBe(
      500,
    );
    expect(
      (
        await fetch(`${server.baseUrl}/api/templates/x/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(400);

    // get throws 500
    const stub2 = {
      listTemplates: () => [],
      getTemplate: boom,
      install: boom,
      uninstall: validation,
      listInstalls: () => [],
    } as unknown as MarketplaceService;
    const app2 = express();
    app2.use(express.json());
    app2.use('/api', createMarketplaceApiRouter(stub2));
    const s2 = await listen(app2);
    expect((await fetch(`${s2.baseUrl}/api/templates/x`)).status).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/templates/x/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(500);
    expect(
      (
        await fetch(`${s2.baseUrl}/api/templates/x/install`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(400);

    // uninstall 500
    const stub3 = {
      listTemplates: () => [],
      getTemplate: () => ({ id: 'x' }),
      install: () => ({}),
      uninstall: boom,
      listInstalls: () => [],
    } as unknown as MarketplaceService;
    const app3 = express();
    app3.use(express.json());
    app3.use('/api', createMarketplaceApiRouter(stub3));
    const s3 = await listen(app3);
    expect(
      (
        await fetch(`${s3.baseUrl}/api/templates/x/install`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(500);

    await server.close();
    await s2.close();
    await s3.close();
  });
});
