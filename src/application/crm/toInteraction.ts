import { randomUUID } from 'crypto';
import type { Interaction, InteractionType } from '../../domain/entities/Interaction';
import type { LeadEvent, LeadEventType } from '../../domain/entities/LeadEvent';
import type { Channel } from '../../shared/types';

/** Tipos de LeadEvent que se proyectan a Interaction (CRM_SPEC §7 / §9). */
const EVENT_TO_INTERACTION_TYPE: Partial<
  Record<LeadEventType, InteractionType>
> = {
  'lead.created': 'lead.created',
  'lead.status_changed': 'lead.status_changed',
  'lead.priority_changed': 'lead.priority_changed',
  'lead.assigned': 'lead.assigned',
  'lead.reassigned': 'lead.assigned',
  'lead.note_added': 'lead.note_added',
  'lead.recontact_scheduled': 'lead.recontact_scheduled',
};

export interface LeadEventProjectionContext {
  customerId: string;
  channel: Channel;
  conversationId?: string;
  /** Si se omite, se genera un UUID. */
  interactionId?: string;
}

/**
 * Proyecta un LeadEvent a Interaction cuando hay tipo de timeline equivalente.
 * Retorna `null` si el evento no se materializa en el timeline (p. ej. telegram_*).
 */
export function leadEventToInteraction(
  event: LeadEvent,
  ctx: LeadEventProjectionContext,
): Interaction | null {
  const type = EVENT_TO_INTERACTION_TYPE[event.type];
  if (!type) return null;

  return {
    id: ctx.interactionId ?? randomUUID(),
    customerId: ctx.customerId,
    at: event.at,
    type,
    channel: ctx.channel,
    conversationId: ctx.conversationId,
    leadId: event.leadId,
    summary: summarizeLeadEvent(event),
    payload: {
      leadEventId: event.id,
      leadEventType: event.type,
      ...(event.payload ?? {}),
    },
    actor: event.actor,
    actorId: event.actorId,
  };
}

function summarizeLeadEvent(event: LeadEvent): string {
  switch (event.type) {
    case 'lead.created':
      return 'Lead creado';
    case 'lead.status_changed': {
      const from = event.payload?.from;
      const to = event.payload?.to;
      if (typeof from === 'string' && typeof to === 'string') {
        return `Estado: ${from} → ${to}`;
      }
      return 'Estado de lead actualizado';
    }
    case 'lead.priority_changed': {
      const from = event.payload?.from;
      const to = event.payload?.to;
      if (typeof from === 'string' && typeof to === 'string') {
        return `Prioridad: ${from} → ${to}`;
      }
      return 'Prioridad de lead actualizada';
    }
    case 'lead.assigned':
      return 'Lead asignado';
    case 'lead.reassigned':
      return 'Lead reasignado';
    case 'lead.note_added':
      return 'Nota interna añadida';
    case 'lead.recontact_scheduled':
      return 'Recontacto programado';
    default:
      return event.type;
  }
}
