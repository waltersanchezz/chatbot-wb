import { DatabaseSync } from 'node:sqlite';
import type { DashboardDto } from '../../domain/dashboard/dashboardDto';
import type { DashboardRepository } from '../../domain/ports/DashboardRepository';
import {
  ensureTenantIdColumn,
  ensureTenantIndexes,
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * Lee métricas del Dashboard desde SQLite (learning_events + persisted_sessions).
 * No modifica PersistenceRepository ni LearningEngine.
 */
export class SQLiteDashboardRepository implements DashboardRepository {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly fixedTenantId?: string;

  constructor(
    databasePath: string = ':memory:',
    options: { now?: () => number } & TenantScopedOptions = {},
  ) {
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
    this.ensureSchema();
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  getDashboardSummary(now: number = this.now()): DashboardDto {
    const { start, end } = dayBoundsBogota(now);

    const conversacionesHoy = this.countDistinctConversationsBetween(start, end);
    const clientesActivos = this.countActiveClients(start);
    const leadsPendientes = this.countPendingLeads();
    const conversacionesCerradasHoy = this.countClosedToday(start, end);
    const tiempoPromedioConversacionMs = this.averageDurationMs();

    return {
      conversacionesHoy,
      clientesActivos,
      leadsPendientes,
      conversacionesCerradasHoy,
      tiempoPromedioConversacionMs,
      tiempoPromedioConversacion: formatDuration(tiempoPromedioConversacionMs),
      generatedAt: new Date(now).toISOString(),
    };
  }

  /** Inserción de prueba (solo tests). */
  insertLearningEvent(row: {
    id: string;
    conversationId: string;
    waId: string;
    timestamp: number;
    durationMs?: number;
    salesState?: string | null;
    accepted?: number | null;
    abandoned?: number;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO learning_events (
          id, tenant_id, conversation_id, wa_id, brand, model, year, reference, match_kind,
          intent, question, technical_question, accepted, abandoned,
          duration_ms, timestamp, sales_state
        ) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        row.id,
        this.tenant(),
        row.conversationId,
        row.waId,
        row.accepted ?? null,
        row.abandoned ?? 0,
        row.durationMs ?? 0,
        row.timestamp,
        row.salesState ?? null,
      );
  }

  upsertPersistedSession(row: {
    waId: string;
    state: string;
    updatedAt: number;
    expiresAt: number;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO persisted_sessions (
          tenant_id, wa_id, conversation_id, customer_id, channel, state,
          last_references_json, last_vehicle_json, recommended_ids_json,
          recovery_offer_pending, conversation_json,
          saved_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, 'whatsapp', ?, '[]', '{}', '[]', 0, '{}', ?, ?, ?)
        ON CONFLICT(wa_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          state = excluded.state,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
        WHERE persisted_sessions.tenant_id = excluded.tenant_id
      `,
      )
      .run(
        this.tenant(),
        row.waId,
        `conv-${row.waId}`,
        `cust-${row.waId}`,
        row.state,
        row.updatedAt,
        row.updatedAt,
        row.expiresAt,
      );
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS learning_events (
        id TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        wa_id TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        year TEXT,
        reference TEXT,
        match_kind TEXT,
        intent TEXT,
        question TEXT,
        technical_question TEXT,
        accepted INTEGER,
        abandoned INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        sales_state TEXT,
        tenant_id TEXT NOT NULL DEFAULT 'rodacenter'
      );
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
    `);
    ensureTenantIdColumn(this.db, 'persisted_sessions');
    ensureTenantIdColumn(this.db, 'learning_events');
    ensureTenantIndexes(this.db);
  }

  private countDistinctConversationsBetween(start: number, end: number): number {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND timestamp >= ? AND timestamp < ?
      `,
      )
      .get(this.tenant(), start, end) as { c: number };
    return Number(row.c);
  }

  private countActiveClients(dayStart: number): number {
    const fromLearning = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT wa_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND timestamp >= ?
      `,
      )
      .get(this.tenant(), dayStart) as { c: number };

    const fromSessions = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT wa_id) AS c
        FROM persisted_sessions
        WHERE tenant_id = ?
          AND expires_at > ? AND state NOT IN ('CLOSED', 'unknown')
      `,
      )
      .get(this.tenant(), this.now()) as { c: number };

    return Math.max(Number(fromLearning.c), Number(fromSessions.c));
  }

  private countPendingLeads(): number {
    const fromSessions = this.db
      .prepare(
        `
        SELECT COUNT(*) AS c
        FROM persisted_sessions
        WHERE tenant_id = ?
          AND (
            state = 'READY_FOR_ADVISOR'
            OR recovery_offer_pending = 1
          )
      `,
      )
      .get(this.tenant()) as { c: number };

    const fromLearning = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events le
        WHERE le.tenant_id = ?
          AND le.sales_state = 'READY_FOR_ADVISOR'
          AND le.abandoned = 0
          AND le.timestamp = (
            SELECT MAX(le2.timestamp)
            FROM learning_events le2
            WHERE le2.tenant_id = le.tenant_id
              AND le2.conversation_id = le.conversation_id
          )
      `,
      )
      .get(this.tenant()) as { c: number };

    return Math.max(Number(fromSessions.c), Number(fromLearning.c));
  }

  private countClosedToday(start: number, end: number): number {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND timestamp >= ? AND timestamp < ?
          AND (
            sales_state = 'CLOSED'
            OR accepted = 1
            OR sales_state = 'READY_FOR_ADVISOR'
          )
      `,
      )
      .get(this.tenant(), start, end) as { c: number };
    return Number(row.c);
  }

  private averageDurationMs(): number {
    const row = this.db
      .prepare(
        `
        SELECT AVG(duration_ms) AS avg_ms
        FROM (
          SELECT conversation_id, MAX(duration_ms) AS duration_ms
          FROM learning_events
          WHERE tenant_id = ?
          GROUP BY conversation_id
        )
      `,
      )
      .get(this.tenant()) as { avg_ms: number | null };
    if (row.avg_ms == null || Number.isNaN(Number(row.avg_ms))) return 0;
    return Math.round(Number(row.avg_ms));
  }
}

/** Inicio/fin del día en America/Bogota (UTC-5 fijo, sin DST). */
export function dayBoundsBogota(nowMs: number): { start: number; end: number } {
  const offsetMs = 5 * 60 * 60_000;
  const local = nowMs - offsetMs;
  const dayStartUtc = Math.floor(local / 86_400_000) * 86_400_000;
  const start = dayStartUtc + offsetMs;
  return { start, end: start + 86_400_000 };
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
