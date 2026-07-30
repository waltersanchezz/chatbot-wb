import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import type { NotificationService } from '../../src/application/services/NotificationService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { createApp } from '../../src/presentation/http/createApp';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';

function stubNotifications(): NotificationService {
  return {
    notifyNewLead: vi.fn(async () => false),
  } as unknown as NotificationService;
}

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

describe('CRM customerRoutes HTTP', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let customers: InMemoryCustomerRepository;
  let leadService: LeadService;
  let vehicles: InMemoryVehicleProfileRepository;
  let interactionService: InteractionService;
  let customerId: string;
  let phone: string;

  beforeAll(async () => {
    customers = new InMemoryCustomerRepository();
    const leadRepo = new InMemoryLeadRepository();
    vehicles = new InMemoryVehicleProfileRepository();
    const interactions = new InMemoryInteractionRepository();
    leadService = new LeadService(leadRepo, stubNotifications(), interactions);
    const customerProfileService = new CustomerProfileService(
      customers,
      leadRepo,
      vehicles,
      interactions,
    );
    interactionService = new InteractionService(interactions);

    phone = '573008887776';
    const customer = await customers.findOrCreate(phone, 'whatsapp', 'Carlos');
    customerId = customer.id;

    await leadService.createLead({
      customerId,
      conversationId: 'conv-cust-1',
      phone,
      name: 'Carlos',
      product: 'Batería',
      vehicleBrand: 'KIA',
      vehicleModel: 'Rio',
      year: '2020',
      recommendation: '55D23L',
    });

    const now = new Date('2026-07-29T12:00:00.000Z');
    await vehicles.upsert({
      id: 'veh-1',
      customerId,
      brand: 'KIA',
      model: 'Rio',
      year: '2020',
      source: 'whatsapp_flow',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await interactionService.append({
      customerId,
      at: new Date('2026-07-29T11:00:00.000Z'),
      type: 'conversation.started',
      channel: 'whatsapp',
      summary: 'Inicio',
      actor: 'system',
    });
    await interactionService.append({
      customerId,
      at: new Date('2026-07-29T13:00:00.000Z'),
      type: 'lead.created',
      channel: 'whatsapp',
      summary: 'Lead creado',
      actor: 'system',
      leadId: 'x',
    });

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-crm-customers'),
      leadService,
      customerProfileService,
      interactionService,
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
  });

  it('GET /api/customers/:customerId perfil', async () => {
    const res = await fetch(`${baseUrl}/api/customers/${customerId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      customerId: string;
      phone: string;
      openLeadCount: number;
      leads: unknown[];
      vehicles: unknown[];
      interactions: unknown[];
    };
    expect(body.customerId).toBe(customerId);
    expect(body.phone).toBe(phone);
    expect(body.openLeadCount).toBeGreaterThanOrEqual(1);
    expect(body.leads.length).toBeGreaterThanOrEqual(1);
    expect(body.vehicles.length).toBe(1);
  });

  it('GET /api/customers/by-phone/:phone', async () => {
    const res = await fetch(`${baseUrl}/api/customers/by-phone/${phone}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { customerId: string };
    expect(body.customerId).toBe(customerId);
  });

  it('GET by-phone desconocido → 404', async () => {
    const res = await fetch(`${baseUrl}/api/customers/by-phone/570000000000`);
    expect(res.status).toBe(404);
  });

  it('GET leads / vehicles / interactions', async () => {
    const leads = await fetch(`${baseUrl}/api/customers/${customerId}/leads`);
    expect(leads.status).toBe(200);
    const l = (await leads.json()) as { count: number; items: unknown[] };
    expect(l.count).toBeGreaterThanOrEqual(1);

    const vehs = await fetch(`${baseUrl}/api/customers/${customerId}/vehicles`);
    expect(vehs.status).toBe(200);
    const v = (await vehs.json()) as { count: number };
    expect(v.count).toBe(1);

    const ints = await fetch(
      `${baseUrl}/api/customers/${customerId}/interactions`,
    );
    expect(ints.status).toBe(200);
    const i = (await ints.json()) as {
      order: string;
      items: Array<{ at: string; type: string }>;
    };
    expect(i.order).toBe('desc');
    expect(i.items.length).toBeGreaterThanOrEqual(2);
    expect(new Date(i.items[0]!.at).getTime()).toBeGreaterThanOrEqual(
      new Date(i.items[1]!.at).getTime(),
    );
  });

  it('cliente inexistente → 404', async () => {
    const res = await fetch(`${baseUrl}/api/customers/no-such-customer`);
    expect(res.status).toBe(404);
  });
});
