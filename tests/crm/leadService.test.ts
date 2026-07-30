import { describe, expect, it, vi } from 'vitest';
import {
  IllegalLeadTransitionError,
} from '../../src/application/crm/leadStateMachine';
import {
  LeadNotFoundError,
  LeadService,
} from '../../src/application/services/LeadService';
import type { NotificationService } from '../../src/application/services/NotificationService';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import type { Conversation } from '../../src/domain/entities/Conversation';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';

function stubNotifications(): NotificationService {
  return {
    notifyNewLead: vi.fn(async () => false),
  } as unknown as NotificationService;
}

function conversation(overrides?: {
  stage?: Conversation['context']['stage'];
  category?: Conversation['context']['category'];
  needsHumanHandoff?: boolean;
}): Conversation {
  const context = createEmptyContext();
  context.category = overrides?.category ?? 'baterias';
  context.stage = overrides?.stage ?? 'closing';
  context.needsHumanHandoff = overrides?.needsHumanHandoff ?? false;
  context.vehicle = { brand: 'CHEVROLET', model: 'Spark', year: '2018' };
  context.battery = { soundSystem: false };
  context.recommendedProductIds = ['willard:75D23L'];

  return {
    id: 'conv-wa-1',
    customerId: 'cust-wa',
    channel: 'whatsapp',
    externalId: 'wa-1',
    context,
    messages: [],
    createdAt: new Date('2026-07-29T10:00:00.000Z'),
    updatedAt: new Date('2026-07-29T10:00:00.000Z'),
    expiresAt: new Date('2026-07-30T10:00:00.000Z'),
  };
}

describe('LeadService — registerFromConversation (WA path)', () => {
  it('crea lead con prioridad CRM sin requerir InteractionRepository', async () => {
    const repo = new InMemoryLeadRepository();
    const service = new LeadService(repo, stubNotifications());

    const saved = await service.registerFromConversation({
      conversation: conversation({ stage: 'closing' }),
      phone: '573001111111',
      customerId: 'cust-wa',
      customerName: 'Ana',
      assistantReply: '🔋 75D23L',
    });

    expect(saved).not.toBeNull();
    expect(saved!.status).toBe('nuevo');
    expect(saved!.product).toBe('Batería');
    expect(saved!.priority).toBe('Media'); // R6
    expect(saved!.channel).toBe('whatsapp');
    expect(saved!.source).toBe('whatsapp_flow');
    expect(saved!.sla?.firstResponseDueAt).toBeInstanceOf(Date);
    expect(saved!.recommendation).toContain('75D23L');

    const events = await repo.listEvents(saved!.id);
    expect(events.some((e) => e.type === 'lead.created')).toBe(true);
  });

  it('handoff eleva needsHumanHandoff y prioridad Alta (R1)', async () => {
    const repo = new InMemoryLeadRepository();
    const service = new LeadService(repo, stubNotifications());

    const saved = await service.registerFromConversation({
      conversation: conversation({
        stage: 'handoff',
        needsHumanHandoff: true,
      }),
      phone: '573001111111',
      customerId: 'cust-wa',
      assistantReply: 'Te paso con un asesor',
    });

    expect(saved!.needsHumanHandoff).toBe(true);
    expect(saved!.source).toBe('whatsapp_handoff');
    expect(saved!.priority).toBe('Alta');
  });

  it('idempotente por conversationId (update)', async () => {
    const repo = new InMemoryLeadRepository();
    const service = new LeadService(repo, stubNotifications());
    const conv = conversation();

    const first = await service.registerFromConversation({
      conversation: conv,
      phone: '573001111111',
      customerId: 'cust-wa',
      assistantReply: 'a',
    });
    const second = await service.registerFromConversation({
      conversation: {
        ...conv,
        context: {
          ...conv.context,
          vehicle: { brand: 'CHEVROLET', model: 'Sail', year: '2019' },
        },
      },
      phone: '573001111111',
      customerId: 'cust-wa',
      customerName: 'Ana',
      assistantReply: 'b',
    });

    expect(second!.id).toBe(first!.id);
    expect(second!.vehicleModel).toBe('Sail');
    expect(second!.name).toBe('Ana');
    expect((await repo.list()).length).toBe(1);
  });

  it('retorna null si flujo no terminó', async () => {
    const service = new LeadService(
      new InMemoryLeadRepository(),
      stubNotifications(),
    );
    const result = await service.registerFromConversation({
      conversation: conversation({ stage: 'ask_brand' as never }),
      phone: '57300',
      customerId: 'c',
      assistantReply: 'x',
    });
    // stage not closing/handoff
    const early = conversation();
    early.context.stage = 'welcome';
    expect(
      await service.registerFromConversation({
        conversation: early,
        phone: '57300',
        customerId: 'c',
        assistantReply: 'x',
      }),
    ).toBeNull();
    expect(result).toBeNull();
  });
});

