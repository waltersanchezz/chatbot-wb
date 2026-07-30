import { describe, expect, it } from 'vitest';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import type { Lead } from '../../src/domain/entities/Lead';
import type { VehicleProfile } from '../../src/domain/entities/VehicleProfile';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';

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

describe('CustomerProfileService', () => {
  async function setup() {
    const customers = new InMemoryCustomerRepository();
    const leads = new InMemoryLeadRepository();
    const vehicles = new InMemoryVehicleProfileRepository();
    const interactions = new InMemoryInteractionRepository();
    const service = new CustomerProfileService(
      customers,
      leads,
      vehicles,
      interactions,
    );

    const customer = await customers.findOrCreate(
      '573001111111',
      'whatsapp',
      'Ana',
    );

    await leads.save(
      baseLead({
        id: 'lead-open',
        conversationId: 'conv-1',
        customerId: customer.id,
        status: 'nuevo',
        priority: 'Alta',
        needsHumanHandoff: true,
      }),
    );
    await leads.save(
      baseLead({
        id: 'lead-sold',
        conversationId: 'conv-2',
        customerId: customer.id,
        status: 'vendido',
        priority: 'Baja',
        product: 'Rodamiento',
        createdAt: new Date('2026-07-28T10:00:00.000Z'),
      }),
    );

    const v1: VehicleProfile = {
      id: 'veh-1',
      customerId: customer.id,
      brand: 'CHEVROLET',
      model: 'Spark',
      year: '2018',
      source: 'whatsapp_flow',
      firstSeenAt: new Date('2026-07-28T09:00:00.000Z'),
      lastSeenAt: new Date('2026-07-29T10:00:00.000Z'),
      createdAt: new Date('2026-07-28T09:00:00.000Z'),
      updatedAt: new Date('2026-07-29T10:00:00.000Z'),
    };
    const v2: VehicleProfile = {
      id: 'veh-2',
      customerId: customer.id,
      brand: 'MAZDA',
      model: '3',
      year: '2020',
      source: 'advisor',
      firstSeenAt: new Date('2026-07-29T11:00:00.000Z'),
      lastSeenAt: new Date('2026-07-29T11:00:00.000Z'),
      createdAt: new Date('2026-07-29T11:00:00.000Z'),
      updatedAt: new Date('2026-07-29T11:00:00.000Z'),
    };
    await vehicles.upsert(v1);
    await vehicles.upsert(v2);

    await interactions.append({
      id: 'ix-1',
      customerId: customer.id,
      at: new Date('2026-07-29T09:00:00.000Z'),
      type: 'lead.created',
      channel: 'whatsapp',
      summary: 'Lead creado',
      actor: 'system',
      leadId: 'lead-open',
    });
    await interactions.append({
      id: 'ix-2',
      customerId: customer.id,
      at: new Date('2026-07-29T12:00:00.000Z'),
      type: 'lead.status_changed',
      channel: 'whatsapp',
      summary: 'Estado',
      actor: 'api',
      leadId: 'lead-sold',
    });

    return { service, customer, customers };
  }

  it('getByCustomerId agrega 1 customer N leads N vehicles + openLeadCount', async () => {
    const { service, customer } = await setup();
    const profile = await service.getByCustomerId(customer.id);

    expect(profile).not.toBeNull();
    expect(profile!.customerId).toBe(customer.id);
    expect(profile!.phone).toBe('573001111111');
    expect(profile!.name).toBe('Ana');
    expect(profile!.openLeadCount).toBe(1);
    expect(profile!.leads).toHaveLength(2);
    expect(profile!.vehicles).toHaveLength(2);
    expect(profile!.interactions).toHaveLength(2);
    expect(profile!.lastInteractionAt?.toISOString()).toBe(
      '2026-07-29T12:00:00.000Z',
    );
    expect(profile!.leads.find((l) => l.id === 'lead-open')).toMatchObject({
      status: 'nuevo',
      priority: 'Alta',
      needsHumanHandoff: true,
    });
  });

  it('getByPhone resuelve identidad canónica', async () => {
    const { service } = await setup();
    const profile = await service.getByPhone('573001111111');
    expect(profile?.name).toBe('Ana');
    expect(profile?.vehicles.map((v) => v.brand).sort()).toEqual([
      'CHEVROLET',
      'MAZDA',
    ]);
  });

  it('getDetail pagina timeline con hasMore', async () => {
    const { service, customer } = await setup();
    const detail = await service.getDetail({
      customerId: customer.id,
      interactionLimit: 1,
    });

    expect(detail).not.toBeNull();
    expect(detail!.leads).toHaveLength(2);
    expect(detail!.leads[0]).toHaveProperty('recommendation');
    expect(detail!.interactions).toHaveLength(1);
    expect(detail!.interactionsHasMore).toBe(true);
  });

  it('retorna null si customer no existe', async () => {
    const { service } = await setup();
    expect(await service.getByCustomerId('missing')).toBeNull();
    expect(await service.getByPhone('000')).toBeNull();
  });
});
