import {
  sortInteractionsChronological,
  type Interaction,
} from '../../domain/entities/Interaction';
import type {
  InteractionListOpts,
  InteractionRepository,
} from '../../domain/ports/InteractionRepository';

/**
 * Timeline CRM append-only en memoria (CRM_SPEC §7).
 * No hay update in-place: solo `append`.
 */
export class InMemoryInteractionRepository implements InteractionRepository {
  private readonly byId = new Map<string, Interaction>();

  async append(interaction: Interaction): Promise<Interaction> {
    if (this.byId.has(interaction.id)) {
      throw new Error(
        `Interaction already exists (append-only): ${interaction.id}`,
      );
    }
    const copy = cloneInteraction(interaction);
    this.byId.set(copy.id, copy);
    return cloneInteraction(copy);
  }

  async listByCustomerId(
    customerId: string,
    opts?: InteractionListOpts,
  ): Promise<Interaction[]> {
    let items = [...this.byId.values()].filter(
      (i) => i.customerId === customerId,
    );

    if (opts?.types && opts.types.length > 0) {
      const allowed = new Set(opts.types);
      items = items.filter((i) => allowed.has(i.type));
    }

    if (opts?.before !== undefined) {
      const beforeMs = opts.before.getTime();
      items = items.filter((i) => i.at.getTime() < beforeMs);
    }

    const sorted = sortInteractionsChronological(items, 'asc').map(
      cloneInteraction,
    );

    if (opts?.limit !== undefined && opts.limit >= 0) {
      return sorted.slice(0, opts.limit);
    }

    return sorted;
  }
}

function cloneInteraction(interaction: Interaction): Interaction {
  return {
    ...interaction,
    payload: interaction.payload ? { ...interaction.payload } : undefined,
  };
}
