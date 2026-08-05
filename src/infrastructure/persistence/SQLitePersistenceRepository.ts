import { DatabaseSync } from 'node:sqlite';
import type { ConversationMemorySnapshot } from '../../domain/conversation/conversationMemory';
import type { Conversation } from '../../domain/entities/Conversation';
import type {
  PersistedSession,
  PersistenceRepositoryOptions,
} from '../../domain/persistence/persistedSession';
import { fromPersistedConversation } from '../../domain/persistence/persistedSession';
import type { PersistenceRepository } from '../../domain/ports/PersistenceRepository';
import {
  ensureTenantIdColumn,
  ensureTenantIndexes,
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * Persistencia del producto en SQLite (scoped por tenantId).
 * Único módulo de sessions que conoce SQL / node:sqlite.
 */
export class SQLitePersistenceRepository implements PersistenceRepository {
  private readonly db: DatabaseSync;
  private readonly defaultTtlMs: number;
  private readonly now: () => number;
  private readonly fixedTenantId?: string;

  constructor(
    databasePath: string = ':memory:',
    options: PersistenceRepositoryOptions & TenantScopedOptions = {},
  ) {
    this.defaultTtlMs = options.defaultTtlMs ?? 24 * 60 * 60_000;
    this.now = options.now ?? (() => Date.now());
    this.fixedTenantId = options.tenantId;
    this.db = new DatabaseSync(databasePath);
    if (databasePath !== ':memory:') {
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
      } catch {
        /* ignore */
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS persisted_sessions (
        wa_id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        customer_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        state TEXT NOT NULL,
        lead_score INTEGER,
        last_reference TEXT,
        last_references_json TEXT NOT NULL DEFAULT '[]',
        last_vehicle_json TEXT NOT NULL DEFAULT '{}',
        last_technical_question TEXT,
        last_technical_answer TEXT,
        recommended_ids_json TEXT NOT NULL DEFAULT '[]',
        sales_flow_json TEXT,
        recovery_offer_pending INTEGER NOT NULL DEFAULT 0,
        conversation_json TEXT NOT NULL,
        memory_json TEXT,
        saved_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        tenant_id TEXT NOT NULL DEFAULT 'rodacenter'
      );
      CREATE INDEX IF NOT EXISTS idx_persisted_sessions_expires
        ON persisted_sessions(expires_at);
    `);
    ensureTenantIdColumn(this.db, 'persisted_sessions');
    ensureTenantIndexes(this.db);
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  save(session: PersistedSession): void {
    this.cleanupExpired();

    const now = this.now();
    const expiresAt =
      session.expiresAt > now ? session.expiresAt : now + this.defaultTtlMs;
    const tenantId = this.tenant();

    this.db
      .prepare(
        `
        INSERT INTO persisted_sessions (
          tenant_id, wa_id, conversation_id, customer_id, channel, state,
          lead_score, last_reference, last_references_json, last_vehicle_json,
          last_technical_question, last_technical_answer, recommended_ids_json,
          sales_flow_json, recovery_offer_pending, conversation_json, memory_json,
          saved_at, updated_at, expires_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?
        )
        ON CONFLICT(wa_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          conversation_id = excluded.conversation_id,
          customer_id = excluded.customer_id,
          channel = excluded.channel,
          state = excluded.state,
          lead_score = excluded.lead_score,
          last_reference = excluded.last_reference,
          last_references_json = excluded.last_references_json,
          last_vehicle_json = excluded.last_vehicle_json,
          last_technical_question = excluded.last_technical_question,
          last_technical_answer = excluded.last_technical_answer,
          recommended_ids_json = excluded.recommended_ids_json,
          sales_flow_json = excluded.sales_flow_json,
          recovery_offer_pending = excluded.recovery_offer_pending,
          conversation_json = excluded.conversation_json,
          memory_json = excluded.memory_json,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
        WHERE persisted_sessions.tenant_id = excluded.tenant_id
      `,
      )
      .run(
        tenantId,
        session.waId,
        session.conversationId,
        session.customerId,
        session.channel,
        session.state,
        session.leadScore,
        session.lastRecommendedReference,
        JSON.stringify(session.lastRecommendedReferences ?? []),
        JSON.stringify(session.lastVehicle ?? {}),
        session.lastTechnicalQuestion,
        session.lastTechnicalAnswer,
        JSON.stringify(session.recommendedProductIds ?? []),
        session.salesFlow ? JSON.stringify(session.salesFlow) : null,
        session.recoveryOfferPending ? 1 : 0,
        JSON.stringify(session.conversation),
        session.memory ? JSON.stringify(session.memory) : null,
        session.savedAt || now,
        now,
        expiresAt,
      );
  }

  load(waId: string): PersistedSession | null {
    this.cleanupExpired();

    const row = this.db
      .prepare(
        `SELECT * FROM persisted_sessions WHERE tenant_id = ? AND wa_id = ?`,
      )
      .get(this.tenant(), waId) as SessionRow | undefined;

    if (!row) return null;
    return rowToSession(row);
  }

  delete(waId: string): void {
    this.db
      .prepare(
        `DELETE FROM persisted_sessions WHERE tenant_id = ? AND wa_id = ?`,
      )
      .run(this.tenant(), waId);
  }

  cleanupExpired(now: number = this.now()): number {
    const result = this.db
      .prepare(
        `DELETE FROM persisted_sessions WHERE tenant_id = ? AND expires_at <= ?`,
      )
      .run(this.tenant(), now);
    return Number(result.changes ?? 0);
  }

  restoreConversation(waId: string): Conversation | null {
    const session = this.load(waId);
    if (!session) return null;
    return fromPersistedConversation(session.conversation);
  }

  restoreMemory(waId: string): ConversationMemorySnapshot | null {
    const session = this.load(waId);
    if (!session?.memory) return null;
    if (session.memory.expiresAt <= this.now()) return null;
    return structuredClone(session.memory);
  }

  close(): void {
    this.db.close();
  }
}

interface SessionRow {
  wa_id: string;
  conversation_id: string;
  customer_id: string;
  channel: string;
  state: string;
  lead_score: number | null;
  last_reference: string | null;
  last_references_json: string;
  last_vehicle_json: string;
  last_technical_question: string | null;
  last_technical_answer: string | null;
  recommended_ids_json: string;
  sales_flow_json: string | null;
  recovery_offer_pending: number;
  conversation_json: string;
  memory_json: string | null;
  saved_at: number;
  updated_at: number;
  expires_at: number;
}

function rowToSession(row: SessionRow): PersistedSession {
  return {
    waId: row.wa_id,
    conversationId: row.conversation_id,
    customerId: row.customer_id,
    channel: row.channel as PersistedSession['channel'],
    state: row.state,
    leadScore: row.lead_score,
    lastRecommendedReference: row.last_reference,
    lastRecommendedReferences: JSON.parse(row.last_references_json || '[]') as string[],
    lastVehicle: JSON.parse(row.last_vehicle_json || '{}') as PersistedSession['lastVehicle'],
    lastTechnicalQuestion: row.last_technical_question,
    lastTechnicalAnswer: row.last_technical_answer,
    recommendedProductIds: JSON.parse(row.recommended_ids_json || '[]') as string[],
    salesFlow: row.sales_flow_json
      ? (JSON.parse(row.sales_flow_json) as PersistedSession['salesFlow'])
      : null,
    recoveryOfferPending: Boolean(row.recovery_offer_pending),
    conversation: JSON.parse(row.conversation_json) as PersistedSession['conversation'],
    memory: row.memory_json
      ? (JSON.parse(row.memory_json) as ConversationMemorySnapshot)
      : null,
    savedAt: row.saved_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}
