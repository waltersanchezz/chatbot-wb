import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import type { Interaction } from '../../src/domain/entities/Interaction';
import type { Lead } from '../../src/domain/entities/Lead';
import type { LeadEvent } from '../../src/domain/entities/LeadEvent';
import type { VehicleProfile } from '../../src/domain/entities/VehicleProfile';
import { runWithTenant } from '../../src/domain/tenant/TenantContext';
import { buildContainer } from '../../src/infrastructure/di/container';
import { resetCrmSqliteSharedMemory } from '../../src/infrastructure/persistence/crmSqlite';
import { ProjectingConversationRepository } from '../../src/infrastructure/persistence/ProjectingConversationRepository';
import { SQLiteChatConversationRepository } from '../../src/infrastructure/persistence/SQLiteChatConversationRepository';
import { SQLiteCustomerRepository } from '../../src/infrastructure/persistence/SQLiteCustomerRepository';
import { SQLiteInteractionRepository } from '../../src/infrastructure/persistence/SQLiteInteractionRepository';
import { SQLiteLeadRepository } from '../../src/infrastructure/persistence/SQLiteLeadRepository';
import { SQLiteVehicleProfileRepository } from '../../src/infrastructure/persistence/SQLiteVehicleProfileRepository';

function baseLead(
  overrides: Partial<Lead> & Pick<Lead, 'id' | 'conversationId' | 'customerId'>,
): Lead {
  return {
    createdAt: new Date('2026-07-29T10:00:00.000Z'),
    updatedAt: new Date('2026-07-29T10:00:00.000Z'),
    phone: '573001111111',
    product: 'Batería',
    vehicleBrand: 'CHEVROLET',
    vehicleModel: 'Spark',
    year: '2018',
    optionLabel: 'Planta de sonido',
    optionValue: false,
    recommendation: '75D23L',
    status: 'nuevo',
    priority: 'Media',
    channel: 'whatsapp',
    source: 'whatsapp_flow',
    ...overrides,
  };
}

afterEach(() => {
  resetCrmSqliteSharedMemory();
});

describe('Production Sprint 2 — DI producción usa SQLite CRM', () => {
  it('buildContainer cablea adapters SQLite (cero InMemory CRM)', () => {
    const c = buildContainer();
    expect(c.customers).toBeInstanceOf(SQLiteCustomerRepository);
    // R2: canal usa decorator que proyecta a persisted_sessions; CRM inner sigue SQLite.
    expect(c.conversations).toBeInstanceOf(ProjectingConversationRepository);
    expect(c.conversations.inner).toBeInstanceOf(SQLiteChatConversationRepository);
    expect(c.leadRepository).toBeInstanceOf(SQLiteLeadRepository);
    expect(c.vehicleProfiles).toBeInstanceOf(SQLiteVehicleProfileRepository);
    expect(c.interactions).toBeInstanceOf(SQLiteInteractionRepository);
  });
});

