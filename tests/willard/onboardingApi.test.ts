import type { AddressInfo } from 'net';
import type { Express } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CompanyService } from '../../src/application/services/CompanyService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import {
  OnboardingService,
  OnboardingValidationError,
} from '../../src/application/services/OnboardingService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';
import { PasswordHasher } from '../../src/infrastructure/auth/PasswordHasher';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteCompanyRepository } from '../../src/infrastructure/persistence/SQLiteCompanyRepository';
import { SQLiteOnboardingRepository } from '../../src/infrastructure/persistence/SQLiteOnboardingRepository';
import { SQLiteTenantRepository } from '../../src/infrastructure/persistence/SQLiteTenantRepository';
import { SQLiteUserRepository } from '../../src/infrastructure/persistence/SQLiteUserRepository';
import { createApp } from '../../src/presentation/http/createApp';

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

function buildService(dbPath: string, tenantId: string) {
  const onboarding = new SQLiteOnboardingRepository(dbPath, { tenantId });
  const company = new SQLiteCompanyRepository(dbPath, { tenantId });
  const tenants = new SQLiteTenantRepository(dbPath);
  const users = new SQLiteUserRepository(dbPath);
  const hasher = new PasswordHasher();
  const service = new OnboardingService(
    onboarding,
    new CompanyService(company),
    tenants,
    users,
    hasher,
  );
  return { service, onboarding, company, tenants, users };
}

