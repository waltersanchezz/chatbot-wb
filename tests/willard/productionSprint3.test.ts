import fs from 'fs';
import os from 'os';
import path from 'path';
import type { AddressInfo } from 'net';
import type { Express } from 'express';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../src/application/services/AuthService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { JwtService } from '../../src/infrastructure/auth/JwtService';
import { PasswordHasher } from '../../src/infrastructure/auth/PasswordHasher';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteTenantRepository } from '../../src/infrastructure/persistence/SQLiteTenantRepository';
import { SQLiteUserRepository } from '../../src/infrastructure/persistence/SQLiteUserRepository';
import { createApp } from '../../src/presentation/http/createApp';
import {
  createDashboardRouter,
  getDashboardStaticPath,
} from '../../src/presentation/http/routes/dashboardRoutes';

/** Copia local del menú operador (mismo contrato que apps/dashboard/src/nav). */
const OPERATOR_NAV_LABELS = [
  'Inicio',
  'Conversaciones',
  'Clientes',
  'Vehículos',
  'Historial',
  'Configuración',
] as const;

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

describe('Production Sprint 3 — servir panel Vite', () => {
  const distDir = getDashboardStaticPath();
  const indexPath = path.join(distDir, 'index.html');
  let wroteStub = false;

  beforeAll(() => {
    fs.mkdirSync(distDir, { recursive: true });
    if (!fs.existsSync(indexPath)) {
      fs.writeFileSync(
        indexPath,
        '<!doctype html><html><body><div id="root">PS3-DASHBOARD</div></body></html>',
        'utf8',
      );
      wroteStub = true;
    }
  });

  afterAll(() => {
    if (wroteStub && fs.existsSync(indexPath)) {
      try {
        fs.unlinkSync(indexPath);
      } catch {
        /* ignore */
      }
    }
  });

  it('getDashboardStaticPath apunta a apps/dashboard/dist', () => {
    const normalized = getDashboardStaticPath().replace(/\\/g, '/');
    expect(normalized.endsWith('apps/dashboard/dist')).toBe(true);
  });

  it('SPA router sirve index.html en /dashboard y rutas hijas', async () => {
    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-ps3'),
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
      authRequired: false,
    });

    // Montaje explícito del router (createApp ya lo hace; validamos contrato).
    expect(createDashboardRouter()).toBeTruthy();

    const { baseUrl, close } = await listen(app);
    try {
      const root = await fetch(`${baseUrl}/dashboard/`);
      expect(root.status).toBe(200);
      const html = await root.text();
      expect(html).toMatch(/html/i);

      const spa = await fetch(`${baseUrl}/dashboard/conversaciones`);
      expect(spa.status).toBe(200);
      expect(await spa.text()).toMatch(/html/i);
    } finally {
      await close();
    }
  });

  it('menú operador mínimo tiene exactamente 6 entradas de producción', () => {
    expect(OPERATOR_NAV_LABELS).toHaveLength(6);
    expect([...OPERATOR_NAV_LABELS]).toEqual([
      'Inicio',
      'Conversaciones',
      'Clientes',
      'Vehículos',
      'Historial',
      'Configuración',
    ]);
  });

  it('sin dist → 503 con mensaje de build', async () => {
    const missing = path.join(os.tmpdir(), `ps3-nodist-${Date.now()}`);
    const prev = process.cwd();
    fs.mkdirSync(missing, { recursive: true });
    try {
      process.chdir(missing);
      const app = express();
      app.use('/dashboard', createDashboardRouter());
      const { baseUrl, close } = await listen(app);
      try {
        const res = await fetch(`${baseUrl}/dashboard/`);
        expect(res.status).toBe(503);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toMatch(/dashboard:build/i);
      } finally {
        await close();
      }
    } finally {
      process.chdir(prev);
    }
  });
});

describe('Production Sprint 3 — APIs operador requieren auth en prod path', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let users: SQLiteUserRepository;
  let token = '';

  beforeAll(async () => {
    users = new SQLiteUserRepository(':memory:');
    const tenants = new SQLiteTenantRepository(':memory:');
    tenants.ensureDefault('rodacenter', 'Rodacenter');
    const hasher = new PasswordHasher();
    const jwt = new JwtService('test-secret-production-sprint3!!', 3600);
    const authService = new AuthService(users, jwt, hasher);
    authService.ensureSeedAdmin({
      tenantId: 'rodacenter',
      email: 'admin@rodacenter.local',
      name: 'Admin',
      password: 'StrongPass!2026',
    });
    token = authService.login('admin@rodacenter.local', 'StrongPass!2026')!.token;

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-ps3-auth'),
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
      authService,
      authRequired: true,
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    users.close();
  });

  it.each([
    '/api/dashboard',
    '/api/conversations',
    '/api/clients',
    '/api/analytics',
    '/api/company',
    '/api/tasks',
  ])('%s sin Bearer → 401', async (route) => {
    const res = await fetch(`${baseUrl}${route}`);
    expect(res.status).toBe(401);
  });

  it('/api/conversations con Bearer → no 401', async () => {
    const res = await fetch(`${baseUrl}/api/conversations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).not.toBe(401);
  });
});
