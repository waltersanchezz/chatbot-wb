import { randomUUID } from 'crypto';
import {
  sortInteractionsChronological,
  type Interaction,
  type InteractionType,
} from '../../domain/entities/Interaction';
import type { LeadEvent } from '../../domain/entities/LeadEvent';
import type {
  InteractionListOpts,
  InteractionRepository,
} from '../../domain/ports/InteractionRepository';
import type { Channel } from '../../shared/types';
import {
  leadEventToInteraction,
  type LeadEventProjectionContext,
} from '../crm/toInteraction';

export type AppendInteractionInput = Omit<Interaction, 'id'> & { id?: string };

/**
 * Timeline CRM append-only (CRM_SPEC §7).
 */
export class InteractionService {
  constructor(private readonly repository: InteractionRepository) {}

  async append(input: AppendInteractionInput): Promise<Interaction> {
    const interaction: Interaction = {
      ...input,
      id: input.id ?? randomUUID(),
    };
    return this.repository.append(interaction);
  }

  /**
   * Timeline unificada del cliente.
   * Default: orden canónico ASC (`at`, luego `id`).
   */
  async listTimeline(
    customerId: string,
    opts?: InteractionListOpts & { order?: 'asc' | 'desc' },
  ): Promise<Interaction[]> {
    const { order = 'asc', ...listOpts } = opts ?? {};
    const items = await this.repository.listByCustomerId(customerId, listOpts);
    return sortInteractionsChronological(items, order);
  }

  /**
   * Proyecta un LeadEvent al timeline si corresponde; no-op si el tipo no mapea.
   */
  async recordLeadEventProjection(
    event: LeadEvent,
    ctx: LeadEventProjectionContext,
  ): Promise<Interaction | null> {
    const projected = leadEventToInteraction(event, ctx);
    if (!projected) return null;
    return this.repository.append(projected);
  }

  async appendTyped(params: {
    customerId: string;
    type: InteractionType;
    channel: Channel;
    summary: string;
    at?: Date;
    conversationId?: string;
    leadId?: string;
    messageId?: string;
    payload?: Record<string, unknown>;
    actor: Interaction['actor'];
    actorId?: string;
  }): Promise<Interaction> {
    return this.append({
      customerId: params.customerId,
      at: params.at ?? new Date(),
      type: params.type,
      channel: params.channel,
      conversationId: params.conversationId,
      messageId: params.messageId,
      leadId: params.leadId,
      summary: params.summary,
      payload: params.payload,
      actor: params.actor,
      actorId: params.actorId,
    });
  }
}