describe('LeadService — CRM ops', () => {
  function build() {
    const leads = new InMemoryLeadRepository();
    const interactions = new InMemoryInteractionRepository();
    const service = new LeadService(leads, stubNotifications(), interactions);
    return { leads, interactions, service };
  }

  it('createLead setea priority y proyecta interaction', async () => {
    const { service, leads, interactions } = build();
    const lead = await service.createLead({
      customerId: 'c1',
      conversationId: 'conv-1',
      phone: '573001111111',
      product: 'Batería',
      vehicleBrand: 'KIA',
      vehicleModel: 'Rio',
      year: '2020',
      needsHumanHandoff: true,
      now: new Date('2026-07-29T12:00:00.000Z'),
    });

    expect(lead.priority).toBe('Alta');
    expect(lead.status).toBe('nuevo');
    expect((await leads.listEvents(lead.id)).map((e) => e.type)).toContain(
      'lead.created',
    );
    const timeline = await interactions.listByCustomerId('c1');
    expect(timeline.some((i) => i.type === 'lead.created')).toBe(true);
  });

  it('createOrUpdateFromHandoff es idempotente por conversationId', async () => {
    const { service } = build();
    const a = await service.createOrUpdateFromHandoff({
      customerId: 'c1',
      conversationId: 'conv-h',
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'FORD',
      vehicleModel: 'Focus',
      recommendationSnapshot: {
        outcome: 'empty',
        query: { marca: 'FORD' },
        options: [],
        summary: '',
      },
    });
    const b = await service.createOrUpdateFromHandoff({
      customerId: 'c1',
      conversationId: 'conv-h',
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'FORD',
      vehicleModel: 'Focus',
      name: 'Luis',
      handoffReason: 'sin match',
    });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe('Luis');
    expect(b.needsHumanHandoff).toBe(true);
  });

  it('changeStatus valida transiciones y emite eventos + timeline', async () => {
    const { service, leads, interactions } = build();
    const lead = await service.createLead({
      customerId: 'c1',
      conversationId: 'conv-2',
      phone: '57300',
      product: 'Rodamiento',
      vehicleBrand: 'X',
      vehicleModel: 'Y',
    });

    await expect(
      service.changeStatus(lead.id, 'recontacto'),
    ).rejects.toBeInstanceOf(IllegalLeadTransitionError);

    const quoted = await service.changeStatus(lead.id, 'cotizado');
    expect(quoted.status).toBe('cotizado');

    const events = await leads.listEvents(lead.id);
    expect(events.some((e) => e.type === 'lead.status_changed')).toBe(true);

    const timeline = await interactions.listByCustomerId('c1');
    expect(
      timeline.some(
        (i) =>
          i.type === 'lead.status_changed' &&
          i.payload?.from === 'nuevo' &&
          i.payload?.to === 'cotizado',
      ),
    ).toBe(true);
  });

  it('assign desde nuevo → asignado; claim → en_gestion + first_touch', async () => {
    const { service, leads } = build();
    const lead = await service.createLead({
      customerId: 'c1',
      conversationId: 'conv-3',
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'X',
      vehicleModel: 'Y',
      needsHumanHandoff: true,
    });

    const assigned = await service.assign(lead.id, {
      assigneeId: 'adv-1',
      assigneeName: 'Ana',
    });
    expect(assigned.status).toBe('asignado');
    expect(assigned.assignment?.assigneeId).toBe('adv-1');

    const claimed = await service.claim(assigned.id, {
      assigneeId: 'adv-1',
      assigneeName: 'Ana',
    });
    expect(claimed.status).toBe('en_gestion');
    expect(claimed.sla?.firstResponseAt).toBeInstanceOf(Date);

    const types = (await leads.listEvents(lead.id)).map((e) => e.type);
    expect(types).toContain('lead.assigned');
    expect(types).toContain('lead.first_touch');
  });

  it('scheduleRecontact / completeRecontact recalculan priority', async () => {
    const { service } = build();
    const now = new Date('2026-07-29T12:00:00.000Z');
    const lead = await service.createLead({
      customerId: 'c1',
      conversationId: 'conv-4',
      phone: '57300',
      product: 'Rodamiento',
      vehicleBrand: 'X',
      vehicleModel: 'Y',
      now,
    });
    await service.changeStatus(lead.id, 'en_gestion', { now });

    const scheduled = await service.scheduleRecontact(lead.id, {
      dueAt: new Date('2026-07-29T10:00:00.000Z'),
      note: 'llamar mañana',
      now,
    });
    expect(scheduled.status).toBe('recontacto');
    expect(scheduled.priority).toBe('Alta'); // R3 overdue
    expect(scheduled.recontact?.attempts).toBe(1);

    const done = await service.completeRecontact(lead.id, { now });
    expect(done.status).toBe('en_gestion');
  });

  it('addNote append-only en notes + evento + interaction', async () => {
    const { service, interactions } = build();
    const lead = await service.createLead({
      customerId: 'c1',
      conversationId: 'conv-5',
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'X',
      vehicleModel: 'Y',
    });

    await service.addNote(lead.id, 'Primera');
    const withSecond = await service.addNote(lead.id, 'Segunda');
    expect(withSecond.notes).toBe('Primera\nSegunda');

    const notes = (await interactions.listByCustomerId('c1')).filter(
      (i) => i.type === 'lead.note_added',
    );
    expect(notes).toHaveLength(2);
  });

  it('R4: segundo lead abierto eleva priority a Alta', async () => {
    const { service } = build();
    const a = await service.createLead({
      customerId: 'c-multi',
      conversationId: 'conv-a',
      phone: '57300',
      product: 'Rodamiento',
      vehicleBrand: 'X',
      vehicleModel: 'Y',
    });
    expect(a.priority).toBe('Baja');

    await service.createLead({
      customerId: 'c-multi',
      conversationId: 'conv-b',
      phone: '57300',
      product: 'Rodamiento',
      vehicleBrand: 'Z',
      vehicleModel: 'W',
    });

    // Recompute on update of first
    const refreshed = await service.updateLead(a.id, {
      name: 'Cliente',
    });
    expect(refreshed.priority).toBe('Alta');
  });

  it('LeadNotFoundError en ops CRM', async () => {
    const { service } = build();
    await expect(service.changeStatus('missing', 'cotizado')).rejects.toBeInstanceOf(
      LeadNotFoundError,
    );
  });

  it('updateStatus legacy sigue sin lanzar por máquina de estados', async () => {
    const { service } = build();
    const lead = await service.createLead({
      customerId: 'c1',
      conversationId: 'conv-legacy',
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'X',
      vehicleModel: 'Y',
    });
    const updated = await service.updateStatus(lead.id, 'cotizado');
    expect(updated?.status).toBe('cotizado');
  });

  it('timeline cronológico tras varias mutaciones', async () => {
    const { service, interactions } = build();
    const t0 = new Date('2026-07-29T10:00:00.000Z');
    const t1 = new Date('2026-07-29T11:00:00.000Z');
    const t2 = new Date('2026-07-29T12:00:00.000Z');

    const lead = await service.createLead({
      customerId: 'c-time',
      conversationId: 'conv-t',
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'X',
      vehicleModel: 'Y',
      now: t0,
    });
    await service.assign(
      lead.id,
      { assigneeId: 'a1' },
      { now: t1 },
    );
    await service.addNote(lead.id, 'ok', { now: t2 });

    const timeline = await interactions.listByCustomerId('c-time');
    const times = timeline.map((i) => i.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // assign a t1: assigned → status_changed → priority_changed (timestamps secuenciales)
    expect(timeline.map((i) => i.type)).toEqual([
      'lead.created',
      'lead.assigned',
      'lead.status_changed',
      'lead.priority_changed',
      'lead.note_added',
    ]);
  });
});
