import { describe, expect, it } from 'vitest';
import type { Customer } from '../../src/domain/entities/Customer';
import type { Interaction } from '../../src/domain/entities/Interaction';
import type { Lead } from '../../src/domain/entities/Lead';
import type { LeadEvent } from '../../src/domain/entities/LeadEvent';
import type { VehicleProfile } from '../../src/domain/entities/VehicleProfile';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';

function baseLead(overrides: Partial<Lead> & Pick<Lead, 'id' | 'conversationId' | 'customerId'>): Lead {
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

describe('CRM persistence — InMemoryCustomerRepository', () => {
  it('findOrCreate crea y reutiliza por teléfono', async () => {
    const repo = new InMemoryCustomerRepository();
    const a = await repo.findOrCreate('573001234567', 'whatsapp', 'Ana');
    const b = await repo.findOrCreate('573001234567', 'whatsapp');
    expect(a.id).toBe(b.id);
    expect(b.name).toBe('Ana');
    expect(await repo.findByPhone('573001234567')).toMatchObject({
      id: a.id,
      phone: '573001234567',
    });
  });

  it('findOrCreate completa name vacío en cliente existente', async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await repo.findOrCreate('573009999999', 'whatsapp');
    expect(created.name).toBeUndefined();
    const updated = await repo.findOrCreate('573009999999', 'whatsapp', 'Luis');
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Luis');
  });

  it('save upsert actualiza identidad y updatedAt', async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await repo.findOrCreate('573008888888', 'whatsapp', 'X');
    const saved = await repo.save({
      ...created,
      name: 'Y',
      updatedAt: created.updatedAt,
    });
    expect(saved.name).toBe('Y');
    expect(saved.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    );
    expect((await repo.findById(created.id))?.name).toBe('Y');
  });

  it('aísla mutaciones externas del almacenamiento', async () => {
    const repo = new InMemoryCustomerRepository();
    const created = await repo.findOrCreate('573007777777', 'whatsapp', 'Z');
    created.name = 'Hacked';
    expect((await repo.findById(created.id))?.name).toBe('Z');
  });
});

