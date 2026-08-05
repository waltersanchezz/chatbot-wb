import type { DatabaseSync } from 'node:sqlite';
import {
  sortInteractionsChronological,
  type Interaction,
} from '../../domain/entities/Interaction';
import type {
  InteractionListOpts,
  InteractionRepository,
} from '../../domain/ports/InteractionRepository';
import {
  deserializeInteraction,
  serializeInteraction,
} from './crmSerialize';
import { openCrmSqliteDb } from './crmSqlite';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * InteractionRepository durable append-only (Production Sprint 2).
 */
export class SQLiteInteractionRepository implements InteractionRepository {
  private readonly db: DatabaseSync;
  private readonly fixedTenantId?: string;

  constructor(
    databasePath: string = ':memory:',
    options: TenantScopedOptions = {},
  ) {
    this.fixedTenantId = options.tenantId;
    this.db = openCrmSqliteDb(databasePath);
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  async append(interaction: Interaction): Promise<Interaction> {
    const existing = this.db
      .prepare(
        `SELECT id FROM crm_interactions WHERE tenant_id = ? AND id = ?`,
      )
      .get(this.tenant(), interaction.id) as { id: string } | undefined;
    if (existing) {
      throw new Error(
        `Interaction already exists (append-only): ${interaction.id}`,
      );
    }

    const copy = deserializeInteraction(serializeInteraction(interaction));
    this.db
      .prepare(
        `
        INSERT INTO crm_interactions (
          tenant_id, id, customer_id, at_ms, type, document_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        this.tenant(),
        copy.id,
        copy.customerId,
        copy.at.getTime(),
        copy.type,
        serializeInteraction(copy),
      );
    return deserializeInteraction(serializeInteraction(copy));
  }

  async listByCustomerId(
    customerId: string,
    opts?: InteractionListOpts,
  ): Promise<Interaction[]> {
    const rows = this.db
      .prepare(
        `SELECT document_json FROM crm_interactions
         WHERE tenant_id = ? AND customer_id = ?`,
      )
      .all(this.tenant(), customerId) as Array<{ document_json: string }>;

    let items = rows.map((r) => deserializeInteraction(r.document_json));

    if (opts?.types && opts.types.length > 0) {
      const allowed = new Set(opts.types);
      items = items.filter((i) => allowed.has(i.type));
    }

    if (opts?.before !== undefined) {
      const beforeMs = opts.before.getTime();
      items = items.filter((i) => i.at.getTime() < beforeMs);
    }

    const sorted = sortInteractionsChronological(items, 'asc').map((i) =>
      deserializeInteraction(serializeInteraction(i)),
    );

    if (opts?.limit !== undefined && opts.limit >= 0) {
      return sorted.slice(0, opts.limit);
    }

    return sorted;
  }
}