describe('Production Sprint 2 — restart / reopen DB', () => {
  it('lead + customer + conversation + vehicle + interaction sobreviven reopen', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps2-crm-'));
    const dbPath = path.join(dir, 'crm.sqlite');

    const customersA = new SQLiteCustomerRepository(dbPath);
    const leadsA = new SQLiteLeadRepository(dbPath);
    const conversationsA = new SQLiteChatConversationRepository(dbPath);
    const vehiclesA = new SQLiteVehicleProfileRepository(dbPath);
    const interactionsA = new SQLiteInteractionRepository(dbPath);

    const customer = await customersA.findOrCreate(
      '573009990001',
      'whatsapp',
      'Ana',
    );
    const now = new Date('2026-08-03T12:00:00.000Z');
    const conversation = await conversationsA.save({
      id: 'conv-ps2-1',
      customerId: customer.id,
      channel: 'whatsapp',
      externalId: 'whatsapp:573009990001',
      context: createEmptyContext(),
      messages: [
        {
          id: 'm1',
          conversationId: 'conv-ps2-1',
          role: 'customer',
          content: 'Necesito batería Spark 2018',
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-04T12:00:00.000Z'),
    });

    const vehicle: VehicleProfile = {
      id: 'vp-ps2-1',
      customerId: customer.id,
      brand: 'CHEVROLET',
      model: 'Spark',
      year: '2018',
      source: 'whatsapp_flow',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await vehiclesA.upsert(vehicle);

    const lead = await leadsA.save(
      baseLead({
        id: 'lead-ps2-1',
        conversationId: conversation.id,
        customerId: customer.id,
        phone: customer.phone,
        name: 'Ana',
        needsHumanHandoff: true,
        recommendationSnapshot: {
          outcome: 'matched',
          query: { marca: 'CHEVROLET', modelo: 'Spark' },
          options: [{ reference: '75D23L', productLine: 'willard' }],
          summary: '75D23L',
        },
      }),
    );

    const event: LeadEvent = {
      id: 'ev-ps2-1',
      leadId: lead.id,
      type: 'lead.created',
      at: now,
      actor: 'system',
    };
    await leadsA.appendEvent(event);

    const interaction: Interaction = {
      id: 'int-ps2-1',
      customerId: customer.id,
      at: now,
      type: 'lead.created',
      channel: 'whatsapp',
      leadId: lead.id,
      conversationId: conversation.id,
      summary: 'Lead creado',
      actor: 'system',
    };
    await interactionsA.append(interaction);

    // Simula redeploy: nuevas conexiones al mismo archivo.
    const customersB = new SQLiteCustomerRepository(dbPath);
    const leadsB = new SQLiteLeadRepository(dbPath);
    const conversationsB = new SQLiteChatConversationRepository(dbPath);
    const vehiclesB = new SQLiteVehicleProfileRepository(dbPath);
    const interactionsB = new SQLiteInteractionRepository(dbPath);

    expect(await customersB.findByPhone('573009990001')).toMatchObject({
      id: customer.id,
      name: 'Ana',
    });
    expect(await conversationsB.findByExternalId('whatsapp:573009990001')).toMatchObject({
      id: 'conv-ps2-1',
      messages: [{ content: 'Necesito batería Spark 2018' }],
    });
    expect(await leadsB.findById('lead-ps2-1')).toMatchObject({
      id: 'lead-ps2-1',
      recommendation: '75D23L',
      recommendationSnapshot: { outcome: 'matched' },
    });
    expect((await leadsB.listEvents('lead-ps2-1')).map((e) => e.id)).toEqual([
      'ev-ps2-1',
    ]);
    expect((await vehiclesB.listByCustomerId(customer.id))[0]?.model).toBe(
      'Spark',
    );
    expect(
      (await interactionsB.listByCustomerId(customer.id)).map((i) => i.id),
    ).toEqual(['int-ps2-1']);
  });
});

describe('Production Sprint 2 — contrato SQLite CRM', () => {
  it('Customer findOrCreate + aislamiento de mutaciones', async () => {
    const repo = new SQLiteCustomerRepository(':memory:');
    const a = await repo.findOrCreate('573001234567', 'whatsapp', 'Ana');
    const b = await repo.findOrCreate('573001234567', 'whatsapp');
    expect(a.id).toBe(b.id);
    a.name = 'Hacked';
    expect((await repo.findById(a.id))?.name).toBe('Ana');
  });

  it('Lead list filter + findByConversationId + updateStatus', async () => {
    const repo = new SQLiteLeadRepository(':memory:');
    await repo.save(
      baseLead({
        id: 'l1',
        conversationId: 'c1',
        customerId: 'cust-A',
        status: 'nuevo',
        priority: 'Alta',
      }),
    );
    await repo.save(
      baseLead({
        id: 'l2',
        conversationId: 'c2',
        customerId: 'cust-A',
        status: 'cotizado',
        priority: 'Baja',
        createdAt: new Date('2026-07-29T12:00:00.000Z'),
      }),
    );
    await repo.save(
      baseLead({
        id: 'l3',
        conversationId: 'c3',
        customerId: 'cust-B',
        status: 'nuevo',
        priority: 'Alta',
        phone: '573002222222',
        vehicleBrand: 'FORD',
        createdAt: new Date('2026-07-29T13:00:00.000Z'),
      }),
    );

    expect((await repo.list({ status: 'nuevo' })).map((l) => l.id)).toEqual([
      'l3',
      'l1',
    ]);
    expect((await repo.list({ q: 'ford' })).map((l) => l.id)).toEqual(['l3']);
    expect((await repo.findByConversationId('c1'))?.id).toBe('l1');

    const updated = await repo.updateStatus('l1', 'cotizado');
    expect(updated?.status).toBe('cotizado');
  });

  it('findOpenByCustomerId excluye terminales', async () => {
    const repo = new SQLiteLeadRepository(':memory:');
    await repo.save(
      baseLead({
        id: 'open-1',
        conversationId: 'c1',
        customerId: 'cust-X',
        status: 'nuevo',
      }),
    );
    await repo.save(
      baseLead({
        id: 'closed-1',
        conversationId: 'c2',
        customerId: 'cust-X',
        status: 'vendido',
        createdAt: new Date('2026-07-29T12:00:00.000Z'),
      }),
    );
    expect((await repo.findOpenByCustomerId('cust-X')).map((l) => l.id)).toEqual(
      ['open-1'],
    );
  });

  it('Interaction append-only + orden cronológico', async () => {
    const repo = new SQLiteInteractionRepository(':memory:');
    const base = {
      customerId: 'cust-1',
      channel: 'whatsapp' as const,
      summary: 'x',
      actor: 'system' as const,
    };
    await repo.append({
      ...base,
      id: 'i2',
      type: 'lead.status_changed',
      at: new Date('2026-07-29T12:00:00.000Z'),
    });
    await repo.append({
      ...base,
      id: 'i1',
      type: 'lead.created',
      at: new Date('2026-07-29T10:00:00.000Z'),
    });
    expect(
      (await repo.listByCustomerId('cust-1')).map((i) => i.id),
    ).toEqual(['i1', 'i2']);
    await expect(
      repo.append({
        ...base,
        id: 'i1',
        type: 'lead.created',
        at: new Date(),
      }),
    ).rejects.toThrow(/append-only/);
  });

  it('Conversation deleteExpired y Vehicle upsert', async () => {
    const conversations = new SQLiteChatConversationRepository(':memory:');
    const vehicles = new SQLiteVehicleProfileRepository(':memory:');
    const now = new Date('2026-08-03T12:00:00.000Z');

    await conversations.save({
      id: 'c-old',
      customerId: 'cust-1',
      channel: 'whatsapp',
      externalId: 'wa:old',
      context: createEmptyContext(),
      messages: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    await conversations.save({
      id: 'c-live',
      customerId: 'cust-1',
      channel: 'whatsapp',
      externalId: 'wa:live',
      context: createEmptyContext(),
      messages: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date('2026-08-10T00:00:00.000Z'),
    });
    expect(await conversations.deleteExpired(now)).toBe(1);
    expect(await conversations.findById('c-old')).toBeNull();
    expect(await conversations.findById('c-live')).not.toBeNull();

    const v = await vehicles.upsert({
      id: 'vp-1',
      customerId: 'cust-1',
      brand: 'CHEVROLET',
      model: 'Spark',
      source: 'whatsapp_flow',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    expect((await vehicles.findById(v.id))?.brand).toBe('CHEVROLET');
  });
});

describe('Production Sprint 2 — aislamiento por tenant', () => {
  it('leads de tenant A no son visibles en tenant B', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps2-tenant-'));
    const dbPath = path.join(dir, 'crm.sqlite');

    await runWithTenant('tenant-a', async () => {
      const repo = new SQLiteLeadRepository(dbPath);
      await repo.save(
        baseLead({
          id: 'lead-a',
          conversationId: 'ca',
          customerId: 'cust-a',
        }),
      );
    });

    await runWithTenant('tenant-b', async () => {
      const repo = new SQLiteLeadRepository(dbPath);
      expect(await repo.findById('lead-a')).toBeNull();
      expect(await repo.list()).toEqual([]);
      await repo.save(
        baseLead({
          id: 'lead-b',
          conversationId: 'cb',
          customerId: 'cust-b',
        }),
      );
    });

    await runWithTenant('tenant-a', async () => {
      const repo = new SQLiteLeadRepository(dbPath);
      expect((await repo.list()).map((l) => l.id)).toEqual(['lead-a']);
    });
  });
});
