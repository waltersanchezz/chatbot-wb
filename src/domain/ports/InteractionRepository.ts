import type { Interaction, InteractionType } from '../entities/Interaction';

export interface InteractionListOpts {
  limit?: number;
  /** Solo interacciones con `at` estrictamente anterior a este instante. */
  before?: Date;
  types?: InteractionType[];
}

/**
 * Puerto de timeline CRM append-only (CRM_SPEC §7.3).
 */
export interface InteractionRepository {
  append(interaction: Interaction): Promise<Interaction>;
  listByCustomerId(
    customerId: string,
    opts?: InteractionListOpts,
  ): Promise<Interaction[]>;
}
