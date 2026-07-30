import { describe, expect, it } from 'vitest';
import { leadEventToInteraction } from '../../src/application/crm/toInteraction';
import { InteractionService } from '../../src/application/services/InteractionService';
import type { LeadEvent } from '../../src/domain/entities/LeadEvent';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';

describe('InteractionService + toInteraction', () => {
  it('append y listTimeline cronológico ASC', async () => {
    const repo = new InMemoryInteractionRepository();
    const service = new InteractionService(repo);

    await service.append({
      id: 'i2',
      customerId: 'c1',
      at: new Date('2026-07-29T11:00:00.000Z'),
      type: 'lead.status_changed',
      channel: 'whatsapp',
      summary: 'segundo',
      actor: 'system',
    });
    await service.append({
      id: 'i1',
      customerId: 'c1',
      at: new Date('2026-07-29T10:00:00.000Z'),
      type: 'lead.created',
      channel: 'whatsapp',
      summary: 'primero',
      actor: 'system',
    });

    const asc = await service.listTimeline('c1');
    expect(asc.map((i) => i.id)).toEqual(['i1', 'i2']);

    const desc = await service.listTimeline('c1', { order: 'desc' });
    expect(desc.map((i) => i.id)).toEqual(['i2', 'i1']);
  });

  it('recordLeadEventProjection materializa tipos mapeados', async () => {
    const repo = new InMemoryInteractionRepository();
    const service = new InteractionService(repo);

    const event: LeadEvent = {
      id: 'ev-1',
      leadId: 'lead-1',
      type: 'lead.status_changed',
      at: new Date('2026-07-29T12:00:00.000Z'),
      actor: 'api',
      payload: { from: 'nuevo', to: 'asignado' },
    };

    const interaction = await service.recordLeadEventProjection(event, {
      customerId: 'c1',
      channel: 'whatsapp',
      conversationId: 'conv-1',
      interactionId: 'ix-1',
    });

    expect(interaction).toMatchObject({
      id: 'ix-1',
      type: 'lead.status_changed',
      leadId: 'lead-1',
      summary: 'Estado: nuevo → asignado',
    });
  });

  it('leadEventToInteraction omite tipos sin timeline', () => {
    const event: LeadEvent = {
      id: 'ev-2',
      leadId: 'lead-1',
      type: 'lead.telegram_notified',
      at: new Date(),
      actor: 'system',
    };
    expect(
      leadEventToInteraction(event, {
        customerId: 'c1',
        channel: 'whatsapp',
      }),
    ).toBeNull();
  });

  it('proyecta reassigned como lead.assigned', () => {
    const event: LeadEvent = {
      id: 'ev-3',
      leadId: 'lead-1',
      type: 'lead.reassigned',
      at: new Date('2026-07-29T12:00:00.000Z'),
      actor: 'advisor',
    };
    const ix = leadEventToInteraction(event, {
      customerId: 'c1',
      channel: 'whatsapp',
      interactionId: 'ix-r',
    });
    expect(ix?.type).toBe('lead.assigned');
    expect(ix?.summary).toBe('Lead reasignado');
  });
});
