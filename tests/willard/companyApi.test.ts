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
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteCompanyRepository } from '../../src/infrastructure/persistence/SQLiteCompanyRepository';
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

describe('SQLiteCompanyRepository', () => {
  it('lee defaults y actualiza configuración del tenant', () => {
    const now = Date.UTC(2026, 7, 1, 18, 0, 0);
    const repo = new SQLiteCompanyRepository(':memory:', {
      tenantId: 'rodacenter',
      now: () => now,
    });

    const initial = repo.getCompany();
    expect(initial.tenantId).toBe('rodacenter');
    expect(initial.companyName).toBe('Rodacenter');
    expect(initial.primaryColor).toMatch(/^#/);

    const updated = repo.updateCompany({
      companyName: 'Rodacenter Manizales',
      phone: '+573001112233',
      email: 'hola@rodacenter.com',
      welcomeMessage: '¡Bienvenido!',
      primaryColor: '#112233',
      secondaryColor: '#445566',
      city: 'Manizales',
      country: 'Colombia',
      businessType: 'Baterías',
      workingHours: 'Lun-Vie 8-18',
      website: 'https://rodacenter.com',
      address: 'Calle 1',
      logoUrl: 'https://cdn.example/logo.png',
    });

    expect(updated.companyName).toBe('Rodacenter Manizales');
    expect(updated.phone).toBe('+573001112233');
    expect(updated.welcomeMessage).toBe('¡Bienvenido!');
    expect(updated.primaryColor).toBe('#112233');
    expect(updated.city).toBe('Manizales');
    expect(repo.getCompany().email).toBe('hola@rodacenter.com');

    repo.close();
  });

  it('aísla configuración por tenant', () => {
    const shared = path.join(
      os.tmpdir(),
      `company-iso-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
    );

    const a = new SQLiteCompanyRepository(shared, { tenantId: 'tenant-a' });
    const b = new SQLiteCompanyRepository(shared, { tenantId: 'tenant-b' });

    a.updateCompany({ companyName: 'Empresa A', primaryColor: '#aaaaaa' });
    b.updateCompany({ companyName: 'Empresa B', primaryColor: '#bbbbbb' });

    expect(a.getCompany().companyName).toBe('Empresa A');
    expect(b.getCompany().companyName).toBe('Empresa B');
    expect(a.getCompany().primaryColor).toBe('#aaaaaa');
    expect(b.getCompany().primaryColor).toBe('#bbbbbb');

    a.close();
    b.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });
});

describe('CompanyService', () => {
  it('delega get/update al repositorio', () => {
    const repo = new SQLiteCompanyRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const service = new CompanyService(repo);
    expect(service.getCompany().tenantId).toBe('rodacenter');
    const updated = service.updateCompany({ companyName: 'Via Service' });
    expect(updated.companyName).toBe('Via Service');
    repo.close();
  });

  it('usa TenantContext cuando no hay tenant fijo', () => {
    const repo = new SQLiteCompanyRepository(':memory:');
    const service = new CompanyService(repo);
    runWithTenant('acme', () => {
      service.updateCompany({ companyName: 'ACME Corp' });
      expect(service.getCompany().companyName).toBe('ACME Corp');
      expect(service.getCompany().tenantId).toBe('acme');
    });
    runWithTenant('rodacenter', () => {
      expect(service.getCompany().companyName).toBe('Rodacenter');
    });
    repo.close();
  });
});

describe('GET/PUT /api/company', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let repo: SQLiteCompanyRepository;

  beforeAll(async () => {
    repo = new SQLiteCompanyRepository(':memory:', { tenantId: 'rodacenter' });
    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-company-api'),
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
      companyService: new CompanyService(repo),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    repo.close();
  });

  it('GET devuelve CompanyDto', async () => {
    const res = await fetch(`${baseUrl}/api/company`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantId: string; companyName: string };
    expect(body.tenantId).toBe('rodacenter');
    expect(body.companyName).toBeTruthy();
  });

  it('PUT actualiza y GET refleja cambios', async () => {
    const put = await fetch(`${baseUrl}/api/company`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: 'API Corp',
        phone: '+57000',
        welcomeMessage: 'Hola API',
        primaryColor: '#abcdef',
      }),
    });
    expect(put.status).toBe(200);
    const updated = (await put.json()) as {
      companyName: string;
      phone: string;
      welcomeMessage: string;
      primaryColor: string;
    };
    expect(updated.companyName).toBe('API Corp');
    expect(updated.phone).toBe('+57000');
    expect(updated.welcomeMessage).toBe('Hola API');
    expect(updated.primaryColor).toBe('#abcdef');

    const get = await fetch(`${baseUrl}/api/company`);
    const body = (await get.json()) as { companyName: string };
    expect(body.companyName).toBe('API Corp');
  });
});
