import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DashboardService } from '../../src/application/services/DashboardService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  dayBoundsBogota,
  formatDuration,
  SQLiteDashboardRepository,
} from '../../src/infrastructure/persistence/SQLiteDashboardRepository';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
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

describe('SQLiteDashboardRepository', () => {
  it('calcula métricas desde learning_events y persisted_sessions', () => {
    const now = Date.UTC(2026, 6, 31, 18, 0, 0); // 31 Jul 2026 13:00 Bogota
    const repo = new SQLiteDashboardRepository(':memory:', { now: () => now });
    const { start } = dayBoundsBogota(now);

    repo.insertLearningEvent({
      id: 'e1',
      conversationId: 'c1',
      waId: 'wa:1',
      timestamp: start + 3_600_000,
      durationMs: 120_000,
      salesState: 'WAITING_CONFIRMATION',
    });
    repo.insertLearningEvent({
      id: 'e2',
      conversationId: 'c1',
      waId: 'wa:1',
      timestamp: start + 4_000_000,
      durationMs: 180_000,
      salesState: 'READY_FOR_ADVISOR',
      accepted: 1,
    });
    repo.insertLearningEvent({
      id: 'e3',
      conversationId: 'c2',
      waId: 'wa:2',
      timestamp: start + 5_000_000,
      durationMs: 60_000,
      salesState: 'IDENTIFYING_VEHICLE',
    });
    repo.upsertPersistedSession({
      waId: 'wa:3',
      state: 'READY_FOR_ADVISOR',
      updatedAt: now,
      expiresAt: now + 3_600_000,
    });

    const summary = repo.getDashboardSummary(now);
    expect(summary.conversacionesHoy).toBe(2);
    expect(summary.clientesActivos).toBeGreaterThanOrEqual(2);
    expect(summary.leadsPendientes).toBeGreaterThanOrEqual(1);
    expect(summary.conversacionesCerradasHoy).toBeGreaterThanOrEqual(1);
    expect(summary.tiempoPromedioConversacionMs).toBeGreaterThan(0);
    expect(summary.tiempoPromedioConversacion).toMatch(/^\d+:\d{2}$/);
    expect(summary.generatedAt).toBeTruthy();

    repo.close();
  });

  it('formatDuration y dayBoundsBogota', () => {
    expect(formatDuration(125_000)).toBe('2:05');
    expect(formatDuration(0)).toBe('0:00');
    const bounds = dayBoundsBogota(Date.UTC(2026, 6, 31, 18, 0, 0));
    expect(bounds.end - bounds.start).toBe(86_400_000);
  });
});

describe('GET /api/dashboard', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let repo: SQLiteDashboardRepository;

  beforeAll(async () => {
    const now = Date.UTC(2026, 6, 31, 18, 0, 0);
    repo = new SQLiteDashboardRepository(':memory:', { now: () => now });
    const { start } = dayBoundsBogota(now);
    repo.insertLearningEvent({
      id: 'api-1',
      conversationId: 'conv-api',
      waId: 'wa:api',
      timestamp: start + 1_000,
      durationMs: 90_000,
      salesState: 'CLOSED',
      accepted: 1,
    });

    const dashboardService = new DashboardService(repo);
    const leadRepo = new InMemoryLeadRepository();
    const customers = new InMemoryCustomerRepository();
    const interactions = new InMemoryInteractionRepository();
    const vehicles = new InMemoryVehicleProfileRepository();

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-dashboard-api'),
      leadService: new LeadService(leadRepo, {
        notifyNewLead: vi.fn(async () => false),
      } as never, interactions),
      customerProfileService: new CustomerProfileService(
        customers,
        leadRepo,
        vehicles,
        interactions,
      ),
      interactionService: new InteractionService(interactions),
      dashboardService,
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    repo.close();
  });

  it('devuelve DashboardDto JSON sin SQL', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    expect(body).toMatchObject({
      conversacionesHoy: expect.any(Number),
      clientesActivos: expect.any(Number),
      leadsPendientes: expect.any(Number),
      conversacionesCerradasHoy: expect.any(Number),
      tiempoPromedioConversacionMs: expect.any(Number),
      tiempoPromedioConversacion: expect.any(String),
      generatedAt: expect.any(String),
    });
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM learning/i);
    expect(body.conversacionesHoy).toBeGreaterThanOrEqual(1);
  });
});
