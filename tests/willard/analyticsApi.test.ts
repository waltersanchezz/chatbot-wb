import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from '../../src/application/services/AnalyticsService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  monthStartBogota,
  SQLiteAnalyticsRepository,
} from '../../src/infrastructure/persistence/SQLiteAnalyticsRepository';
import { dayBoundsBogota } from '../../src/infrastructure/persistence/SQLiteDashboardRepository';
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

describe('SQLiteAnalyticsRepository', () => {
  it('agrega conversaciones, leads, tops y tasas desde SQLite', () => {
    const now = Date.UTC(2026, 7, 1, 18, 0, 0); // 1 Ago 2026 13:00 Bogota
    const repo = new SQLiteAnalyticsRepository(':memory:', { now: () => now });
    const { start } = dayBoundsBogota(now);
    const weekAgo = start - 3 * 86_400_000;
    const prevMonth = monthStartBogota(now) - 5 * 86_400_000;

    repo.insertLearningEvent({
      id: 'e1',
      conversationId: 'c-today',
      waId: 'wa:1',
      timestamp: start + 3_600_000,
      durationMs: 120_000,
      salesState: 'READY_FOR_ADVISOR',
      accepted: 1,
      brand: 'KIA',
      model: 'Rio',
      year: '2019',
      reference: 'FAKE-RIO',
      technicalQuestion: 'amperaje',
    });
    repo.insertLearningEvent({
      id: 'e2',
      conversationId: 'c-week',
      waId: 'wa:2',
      timestamp: weekAgo + 3_600_000,
      durationMs: 60_000,
      salesState: 'WAITING_CONFIRMATION',
      accepted: 0,
      brand: 'KIA',
      model: 'Rio',
      year: '2019',
      reference: 'FAKE-RIO',
      technicalQuestion: 'amperaje',
    });
    repo.insertLearningEvent({
      id: 'e3',
      conversationId: 'c-old',
      waId: 'wa:3',
      timestamp: prevMonth,
      durationMs: 90_000,
      salesState: 'CLOSED',
      abandoned: 1,
      brand: 'RENAULT',
      model: 'Logan',
      reference: 'FAKE-LOG',
      technicalQuestion: 'garantia',
    });
    repo.upsertPersistedSession({
      waId: 'wa:1',
      conversationId: 'c-today',
      state: 'READY_FOR_ADVISOR',
      leadScore: 80,
      updatedAt: now,
      expiresAt: now + 3_600_000,
    });
    repo.upsertPersistedSession({
      waId: 'wa:4',
      conversationId: 'c-sess',
      state: 'RECOMMENDATION_READY',
      leadScore: 60,
      updatedAt: now,
      expiresAt: now + 3_600_000,
    });

    const analytics = repo.getAnalytics();

    expect(analytics.conversaciones.hoy).toBe(1);
    // semana = últimos 7 días (incluye evento mid-week); mes = calendario (solo hoy en ago).
    expect(analytics.conversaciones.semana).toBeGreaterThanOrEqual(2);
    expect(analytics.conversaciones.mes).toBe(1);
    expect(analytics.leads.generados).toBeGreaterThanOrEqual(3);
    expect(analytics.leads.listosParaAsesor).toBeGreaterThanOrEqual(1);
    expect(analytics.leads.abandonados).toBe(1);
    expect(analytics.leads.cerrados).toBeGreaterThanOrEqual(1);
    expect(analytics.topReferencias[0]?.label).toBe('FAKE-RIO');
    expect(analytics.topReferencias[0]?.count).toBe(2);
    expect(analytics.topVehiculos[0]?.label).toMatch(/KIA Rio/);
    expect(analytics.topPreguntasTecnicas[0]?.label).toBe('amperaje');
    expect(analytics.promedioLeadScore).toBe(70);
    expect(analytics.tiempoPromedioConversacionMs).toBeGreaterThan(0);
    expect(analytics.tiempoPromedioConversacion).toMatch(/^\d+:\d{2}$/);
    expect(analytics.tasaAceptacion).toBe(0.5);
    expect(analytics.generatedAt).toBeTruthy();

    repo.close();
  });

  it('monthStartBogota alinea al mes local', () => {
    const now = Date.UTC(2026, 7, 15, 18, 0, 0);
    const start = monthStartBogota(now);
    const { start: dayStart } = dayBoundsBogota(Date.UTC(2026, 7, 1, 12, 0, 0));
    expect(start).toBe(dayStart);
  });
});

describe('GET /api/analytics', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let repo: SQLiteAnalyticsRepository;

  beforeAll(async () => {
    const now = Date.UTC(2026, 7, 1, 16, 0, 0);
    repo = new SQLiteAnalyticsRepository(':memory:', { now: () => now });
    const { start } = dayBoundsBogota(now);
    repo.insertLearningEvent({
      id: 'api-1',
      conversationId: 'c-api',
      waId: 'wa:+57300111',
      timestamp: start + 2_000_000,
      durationMs: 150_000,
      salesState: 'READY_FOR_ADVISOR',
      accepted: 1,
      brand: 'CHEVROLET',
      model: 'Spark',
      year: '2018',
      reference: 'FAKE-SP',
      technicalQuestion: 'cca',
    });
    repo.upsertPersistedSession({
      waId: 'wa:+57300111',
      conversationId: 'c-api',
      state: 'READY_FOR_ADVISOR',
      leadScore: 88,
      updatedAt: now,
      expiresAt: now + 3_600_000,
    });

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-analytics-api'),
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
      analyticsService: new AnalyticsService(repo),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    repo.close();
  });

  it('devuelve AnalyticsDto completo', async () => {
    const res = await fetch(`${baseUrl}/api/analytics`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      conversaciones: { hoy: number; semana: number; mes: number };
      leads: {
        generados: number;
        listosParaAsesor: number;
        abandonados: number;
        cerrados: number;
      };
      topReferencias: Array<{ label: string; count: number }>;
      topVehiculos: Array<{ label: string; count: number }>;
      topPreguntasTecnicas: Array<{ label: string; count: number }>;
      promedioLeadScore: number;
      tiempoPromedioConversacion: string;
      tasaAceptacion: number;
      generatedAt: string;
    };

    expect(body.conversaciones.hoy).toBe(1);
    expect(body.leads.listosParaAsesor).toBeGreaterThanOrEqual(1);
    expect(body.topReferencias[0]?.label).toBe('FAKE-SP');
    expect(body.topVehiculos[0]?.label).toMatch(/CHEVROLET Spark/);
    expect(body.topPreguntasTecnicas[0]?.label).toBe('cca');
    expect(body.promedioLeadScore).toBe(88);
    expect(body.tasaAceptacion).toBe(1);
    expect(body.tiempoPromedioConversacion).toMatch(/^\d+:\d{2}$/);
    expect(body.generatedAt).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM learning/i);
  });
});
