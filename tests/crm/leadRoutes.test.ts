import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LeadService } from '../../src/application/services/LeadService';
import { LeadService as LeadServiceImpl } from '../../src/application/services/LeadService';
import type { NotificationService } from '../../src/application/services/NotificationService';
import { createApp } from '../../src/presentation/http/createApp';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';

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

describe('CRM leadRoutes HTTP', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let leadService: LeadService;
  let leadRepo: InMemoryLeadRepository;
  let customers: InMemoryCustomerRepository;

  beforeAll(async () => {
    leadRepo = new InMemoryLeadRepository();
    customers = new InMemoryCustomerRepository();
    const interactions = new InMemoryInteractionRepository();
    const vehicles = new InMemoryVehicleProfileRepository();
    leadService = new LeadServiceImpl(
      leadRepo,
      stubNotifications(),
      interactions,
    );
    const customerProfileService = new CustomerProfileService(
      customers,
      leadRepo,
      vehicles,
      interactions,
    );
    const interactionService = new InteractionService(interactions);

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-crm-leads'),
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

  async function seedLead() {
    const customer = await customers.findOrCreate(
      '573009990001',
      'whatsapp',
      'Ana',
    );
    return leadService.createLead({
      customerId: customer.id,
      conversationId: `conv-${Date.now()}-${Math.random()}`,
      phone: customer.phone,
      name: 'Ana',
      product: 'Batería',
      vehicleBrand: 'CHEVROLET',
      vehicleModel: 'Spark',
      year: '2018',
      recommendation: '75D23L',
      recommendationSnapshot: {
        outcome: 'matched',
        query: { marca: 'CHEVROLET', modelo: 'Spark', year: '2018' },
        options: [{ reference: '75D23L', productLine: 'willard' }],
        summary: '75D23L',
      },
      needsHumanHandoff: true,
    });
  }

  it('GET /api/leads lista con campos CRM extendidos (compat dashboard)', async () => {
    const lead = await seedLead();
    const res = await fetch(`${baseUrl}/api/leads`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      count: number;
      items: Array<Record<string, unknown>>;
    };
    expect(body.count).toBeGreaterThanOrEqual(1);
    const item = body.items.find((i) => i.id === lead.id);
    expect(item).toBeDefined();
    expect(item!.phone).toBe('573009990001');
    expect(item!.status).toBe('nuevo');
    expect(item!.priority).toBeTruthy();
    expect(item!.createdAt).toBeTruthy();
    expect(item!.recommendationSnapshot).toMatchObject({
      outcome: 'matched',
    });
  });

  it('GET /api/leads filtra por status y priority', async () => {
    const lead = await seedLead();
    const res = await fetch(
      `${baseUrl}/api/leads?status=nuevo&priority=${encodeURIComponent(String(lead.priority))}&product=${encodeURIComponent('Batería')}`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items.some((i) => i.id === lead.id)).toBe(true);
  });

  it('GET /api/leads/:id y /events', async () => {
    const lead = await seedLead();
    const detail = await fetch(`${baseUrl}/api/leads/${lead.id}`);
    expect(detail.status).toBe(200);
    const d = (await detail.json()) as { id: string; status: string };
    expect(d.id).toBe(lead.id);

    const events = await fetch(`${baseUrl}/api/leads/${lead.id}/events`);
    expect(events.status).toBe(200);
    const e = (await events.json()) as {
      items: Array<{ type: string }>;
    };
    expect(e.items.some((x) => x.type === 'lead.created')).toBe(true);
  });

  it('GET /api/leads/:id → 404', async () => {
    const res = await fetch(`${baseUrl}/api/leads/does-not-exist`);
    expect(res.status).toBe(404);
  });

  it('PATCH status usa changeStatus; transición ilegal → 409', async () => {
    const lead = await seedLead();
    const ok = await fetch(`${baseUrl}/api/leads/${lead.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cotizado' }),
    });
    expect(ok.status).toBe(200);
    const updated = (await ok.json()) as { id: string; status: string };
    expect(updated.status).toBe('cotizado');

    const bad = await fetch(`${baseUrl}/api/leads/${lead.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'nuevo' }),
    });
    expect(bad.status).toBe(409);
  });

  it('PATCH status body inválido → 400', async () => {
    const lead = await seedLead();
    const res = await fetch(`${baseUrl}/api/leads/${lead.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'nope' }),
    });
    expect(res.status).toBe(400);
  });

  it('POST assign / claim / notes / recontact', async () => {
    const lead = await seedLead();

    const assigned = await fetch(`${baseUrl}/api/leads/${lead.id}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: 'adv-1', assigneeName: 'Luis' }),
    });
    expect(assigned.status).toBe(200);
    const a = (await assigned.json()) as {
      status: string;
      assignment: { assigneeId: string };
    };
    expect(a.status).toBe('asignado');
    expect(a.assignment.assigneeId).toBe('adv-1');

    const claimMissing = await fetch(`${baseUrl}/api/leads/${lead.id}/claim`, {
      method: 'POST',
    });
    expect(claimMissing.status).toBe(400);

    const claimed = await fetch(`${baseUrl}/api/leads/${lead.id}/claim`, {
      method: 'POST',
      headers: { 'X-Actor-Id': 'adv-2', 'X-Actor-Name': 'Maria' },
    });
    expect(claimed.status).toBe(200);
    const c = (await claimed.json()) as {
      status: string;
      assignment: { assigneeId: string };
    };
    expect(c.status).toBe('en_gestion');
    expect(c.assignment.assigneeId).toBe('adv-2');

    const noted = await fetch(`${baseUrl}/api/leads/${lead.id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'adv-2' },
      body: JSON.stringify({ note: 'Llamar mañana' }),
    });
    expect(noted.status).toBe(200);
    const n = (await noted.json()) as { notes: string };
    expect(n.notes).toContain('Llamar mañana');

    const recontact = await fetch(`${baseUrl}/api/leads/${lead.id}/recontact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dueAt: '2026-08-01T15:00:00.000Z',
        note: 'Seguimiento',
      }),
    });
    expect(recontact.status).toBe(200);
    const r = (await recontact.json()) as { status: string };
    expect(r.status).toBe('recontacto');

    const done = await fetch(`${baseUrl}/api/leads/${lead.id}/recontact/done`, {
      method: 'POST',
    });
    expect(done.status).toBe(200);
    const d = (await done.json()) as { status: string };
    expect(d.status).toBe('en_gestion');
  });
});