describe('CRM persistence — InMemoryLeadRepository', () => {
  it('save upsert y findById conservan campos CRM extendidos', async () => {
    const repo = new InMemoryLeadRepository();
    const lead = baseLead({
      id: 'lead-1',
      conversationId: 'conv-1',
      customerId: 'cust-1',
      needsHumanHandoff: true,
      handoffReason: 'precio',
      priority: 'Alta',
      recommendationSnapshot: {
        outcome: 'matched',
        query: { marca: 'CHEVROLET', modelo: 'Spark' },
        options: [{ reference: '75D23L', productLine: 'willard' }],
        summary: '75D23L',
      },
      assignment: { assigneeId: 'adv-1', assigneeName: 'Ana' },
      sla: { breached: false },
      recontact: { attempts: 0 },
    });

    const saved = await repo.save(lead);
    expect(saved.priority).toBe('Alta');
    expect(saved.recommendationSnapshot?.options[0]?.reference).toBe('75D23L');

    const again = await repo.save({
      ...saved,
      notes: 'seguimiento',
      priority: 'Media',
    });
    expect(again.id).toBe('lead-1');
    expect(again.notes).toBe('seguimiento');
    expect(again.priority).toBe('Media');
    expect((await repo.findById('lead-1'))?.notes).toBe('seguimiento');
  });

  it('findByConversationId es clave de idempotencia (1 conversación → 1 lead)', async () => {
    const repo = new InMemoryLeadRepository();
    await repo.save(
      baseLead({
        id: 'lead-a',
        conversationId: 'conv-same',
        customerId: 'cust-1',
      }),
    );
    await repo.save(
      baseLead({
        id: 'lead-b',
        conversationId: 'conv-other',
        customerId: 'cust-1',
        createdAt: new Date('2026-07-29T11:00:00.000Z'),
      }),
    );

    const found = await repo.findByConversationId('conv-same');
    expect(found?.id).toBe('lead-a');
    expect(await repo.findByConversationId('missing')).toBeNull();
  });

  it('list filtra por status, priority y customerId', async () => {
    const repo = new InMemoryLeadRepository();
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
    expect((await repo.list({ priority: 'Alta' })).map((l) => l.id)).toEqual([
      'l3',
      'l1',
    ]);
    expect(
      (await repo.list({ status: ['nuevo', 'cotizado'], customerId: 'cust-A' })).map(
        (l) => l.id,
      ),
    ).toEqual(['l2', 'l1']);
    expect((await repo.list({ q: 'ford' })).map((l) => l.id)).toEqual(['l3']);
  });

  it('findByCustomerId y findOpenByCustomerId respetan terminales', async () => {
    const repo = new InMemoryLeadRepository();
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
    await repo.save(
      baseLead({
        id: 'other',
        conversationId: 'c3',
        customerId: 'cust-Y',
        status: 'nuevo',
      }),
    );

    expect((await repo.findByCustomerId('cust-X')).map((l) => l.id)).toEqual([
      'closed-1',
      'open-1',
    ]);
    expect((await repo.findOpenByCustomerId('cust-X')).map((l) => l.id)).toEqual([
      'open-1',
    ]);
  });

  it('updateStatus actualiza status y updatedAt', async () => {
    const repo = new InMemoryLeadRepository();
    await repo.save(
      baseLead({
        id: 'lead-st',
        conversationId: 'c-st',
        customerId: 'cust-1',
        status: 'nuevo',
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      }),
    );
    const updated = await repo.updateStatus('lead-st', 'cotizado');
    expect(updated?.status).toBe('cotizado');
    expect(updated?.updatedAt?.getTime()).toBeGreaterThan(
      new Date('2026-07-01T00:00:00.000Z').getTime(),
    );
    expect(await repo.updateStatus('missing', 'vendido')).toBeNull();
  });

  it('appendEvent + listEvents son append-only y cronológicos', async () => {
    const repo = new InMemoryLeadRepository();
    await repo.save(
      baseLead({
        id: 'lead-ev',
        conversationId: 'c-ev',
        customerId: 'cust-1',
      }),
    );

    const e2: LeadEvent = {
      id: 'ev-2',
      leadId: 'lead-ev',
      type: 'lead.status_changed',
      at: new Date('2026-07-29T12:00:00.000Z'),
      actor: 'advisor',
      payload: { to: 'cotizado' },
    };
    const e1: LeadEvent = {
      id: 'ev-1',
      leadId: 'lead-ev',
      type: 'lead.created',
      at: new Date('2026-07-29T10:00:00.000Z'),
      actor: 'system',
    };
    await repo.appendEvent(e2);
    await repo.appendEvent(e1);

    const events = await repo.listEvents('lead-ev');
    expect(events.map((e) => e.id)).toEqual(['ev-1', 'ev-2']);
    expect(await repo.listEvents('other')).toEqual([]);

    events[0]!.payload = { hacked: true };
    expect((await repo.listEvents('lead-ev'))[0]?.payload).toBeUndefined();
  });

  it('aísla leads entre customers', async () => {
    const repo = new InMemoryLeadRepository();
    await repo.save(
      baseLead({
        id: 'la',
        conversationId: 'ca',
        customerId: 'cust-A',
      }),
    );
    await repo.save(
      baseLead({
        id: 'lb',
        conversationId: 'cb',
        customerId: 'cust-B',
      }),
    );
    expect((await repo.findByCustomerId('cust-A')).map((l) => l.id)).toEqual([
      'la',
    ]);
    expect((await repo.findByCustomerId('cust-B')).map((l) => l.id)).toEqual([
      'lb',
    ]);
  });
});

