import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConversationDetailService } from '../../src/application/services/ConversationDetailService';
import { ConversationService } from '../../src/application/services/ConversationService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { SQLiteConversationDetailRepository } from '../../src/infrastructure/persistence/SQLiteConversationDetailRepository';
import { SQLiteConversationRepository } from '../../src/infrastructure/persistence/SQLiteConversationRepository';
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

describe('SQLiteConversationRepository', () => {
  it('lista, busca, ordena y pagina conversaciones', () => {
    const repo = new SQLiteConversationRepository(':memory:');
    const t0 = Date.UTC(2026, 6, 31, 10, 0, 0);
    const t1 = Date.UTC(2026, 6, 31, 12, 0, 0);
    const t2 = Date.UTC(2026, 6, 31, 14, 0, 0);

    repo.upsertSession({
      waId: 'wa:+57300111',
      conversationId: 'c-logan',
      state: 'WAITING_CONFIRMATION',
      salesFlowState: 'WAITING_CONFIRMATION',
      leadScore: 72,
      lastReference: 'FAKE-LOG',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015' },
      customerName: 'Carlos Mejía',
      savedAt: t0,
      updatedAt: t1,
    });
    repo.upsertSession({
      waId: 'wa:+57300222',
      conversationId: 'c-mazda',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 90,
      lastReference: 'FAKE-M2',
      vehicle: { brand: 'MAZDA', model: '2', year: '2020' },
      customerName: 'Laura Gómez',
      savedAt: t0,
      updatedAt: t2,
    });
    repo.insertLearningEvent({
      id: 'le-1',
      conversationId: 'c-only-learning',
      waId: 'wa:+57300333',
      brand: 'KIA',
      model: 'Rio',
      year: '2019',
      reference: 'FAKE-KIA',
      salesState: 'IDENTIFYING_VEHICLE',
      timestamp: t1,
    });

    const all = repo.list({ page: 1, pageSize: 10, sortBy: 'lastActivityAt', sortOrder: 'desc' });
    expect(all.total).toBe(3);
    expect(all.items[0]?.id).toBe('c-mazda');
    expect(all.items.find((i) => i.id === 'c-logan')?.customerName).toBe('Carlos Mejía');
    expect(all.items.find((i) => i.id === 'c-logan')?.year).toBe('2015');
    expect(all.items.find((i) => i.id === 'c-logan')?.leadScore).toBe(72);

    const search = repo.list({ q: 'logan', sortBy: 'createdAt', sortOrder: 'asc' });
    expect(search.total).toBe(1);
    expect(search.items[0]?.recommendedReference).toBe('FAKE-LOG');

    const page1 = repo.list({ page: 1, pageSize: 2, sortBy: 'lastActivityAt', sortOrder: 'desc' });
    expect(page1.items).toHaveLength(2);
    expect(page1.totalPages).toBe(2);

    const page2 = repo.list({ page: 2, pageSize: 2, sortBy: 'lastActivityAt', sortOrder: 'desc' });
    expect(page2.items).toHaveLength(1);

    repo.close();
  });
});

describe('GET /api/conversations', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let repo: SQLiteConversationRepository;

  beforeAll(async () => {
    repo = new SQLiteConversationRepository(':memory:');
    repo.upsertSession({
      waId: 'wa:+57300999',
      conversationId: 'c-api',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 88,
      lastReference: 'FAKE-LOG',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015' },
      customerName: 'Andrés',
      savedAt: Date.UTC(2026, 6, 31, 8, 0, 0),
      updatedAt: Date.UTC(2026, 6, 31, 9, 0, 0),
    });

    const conversationService = new ConversationService(repo);
    const detailRepo = new SQLiteConversationDetailRepository(':memory:');
    const conversationDetailService = new ConversationDetailService(detailRepo);
    const leadRepo = new InMemoryLeadRepository();
    const customers = new InMemoryCustomerRepository();
    const interactions = new InMemoryInteractionRepository();
    const vehicles = new InMemoryVehicleProfileRepository();

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-conversations-api'),
      leadService: new LeadService(
        leadRepo,
        { notifyNewLead: vi.fn(async () => false) } as never,
        interactions,
      ),
      customerProfileService: new CustomerProfileService(
        customers,
        leadRepo,
        vehicles,
        interactions,
      ),
      interactionService: new InteractionService(interactions),
      conversationService,
      conversationDetailService,
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    repo.close();
  });

  it('devuelve lista paginada DTO sin SQL', async () => {
    const res = await fetch(
      `${baseUrl}/api/conversations?page=1&pageSize=10&sortBy=lastActivityAt&sortOrder=desc`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
      page: number;
    };

    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.page).toBe(1);
    expect(body.items[0]).toMatchObject({
      id: 'c-api',
      phone: 'wa:+57300999',
      vehicle: 'RENAULT Logan',
      year: '2015',
      recommendedReference: 'FAKE-LOG',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 88,
      customerName: 'Andrés',
    });
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM persisted/i);
  });

  it('soporta búsqueda por query string', async () => {
    const res = await fetch(`${baseUrl}/api/conversations?q=mazda`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number };
    expect(body.total).toBe(0);

    const hit = await fetch(`${baseUrl}/api/conversations?q=logan`);
    const hitBody = (await hit.json()) as { total: number };
    expect(hitBody.total).toBe(1);
  });
});
