import type { Channel } from '../../shared/types';

export const INTERACTION_TYPES = [
  'conversation.started',
  'conversation.message_in',
  'conversation.message_out',
  'conversation.closed',
  'lead.created',
  'lead.status_changed',
  'lead.priority_changed',
  'lead.assigned',
  'lead.handoff',
  'lead.note_added',
  'lead.recontact_scheduled',
  'advisor.manual',
] as const;

export type InteractionType = (typeof INTERACTION_TYPES)[number];

export type InteractionActor = 'customer' | 'system' | 'advisor' | 'api';

/**
 * Entrada append-only del timeline CRM del cliente.
 * Orden canónico: `at ASC`, desempate `id ASC`.
 */
export interface Interaction {
  id: string;
  /** Ancla al perfil. */
  customerId: string;
  at: Date;
  type: InteractionType;
  channel: Channel;

  conversationId?: string;
  messageId?: string;
  leadId?: string;

  /** Texto corto para UI; sin inventar precio/stock. */
  summary: string;
  payload?: Record<string, unknown>;

  actor: InteractionActor;
  actorId?: string;
}

export function isInteractionType(value: string): value is InteractionType {
  return (INTERACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Orden cronológico estable: `at`, luego `id` (desempate).
 * `asc` = más antiguo primero (canónico CRM_SPEC); `desc` = panel API.
 */
export function sortInteractionsChronological(
  interactions: readonly Interaction[],
  order: 'asc' | 'desc' = 'asc',
): Interaction[] {
  const dir = order === 'asc' ? 1 : -1;
  return [...interactions].sort((a, b) => {
    const byAt = a.at.getTime() - b.at.getTime();
    if (byAt !== 0) return byAt * dir;
    return a.id < b.id ? -1 * dir : a.id > b.id ? 1 * dir : 0;
  });
}