describe('CRM persistence — InMemoryVehicleProfileRepository', () => {
  it('upsert y findById', async () => {
    const repo = new InMemoryVehicleProfileRepository();
    const now = new Date('2026-07-29T10:00:00.000Z');
    const vehicle: VehicleProfile = {
      id: 'vp-1',
      customerId: 'cust-1',
      brand: 'CHEVROLET',
      model: 'Spark',
      year: '2018',
      source: 'whatsapp_flow',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await repo.upsert(vehicle);
    expect(saved.id).toBe('vp-1');
    expect((await repo.findById('vp-1'))?.model).toBe('Spark');

    const later = new Date('2026-07-29T15:00:00.000Z');
    await repo.upsert({
      ...saved,
      notes: 'ABS',
      lastSeenAt: later,
      updatedAt: later,
    });
    expect((await repo.findById('vp-1'))?.notes).toBe('ABS');
    expect((await repo.findById('vp-1'))?.lastSeenAt).toEqual(later);
  });

  it('listByCustomerId aísla por cliente y ordena por lastSeenAt desc', async () => {
    const repo = new InMemoryVehicleProfileRepository();
    const t1 = new Date('2026-07-29T10:00:00.000Z');
    const t2 = new Date('2026-07-29T12:00:00.000Z');

    await repo.upsert({
      id: 'vp-old',
      customerId: 'cust-1',
      brand: 'KIA',
      model: 'Rio',
      source: 'whatsapp_flow',
      firstSeenAt: t1,
      lastSeenAt: t1,
      createdAt: t1,
      updatedAt: t1,
    });
    await repo.upsert({
      id: 'vp-new',
      customerId: 'cust-1',
      brand: 'FORD',
      model: 'Ranger',
      source: 'advisor',
      firstSeenAt: t2,
      lastSeenAt: t2,
      createdAt: t2,
      updatedAt: t2,
    });
    await repo.upsert({
      id: 'vp-other',
      customerId: 'cust-2',
      brand: 'MAZDA',
      model: '3',
      source: 'import',
      firstSeenAt: t2,
      lastSeenAt: t2,
      createdAt: t2,
      updatedAt: t2,
    });

    expect((await repo.listByCustomerId('cust-1')).map((v) => v.id)).toEqual([
      'vp-new',
      'vp-old',
    ]);
    expect((await repo.listByCustomerId('cust-2')).map((v) => v.id)).toEqual([
      'vp-other',
    ]);
  });
});

describe('CRM persistence — InMemoryInteractionRepository', () => {
  it('append-only rechaza overwrite y lista cronológicamente por customer', async () => {
    const repo = new InMemoryInteractionRepository();
    const base = {
      customerId: 'cust-1',
      channel: 'whatsapp' as const,
      summary: 'x',
      actor: 'system' as const,
    };

    const i1: Interaction = {
      ...base,
      id: 'i1',
      at: new Date('2026-07-29T10:00:00.000Z'),
      type: 'conversation.started',
    };
    const i2: Interaction = {
      ...base,
      id: 'i2',
      at: new Date('2026-07-29T11:00:00.000Z'),
      type: 'lead.created',
      leadId: 'lead-1',
    };
    const other: Interaction = {
      ...base,
      id: 'i3',
      customerId: 'cust-2',
      at: new Date('2026-07-29T09:00:00.000Z'),
      type: 'advisor.manual',
      summary: 'otro',
    };

    await repo.append(i2);
    await repo.append(i1);
    await repo.append(other);

    await expect(repo.append(i1)).rejects.toThrow(/append-only/);

    expect((await repo.listByCustomerId('cust-1')).map((i) => i.id)).toEqual([
      'i1',
      'i2',
    ]);
    expect((await repo.listByCustomerId('cust-2')).map((i) => i.id)).toEqual([
      'i3',
    ]);
  });

  it('listByCustomerId aplica before, types y limit', async () => {
    const repo = new InMemoryInteractionRepository();
    const customerId = 'cust-filter';
    const mk = (
      id: string,
      at: string,
      type: Interaction['type'],
    ): Interaction => ({
      id,
      customerId,
      at: new Date(at),
      type,
      channel: 'whatsapp',
      summary: id,
      actor: 'system',
    });

    await repo.append(mk('a', '2026-07-29T10:00:00.000Z', 'conversation.message_in'));
    await repo.append(mk('b', '2026-07-29T11:00:00.000Z', 'lead.created'));
    await repo.append(mk('c', '2026-07-29T12:00:00.000Z', 'conversation.message_out'));

    expect(
      (
        await repo.listByCustomerId(customerId, {
          before: new Date('2026-07-29T12:00:00.000Z'),
        })
      ).map((i) => i.id),
    ).toEqual(['a', 'b']);

    expect(
      (
        await repo.listByCustomerId(customerId, {
          types: ['lead.created'],
        })
      ).map((i) => i.id),
    ).toEqual(['b']);

    expect(
      (await repo.listByCustomerId(customerId, { limit: 2 })).map((i) => i.id),
    ).toEqual(['a', 'b']);
  });

  it('aísla mutaciones del payload almacenado', async () => {
    const repo = new InMemoryInteractionRepository();
    const saved = await repo.append({
      id: 'iso-1',
      customerId: 'cust-1',
      at: new Date('2026-07-29T10:00:00.000Z'),
      type: 'advisor.manual',
      channel: 'whatsapp',
      summary: 'nota',
      actor: 'advisor',
      payload: { note: 'ok' },
    });
    saved.payload!.note = 'hacked';
    const listed = await repo.listByCustomerId('cust-1');
    expect(listed[0]?.payload?.note).toBe('ok');
  });
});

describe('CRM persistence — aislamiento cruzado de repos', () => {
  it('customer + leads + vehicles + interactions no se mezclan entre clientes', async () => {
    const customers = new InMemoryCustomerRepository();
    const leads = new InMemoryLeadRepository();
    const vehicles = new InMemoryVehicleProfileRepository();
    const interactions = new InMemoryInteractionRepository();

    const ana: Customer = await customers.findOrCreate(
      '573001111111',
      'whatsapp',
      'Ana',
    );
    const luis: Customer = await customers.findOrCreate(
      '573002222222',
      'whatsapp',
      'Luis',
    );

    await leads.save(
      baseLead({
        id: 'lead-ana',
        conversationId: 'conv-ana',
        customerId: ana.id,
        phone: ana.phone,
        name: 'Ana',
      }),
    );
    await leads.save(
      baseLead({
        id: 'lead-luis',
        conversationId: 'conv-luis',
        customerId: luis.id,
        phone: luis.phone,
        name: 'Luis',
      }),
    );

    const now = new Date('2026-07-29T10:00:00.000Z');
    await vehicles.upsert({
      id: 'vp-ana',
      customerId: ana.id,
      brand: 'CHEVROLET',
      model: 'Spark',
      source: 'whatsapp_flow',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await vehicles.upsert({
      id: 'vp-luis',
      customerId: luis.id,
      brand: 'FORD',
      model: 'Ranger',
      source: 'whatsapp_flow',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await interactions.append({
      id: 'int-ana',
      customerId: ana.id,
      at: now,
      type: 'lead.created',
      channel: 'whatsapp',
      summary: 'lead Ana',
      actor: 'system',
      leadId: 'lead-ana',
    });
    await interactions.append({
      id: 'int-luis',
      customerId: luis.id,
      at: now,
      type: 'lead.created',
      channel: 'whatsapp',
      summary: 'lead Luis',
      actor: 'system',
      leadId: 'lead-luis',
    });

    expect((await leads.findByCustomerId(ana.id)).map((l) => l.id)).toEqual([
      'lead-ana',
    ]);
    expect((await vehicles.listByCustomerId(ana.id)).map((v) => v.id)).toEqual([
      'vp-ana',
    ]);
    expect((await interactions.listByCustomerId(ana.id)).map((i) => i.id)).toEqual([
      'int-ana',
    ]);
    expect((await leads.findByCustomerId(luis.id))[0]?.phone).toBe(luis.phone);
  });
});
