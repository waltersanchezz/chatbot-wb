import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClientService } from '../../src/application/services/ClientService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { SQLiteClientRepository } from '../../src/infrastructure/persistence/SQLiteClientRepository';
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

describe('SQLiteClientRepository', () => {
  it('agrega clientes, busca, ordena y detalla', () => {
    const repo = new SQLiteClientRepository(':memory:');
    const t0 = Date.UTC(2026, 6, 30, 10, 0, 0);
    const t1 = Date.UTC(2026, 6, 31, 12, 0, 0);
    const t2 = Date.UTC(2026, 6, 31, 15, 0, 0);

    repo.upsertSession({
      waId: 'wa:+57300111',
      conversationId: 'c-carlos-1',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 80,
      lastReference: 'FAKE-LOG',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015' },
      customerName: 'Carlos Mejía',
      savedAt: t0,
      updatedAt: t1,
    });
    // Segunda conversación del mismo cliente (learning)
    repo.insertLearningEvent({
      id: 'le-1',
      conversationId: 'c-carlos-2',
      waId: 'wa:+57300111',
      brand: 'MAZDA',
      model: '2',
      year: '2020',
      reference: 'FAKE-M2',
      salesState: 'IDENTIFYING_VEHICLE',
      timestamp: t2,
    });

    repo.upsertSession({
      waId: 'wa:+57300222',
      conversationId: 'c-laura',
      state: 'WAITING_CONFIRMATION',
      salesFlowState: 'WAITING_CONFIRMATION',
      leadScore: 60,
      lastReference: 'FAKE-SP',
      vehicle: { brand: 'CHEVROLET', model: 'Spark', year: '2018' },
      customerName: 'Laura',
      savedAt: t1,
      updatedAt: t1,
    });

    const list = repo.list({
      page: 1,
      pageSize: 10,
      sortBy: 'ultimaActividad',
      sortOrder: 'desc',
    });
    expect(list.total).toBe(2);
    const carlos = list.items.find((c) => c.waId === 'wa:+57300111')!;
    expect(carlos.nombre).toBe('Carlos Mejía');
    expect(carlos.cantidadConversaciones).toBe(2);
    expect(carlos.cantidadVehiculos).toBe(2);
    expect(carlos.leadPromedio).toBe(80);
    expect(carlos.ultimaReferencia).toBeTruthy();

    expect(repo.list({ q: 'logan' }).total).toBe(1);
    expect(repo.list({ q: 'fake-log' }).total).toBe(1);
    expect(repo.list({ q: 'carlos' }).total).toBe(1);

    const detail = repo.findById('wa:+57300111');
    expect(detail).toBeTruthy();
    expect(detail!.conversaciones).toHaveLength(2);
    expect(detail!.vehiculos.length).toBeGreaterThanOrEqual(2);
    expect(detail!.referenciasRecomendadas).toEqual(
      expect.arrayContaining(['FAKE-LOG', 'FAKE-M2']),
    );
    expect(detail!.leadPromedio).toBe(80);

    expect(repo.findById('missing')).toBeNull();
    repo.close();
  });
});

describe('GET /api/clients', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let repo: SQLiteClientRepository;

  beforeAll(async () => {
    repo = new SQLiteClientRepository(':memory:');
    repo.upsertSession({
      waId: 'wa:+57300999',
      conversationId: 'c-api-client',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 88,
      lastReference: 'FAKE-LOG',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015' },
      customerName: 'Andrés',
      savedAt: Date.UTC(2026, 6, 31, 8, 0, 0),
      updatedAt: Date.UTC(2026, 6, 31, 9, 0, 0),
    });

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-clients-api'),
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
      clientService: new ClientService(repo),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    repo.close();
  });

  it('lista clientes DTO', async () => {
    const res = await fetch(`${baseUrl}/api/clients?sortBy=leadPromedio&sortOrder=desc`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      items: Array<Record<string, unknown>>;
    };
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({
      nombre: 'Andrés',
      waId: 'wa:+57300999',
      cantidadConversaciones: 1,
      leadPromedio: 88,
      ultimaReferencia: 'FAKE-LOG',
      estadoUltimaConversacion: 'READY_FOR_ADVISOR',
    });
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM persisted/i);
  });

  it('detalle por id', async () => {
    const res = await fetch(
      `${baseUrl}/api/clients/${encodeURIComponent('wa:+57300999')}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      waId: string;
      vehiculos: Array<{ label: string }>;
      conversaciones: unknown[];
      referenciasRecomendadas: string[];
    };
    expect(body.waId).toBe('wa:+57300999');
    expect(body.vehiculos[0]?.label).toMatch(/Logan/i);
    expect(body.conversaciones).toHaveLength(1);
    expect(body.referenciasRecomendadas).toContain('FAKE-LOG');
  });

  it('404 si no existe', async () => {
    const res = await fetch(`${baseUrl}/api/clients/wa%3Anope`);
    expect(res.status).toBe(404);
  });
});
