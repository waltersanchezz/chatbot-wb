import type { AddressInfo } from 'net';
import type { Express } from 'express';
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
import { DashboardService } from '../../src/application/services/DashboardService';
import { SQLiteDashboardRepository } from '../../src/infrastructure/persistence/SQLiteDashboardRepository';

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

describe('PasswordHasher / JwtService', () => {
  it('hash y verify son consistentes', () => {
    const hasher = new PasswordHasher();
    const stored = hasher.hash('secret-pass');
    expect(hasher.verify('secret-pass', stored)).toBe(true);
    expect(hasher.verify('wrong', stored)).toBe(false);
  });

  it('firma y verifica JWT con claims de usuario', () => {
    const jwt = new JwtService('test-secret-16chars', 3600, () => Date.UTC(2026, 7, 1, 12));
    const token = jwt.sign({
      userId: 'u1',
      tenantId: 'rodacenter',
      role: 'ADMIN',
      name: 'Admin',
      email: 'admin@rodacenter.local',
    });
    const payload = jwt.verify(token);
    expect(payload?.userId).toBe('u1');
    expect(payload?.tenantId).toBe('rodacenter');
    expect(payload?.role).toBe('ADMIN');
  });
});

describe('Auth API', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let authService: AuthService;
  let users: SQLiteUserRepository;

  beforeAll(async () => {
    users = new SQLiteUserRepository(':memory:');
    const tenants = new SQLiteTenantRepository(':memory:');
    tenants.ensureDefault('rodacenter', 'Rodacenter');

    const hasher = new PasswordHasher();
    const jwt = new JwtService('test-secret-16chars-min', 3600);
    authService = new AuthService(users, jwt, hasher);
    authService.ensureSeedAdmin({
      tenantId: 'rodacenter',
      email: 'admin@rodacenter.local',
      name: 'Admin Rodacenter',
      password: 'admin123',
    });

    const dashboardRepo = new SQLiteDashboardRepository(':memory:');

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-auth-api'),
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
      dashboardService: new DashboardService(dashboardRepo),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    users.close();
  });

  it('POST /api/login devuelve token y usuario del tenant', async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@rodacenter.local',
        password: 'admin123',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      token: string;
      user: {
        userId: string;
        tenantId: string;
        role: string;
        name: string;
        email: string;
      };
    };
    expect(body.token.split('.')).toHaveLength(3);
    expect(body.user).toMatchObject({
      tenantId: 'rodacenter',
      role: 'ADMIN',
      name: 'Admin Rodacenter',
      email: 'admin@rodacenter.local',
    });
    expect(body.user.userId).toBeTruthy();
  });

  it('GET /api/me y protege /api/dashboard', async () => {
    const denied = await fetch(`${baseUrl}/api/dashboard`);
    expect(denied.status).toBe(401);

    const login = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@rodacenter.local',
        password: 'admin123',
      }),
    });
    const { token } = (await login.json()) as { token: string };

    const me = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { tenantId: string; role: string };
    expect(meBody.tenantId).toBe('rodacenter');
    expect(meBody.role).toBe('ADMIN');

    const dash = await fetch(`${baseUrl}/api/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(dash.status).toBe(200);

    await fetch(`${baseUrl}/api/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const afterLogout = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it('rechaza credenciales inválidas', async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@rodacenter.local',
        password: 'wrong',
      }),
    });
    expect(res.status).toBe(401);
  });
});
