import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { PipelineService } from '../../src/application/services/PipelineService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  mapStateToColumn,
  SQLitePipelineRepository,
} from '../../src/infrastructure/persistence/SQLitePipelineRepository';
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

describe('SQLitePipelineRepository', () => {
  it('agrupa tarjetas por columna SalesFlow', () => {
    const repo = new SQLitePipelineRepository(':memory:');
    const t = Date.UTC(2026, 6, 31, 12, 0, 0);

    repo.upsertSession({
      waId: 'wa:1',
      conversationId: 'c-new',
      state: 'NEW',
      salesFlowState: 'NEW',
      customerName: 'Ana',
      updatedAt: t,
    });
    repo.upsertSession({
      waId: 'wa:2',
      conversationId: 'c-id',
      state: 'IDENTIFYING_VEHICLE',
      salesFlowState: 'IDENTIFYING_VEHICLE',
      leadScore: 20,
      vehicle: { brand: 'KIA', model: 'Rio', year: '2019' },
      customerName: 'Bruno',
      updatedAt: t + 1000,
    });
    repo.upsertSession({
      waId: 'wa:3',
      conversationId: 'c-wait',
      state: 'WAITING_CONFIRMATION',
      salesFlowState: 'WAITING_CONFIRMATION',
      leadScore: 70,
      lastReference: 'FAKE-LOG',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015' },
      customerName: 'Carlos',
      updatedAt: t + 2000,
    });
    repo.upsertSession({
      waId: 'wa:4',
      conversationId: 'c-ready',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 95,
      lastReference: 'FAKE-M2',
      customerName: 'Diana',
      updatedAt: t + 3000,
    });
    repo.insertLearningEvent({
      id: 'le-closed',
      conversationId: 'c-closed',
      waId: 'wa:5',
      salesState: 'CLOSED',
      timestamp: t + 4000,
    });

    const pipeline = repo.getPipeline();
    expect(pipeline.columns).toHaveLength(6);
    expect(pipeline.totalCards).toBe(5);

    const byKey = Object.fromEntries(
      pipeline.columns.map((c) => [c.key, c]),
    ) as Record<string, (typeof pipeline.columns)[number]>;

    expect(byKey.NEW.count).toBe(1);
    expect(byKey.IDENTIFYING.count).toBe(1);
    expect(byKey.IDENTIFYING.cards[0]?.vehiculo).toMatch(/KIA Rio/);
    expect(byKey.WAITING_CONFIRMATION.cards[0]?.referencia).toBe('FAKE-LOG');
    expect(byKey.WAITING_CONFIRMATION.cards[0]?.leadScore).toBe(70);
    expect(byKey.READY_FOR_ADVISOR.cards[0]?.nombre).toBe('Diana');
    expect(byKey.CLOSED.count).toBe(1);

    expect(mapStateToColumn('IDENTIFYING_VEHICLE')).toBe('IDENTIFYING');
    expect(mapStateToColumn('UNKNOWN_X')).toBe('NEW');

    repo.close();
  });
});

describe('GET /api/pipeline', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let repo: SQLitePipelineRepository;

  beforeAll(async () => {
    repo = new SQLitePipelineRepository(':memory:');
    repo.upsertSession({
      waId: 'wa:+57300111',
      conversationId: 'c-pipe-api',
      state: 'RECOMMENDATION_READY',
      salesFlowState: 'RECOMMENDATION_READY',
      leadScore: 55,
      lastReference: 'FAKE-SP',
      vehicle: { brand: 'CHEVROLET', model: 'Spark', year: '2018' },
      customerName: 'Elena',
      updatedAt: Date.UTC(2026, 6, 31, 16, 0, 0),
    });

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-pipeline-api'),
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
      pipelineService: new PipelineService(repo),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    repo.close();
  });

  it('devuelve PipelineDto con columnas fijas', async () => {
    const res = await fetch(`${baseUrl}/api/pipeline`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      columns: Array<{ key: string; count: number; cards: unknown[] }>;
      totalCards: number;
    };

    expect(body.columns.map((c) => c.key)).toEqual([
      'NEW',
      'IDENTIFYING',
      'RECOMMENDATION_READY',
      'WAITING_CONFIRMATION',
      'READY_FOR_ADVISOR',
      'CLOSED',
    ]);
    expect(body.totalCards).toBe(1);
    const ready = body.columns.find((c) => c.key === 'RECOMMENDATION_READY');
    expect(ready?.count).toBe(1);
    expect(ready?.cards[0]).toMatchObject({
      id: 'c-pipe-api',
      nombre: 'Elena',
      referencia: 'FAKE-SP',
      leadScore: 55,
    });
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM persisted/i);
  });
});