describe('SQLiteOnboardingRepository', () => {
  it('estado inicial incomplete y markCompleted', () => {
    const now = Date.UTC(2026, 7, 1, 20, 0, 0);
    const repo = new SQLiteOnboardingRepository(':memory:', {
      tenantId: 'rodacenter',
      now: () => now,
    });
    const status = repo.getStatus();
    expect(status.completed).toBe(false);
    expect(status.step).toBe(1);
    expect(status.progress).toBe(0);
    expect(status.tenantId).toBe('rodacenter');

    repo.setStep(3);
    expect(repo.getStatus().step).toBe(3);
    expect(repo.getStatus().progress).toBeGreaterThan(0);

    const done = repo.markCompleted('1.0.0');
    expect(done.completed).toBe(true);
    expect(done.step).toBe(6);
    expect(done.progress).toBe(100);
    expect(done.version).toBe('1.0.0');
    expect(done.completedAt).toBeTruthy();

    const event = repo.recordEvent('installation.completed', { version: '1.0.0' });
    expect(event.eventType).toBe('installation.completed');
    expect(repo.listEvents()).toHaveLength(1);

    repo.setStep(2);
    expect(repo.getStatus().step).toBe(6);

    repo.close();
  });

  it('aísla instalación por tenant', () => {
    const shared = path.join(
      os.tmpdir(),
      `onb-iso-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    );
    const a = new SQLiteOnboardingRepository(shared, { tenantId: 'tenant-a' });
    const b = new SQLiteOnboardingRepository(shared, { tenantId: 'tenant-b' });
    a.markCompleted('1.0.0');
    expect(a.getStatus().completed).toBe(true);
    expect(b.getStatus().completed).toBe(false);
    a.close();
    b.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('OnboardingService', () => {
  it('instalación completa guarda company, admin y eventos', () => {
    const { service, company, users, onboarding } = buildService(
      ':memory:',
      'rodacenter',
    );

    const result = runWithTenant('rodacenter', () =>
      service.finish({
        company: {
          companyName: 'Nueva Empresa',
          city: 'Manizales',
          primaryColor: '#112233',
          welcomeMessage: 'Hola',
        },
        admin: {
          name: 'Admin Nuevo',
          email: 'admin@nueva.local',
          password: 'secret12',
        },
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.alreadyCompleted).toBe(false);
    expect(result.status.completed).toBe(true);
    expect(company.getCompany().companyName).toBe('Nueva Empresa');
    expect(users.findByEmail('admin@nueva.local')?.role).toBe('ADMIN');
    expect(onboarding.listEvents().some((e) => e.eventType === 'installation.completed')).toBe(
      true,
    );

    onboarding.close();
    company.close();
    users.close();
  });

  it('repetir instalación es idempotente', () => {
    const { service, onboarding, company, users } = buildService(
      ':memory:',
      'rodacenter',
    );
    const payload = {
      company: { companyName: 'Once' },
      admin: {
        name: 'A',
        email: 'a@once.local',
        password: 'secret12',
      },
    };
    runWithTenant('rodacenter', () => service.finish(payload));
    const second = runWithTenant('rodacenter', () => service.finish(payload));
    expect(second.alreadyCompleted).toBe(true);
    expect(second.status.completed).toBe(true);
    expect(onboarding.listEvents()).toHaveLength(1);

    onboarding.close();
    company.close();
    users.close();
  });

  it('valida admin y nombre de empresa', () => {
    const { service, onboarding, company, users } = buildService(
      ':memory:',
      'rodacenter',
    );
    expect(() =>
      runWithTenant('rodacenter', () =>
        service.finish({
          company: { companyName: '' },
          admin: { name: 'X', email: 'x@y.com', password: '123456' },
        }),
      ),
    ).toThrow(OnboardingValidationError);

    expect(() =>
      runWithTenant('rodacenter', () =>
        service.finish({
          company: { companyName: 'OK' },
          admin: { name: '', email: '', password: '1' },
        }),
      ),
    ).toThrow(OnboardingValidationError);

    onboarding.close();
    company.close();
    users.close();
  });

  it('setStep avanza si no completed y no cambia si completed', () => {
    const { service, onboarding, company, users } = buildService(
      ':memory:',
      'rodacenter',
    );
    runWithTenant('rodacenter', () => {
      expect(service.getStatus().completed).toBe(false);
      expect(service.setStep(4).step).toBe(4);
      service.finish({
        company: { companyName: 'Done Co' },
        admin: {
          name: 'Admin',
          email: 'done@co.local',
          password: 'secret12',
        },
      });
      const status = service.setStep(2);
      expect(status.completed).toBe(true);
      expect(status.step).toBe(6);
    });
    onboarding.close();
    company.close();
    users.close();
  });

  it('rechaza correo de admin de otro tenant', () => {
    const shared = path.join(
      os.tmpdir(),
      `onb-email-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    );
    const a = buildService(shared, 'tenant-a');
    const b = buildService(shared, 'tenant-b');
    a.users.create({
      tenantId: 'tenant-a',
      email: 'shared@mail.local',
      name: 'A',
      role: 'ADMIN',
      passwordHash: new PasswordHasher().hash('secret12'),
    });
    expect(() =>
      runWithTenant('tenant-b', () =>
        b.service.finish({
          company: { companyName: 'B Corp' },
          admin: {
            name: 'B',
            email: 'shared@mail.local',
            password: 'secret12',
          },
        }),
      ),
    ).toThrow(OnboardingValidationError);
    a.onboarding.close();
    a.company.close();
    a.users.close();
    b.onboarding.close();
    b.company.close();
    b.users.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('Onboarding API error paths', () => {
  it('responde 500 si el servicio falla', async () => {
    const broken = {
      getStatus: () => {
        throw new Error('boom-get');
      },
      setStep: () => {
        throw new Error('boom-step');
      },
      finish: () => {
        throw new Error('boom-finish');
      },
    } as unknown as OnboardingService;

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-onboarding-errors'),
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
      onboardingService: broken,
    });
    const listening = await listen(app);

    const get = await fetch(`${listening.baseUrl}/api/onboarding`);
    expect(get.status).toBe(500);
    const step = await fetch(`${listening.baseUrl}/api/onboarding/step`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 2 }),
    });
    expect(step.status).toBe(500);
    const finish = await fetch(`${listening.baseUrl}/api/onboarding/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { companyName: 'X' },
        admin: { name: 'A', email: 'a@b.com', password: 'secret12' },
      }),
    });
    expect(finish.status).toBe(500);

    await listening.close();
  });
});

describe('GET/POST /api/onboarding', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let sharedPath: string;
  let handles: ReturnType<typeof buildService>;

  beforeAll(async () => {
    sharedPath = path.join(
      os.tmpdir(),
      `onb-api-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    );
    handles = buildService(sharedPath, 'rodacenter');

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-onboarding-api'),
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
      onboardingService: handles.service,
      companyService: new CompanyService(handles.company),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    handles.onboarding.close();
    handles.company.close();
    handles.users.close();
    try {
      fs.unlinkSync(sharedPath);
    } catch {
      /* ignore */
    }
  });

  it('GET devuelve completed/step/progress', async () => {
    const res = await fetch(`${baseUrl}/api/onboarding`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      completed: boolean;
      step: number;
      progress: number;
    };
    expect(body.completed).toBe(false);
    expect(body.step).toBeGreaterThanOrEqual(1);
    expect(body.progress).toBeGreaterThanOrEqual(0);
  });

  it('PUT /step guarda progreso', async () => {
    const res = await fetch(`${baseUrl}/api/onboarding/step`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 3 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { step: number; completed: boolean };
    expect(body.completed).toBe(false);
    expect(body.step).toBe(3);

    const bad = await fetch(`${baseUrl}/api/onboarding/step`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step: 'x' }),
    });
    expect(bad.status).toBe(400);
  });

  it('POST finish completa la instalación', async () => {
    const invalid = await fetch(`${baseUrl}/api/onboarding/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { companyName: '' },
        admin: { name: 'R', email: 'r@x.com', password: 'secret99' },
      }),
    });
    expect(invalid.status).toBe(400);

    const res = await fetch(`${baseUrl}/api/onboarding/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: {
          companyName: 'API Install',
          city: 'Bogotá',
          primaryColor: '#abcdef',
        },
        admin: {
          name: 'Root',
          email: 'root@api-install.local',
          password: 'secret99',
        },
        version: '1.0.0',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      alreadyCompleted: boolean;
      status: { completed: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.alreadyCompleted).toBe(false);
    expect(body.status.completed).toBe(true);

    const again = await fetch(`${baseUrl}/api/onboarding/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: { companyName: 'API Install' },
        admin: {
          name: 'Root',
          email: 'root@api-install.local',
          password: 'secret99',
        },
      }),
    });
    const againBody = (await again.json()) as { alreadyCompleted: boolean };
    expect(againBody.alreadyCompleted).toBe(true);

    const get = await fetch(`${baseUrl}/api/onboarding`);
    const status = (await get.json()) as { completed: boolean; progress: number };
    expect(status.completed).toBe(true);
    expect(status.progress).toBe(100);
  });
});
