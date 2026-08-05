import type { DatabaseSync } from 'node:sqlite';
import type { Conversation } from '../../domain/entities/Conversation';
import type { ConversationRepository } from '../../domain/ports/ConversationRepository';
import {
  deserializeConversation,
  serializeConversation,
} from './crmSerialize';
import { openCrmSqliteDb } from './crmSqlite';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * ConversationRepository del canal chatbot (domain/ports) — durable.
 * Nombre distinto de SQLiteConversationRepository (dashboard list DTO).
 */
export class SQLiteChatConversationRepository implements ConversationRepository {
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

  async findByExternalId(externalId: string): Promise<Conversation | null> {
    const row = this.db
      .prepare(
        `SELECT document_json FROM crm_conversations
         WHERE tenant_id = ? AND external_id = ?`,
      )
      .get(this.tenant(), externalId) as { document_json: string } | undefined;
    return row ? deserializeConversation(row.document_json) : null;
  }

  async findById(id: string): Promise<Conversation | null> {
    const row = this.db
      .prepare(
        `SELECT document_json FROM crm_conversations
         WHERE tenant_id = ? AND id = ?`,
      )
      .get(this.tenant(), id) as { document_json: string } | undefined;
    return row ? deserializeConversation(row.document_json) : null;
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const copy = deserializeConversation(serializeConversation(conversation));
    this.db
      .prepare(
        `
        INSERT INTO crm_conversations (
          tenant_id, id, external_id, customer_id, expires_at_ms, document_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          external_id = excluded.external_id,
          customer_id = excluded.customer_id,
          expires_at_ms = excluded.expires_at_ms,
          document_json = excluded.document_json
        `,
      )
      .run(
        this.tenant(),
        copy.id,
        copy.externalId,
        copy.customerId,
        copy.expiresAt.getTime(),
        serializeConversation(copy),
      );
    return deserializeConversation(serializeConversation(copy));
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    const result = this.db
      .prepare(
        `DELETE FROM crm_conversations
         WHERE tenant_id = ? AND expires_at_ms < ?`,
      )
      .run(this.tenant(), now.getTime());
    return Number(result.changes ?? 0);
  }
}
