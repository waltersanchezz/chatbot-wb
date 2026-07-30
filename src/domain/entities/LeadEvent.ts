/**
 * Evento append-only del ciclo de vida de un lead (auditoría / panel).
 * Puede proyectarse a `Interaction`; no sustituye el estado actual del lead.
 */
export const LEAD_EVENT_TYPES = [
  'lead.created',
  'lead.updated',
  'lead.status_changed',
  'lead.priority_changed',
  'lead.assigned',
  'lead.reassigned',
  'lead.first_touch',
  'lead.recontact_scheduled',
  'lead.recontact_done',
  'lead.note_added',
  'lead.telegram_notified',
  'lead.telegram_failed',
  'lead.sla_breached',
] as const;

export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export type LeadEventActor = 'system' | 'advisor' | 'api';

export interface LeadEvent {
  id: string;
  leadId: string;
  type: LeadEventType;
  at: Date;
  actor: LeadEventActor;
  actorId?: string;
  /** Diffs acotados; sin PII extra innecesaria. */
  payload?: Record<string, unknown>;
}

export function isLeadEventType(value: string): value is LeadEventType {
  return (LEAD_EVENT_TYPES as readonly string[]).includes(value);
}
