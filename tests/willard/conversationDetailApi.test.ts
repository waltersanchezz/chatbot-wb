import type { AddressInfo } from 'net';
import type { Express } from 'express';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ConversationDetailService } from '../../src/application/services/ConversationDetailService';
import { ConversationService } from '../../src/application/services/ConversationService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { SQLiteConversationDetailRepository } from '../../src/infrastructure/persistence/SQLiteConversationDetailRepository';
import { SQLiteConversationRepository } from '../../src/infrastructure/persistence/SQLiteConversationRepository';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { createApp } from '../../src/presentation/http/createApp';

const fixtures = path.join(process.cwd(), 'tests', 'fixtures', 'willard');

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

describe('SQLiteConversationDetailRepository', () => {
  it('devuelve cliente, vehículo, score y timeline', () => {
    const repo = new SQLiteConversationDetailRepository(':memory:');
    const t0 = Date.UTC(2026, 6, 31, 10, 0, 0);
    const t1 = Date.UTC(2026, 6, 31, 10, 1, 0);
    const t2 = Date.UTC(2026, 6, 31, 10, 2, 0);

    repo.upsertSession({
      waId: 'wa:+573001112233',
      conversationId: 'c-detail-1',
      state: 'WAITING_CONFIRMATION',
      salesFlowState: 'WAITING_CONFIRMATION',
      leadScore: 75,
      matchKind: 'exact',
      lastReference: 'FAKE-LOG',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015', soundSystem: false },
      soundSystem: false,
      customerName: 'Carlos Mejía',
      messages: [
        {
          id: 'm1',
          role: 'customer',
          content: 'Necesito batería para Logan',
          createdAt: t0,
        },
        {
          id: 'm2',
          role: 'assistant',
          content: '¿De qué año es el vehículo?',
          createdAt: t1,
        },
        {
          id: 'm3',
          role: 'customer',
          content: '2015',
          createdAt: t2,
        },
      ],
      savedAt: t0,
      updatedAt: t2,
    });

    const detail = repo.findById('c-detail-1');
    expect(detail).toBeTruthy();
    expect(detail!.customerName).toBe('Carlos Mejía');
    expect(detail!.waId).toBe('wa:+573001112233');
    expect(detail!.vehicle).toBe('RENAULT Logan');
    expect(detail!.year).toBe('2015');
    expect(detail!.soundSystem).toBe(false);
    expect(detail!.recommendedReference).toBe('FAKE-LOG');
    expect(detail!.amperage).toBeNull();
    expect(detail!.caseType).toBeNull();
    expect(detail!.matchKind).toBe('exact');
    expect(detail!.leadScore).toBe(75);
    expect(detail!.salesFlowState).toBe('WAITING_CONFIRMATION');
    expect(detail!.timeline).toHaveLength(3);
    expect(detail!.timeline[0]?.sender).toBe('customer');
    expect(detail!.timeline[1]?.sender).toBe('bot');
    expect(detail!.timeline[2]?.text).toBe('2015');

    expect(repo.findById('missing')).toBeNull();
    repo.close();
  });

  it('enriquece amperaje y tipo de caja desde ficha Willard (solo lectura)', () => {
    const repo = new SQLiteConversationDetailRepository(':memory:');
    const knowledge = new CatalogFileWillardBatteryKnowledge(
      path.join(fixtures, 'apps-mini.json'),
      path.join(fixtures, 'refs-mini.json'),
    );
    const service = new ConversationDetailService(repo, knowledge);
    const t0 = Date.UTC(2026, 6, 31, 12, 0, 0);

    repo.upsertSession({
      waId: 'wa:+573001110000',
      conversationId: 'c-enrich-1',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 90,
      matchKind: 'exact',
      lastReference: 'W-L5-95AH',
      vehicle: {
        brand: 'BMW',
        model: '320i',
        year: '2015',
        soundSystem: true,
      },
      customerName: 'Ana',
      messages: [
        {
          id: 'm1',
          role: 'customer',
          content: 'BMW 320i 2015',
          createdAt: t0,
        },
      ],
      savedAt: t0,
      updatedAt: t0,
    });

    const detail = service.getById('c-enrich-1');
    expect(detail).toBeTruthy();
    expect(detail!.soundSystem).toBe(true);
    expect(detail!.recommendedReference).toBe('W-L5-95AH');
    expect(detail!.amperage).toMatch(/95 Ah/);
    expect(detail!.amperage).toMatch(/CCA/);
    expect(detail!.caseType).toBeTruthy();
    repo.close();
  });
});

describe('GET /api/conversations/:id', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let detailRepo: SQLiteConversationDetailRepository;

  beforeAll(async () => {
    detailRepo = new SQLiteConversationDetailRepository(':memory:');
    const t0 = Date.UTC(2026, 6, 31, 11, 0, 0);
    detailRepo.upsertSession({
      waId: 'wa:+573009998887',
      conversationId: 'c-http-detail',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 91,
      matchKind: 'similar',
      lastReference: 'FAKE-M2',
      vehicle: { brand: 'MAZDA', model: '2', year: '2020' },
      customerName: 'Laura',
      messages: [
        {
          id: 'a',
          role: 'customer',
          content: 'Hola',
          createdAt: t0,
        },
        {
          id: 'b',
          role: 'assistant',
          content: '¿Buscas baterías?',
          createdAt: t0 + 1000,
        },
      ],
      savedAt: t0,
      updatedAt: t0 + 1000,
    });

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-conversation-detail-api'),
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
      conversationService: new ConversationService(
        new SQLiteConversationRepository(':memory:'),
      ),
      conversationDetailService: new ConversationDetailService(detailRepo),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    detailRepo.close();
  });

  it('devuelve ConversationDetailDto con timeline', async () => {
    const res = await fetch(`${baseUrl}/api/conversations/c-http-detail`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      waId: string;
      timeline: Array<{ sender: string; text: string }>;
      leadScore: number;
      matchKind: string;
      soundSystem: boolean | null;
      amperage: string | null;
      caseType: string | null;
    };

    expect(body.id).toBe('c-http-detail');
    expect(body.waId).toBe('wa:+573009998887');
    expect(body.leadScore).toBe(91);
    expect(body.matchKind).toBe('similar');
    expect(body.soundSystem).toBeNull();
    expect(body.amperage).toBeNull();
    expect(body.caseType).toBeNull();
    expect(body.timeline).toHaveLength(2);
    expect(body.timeline[1]?.sender).toBe('bot');
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM persisted/i);
  });

  it('404 si no existe', async () => {
    const res = await fetch(`${baseUrl}/api/conversations/no-existe`);
    expect(res.status).toBe(404);
  });
});
