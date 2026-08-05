import { DatabaseSync } from 'node:sqlite';
import type {
  AnalyticsDto,
  AnalyticsRankedItemDto,
} from '../../domain/dashboard/analyticsDto';
import type { AnalyticsRepository } from '../../domain/dashboard/AnalyticsRepository';
import {
  dayBoundsBogota,
  formatDuration,
} from './SQLiteDashboardRepository';
import {
  ensureTenantIdColumn,
  ensureTenantIndexes,
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

const TOP_LIMIT = 10;

/**
 * Analítica comercial desde SQLite (learning_events + persisted_sessions).
 * No modifica PersistenceRepository ni LearningEngine.
 */
export class SQLiteAnalyticsRepository implements AnalyticsRepository {
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

  getAnalytics(): AnalyticsDto {
    const now = this.now();
    const { start: dayStart, end: dayEnd } = dayBoundsBogota(now);
    const weekStart = dayStart - 6 * 86_400_000;
    const monthStart = monthStartBogota(now);

    const conversaciones = {
      hoy: this.countDistinctConversationsBetween(dayStart, dayEnd),
      semana: this.countDistinctConversationsBetween(weekStart, dayEnd),
      mes: this.countDistinctConversationsBetween(monthStart, dayEnd),
    };

    const leads = {
      generados: this.countLeadsGenerados(),
      listosParaAsesor: this.countDistinctBySalesState('READY_FOR_ADVISOR'),
      abandonados: this.countAbandoned(),
      cerrados: this.countClosed(),
    };

    const tiempoPromedioConversacionMs = this.averageDurationMs();
    const tasaAceptacion = this.acceptanceRate();

    return {
      conversaciones,
      leads,
      topReferencias: this.topReferences(TOP_LIMIT),
      topVehiculos: this.topVehicles(TOP_LIMIT),
      topPreguntasTecnicas: this.topTechnicalQuestions(TOP_LIMIT),
      promedioLeadScore: this.averageLeadScore(),
      tiempoPromedioConversacionMs,
      tiempoPromedioConversacion: formatDuration(tiempoPromedioConversacionMs),
      tasaAceptacion,
      generatedAt: new Date(now).toISOString(),
    };
  }

  /** Helper de pruebas. */
  insertLearningEvent(row: {
    id: string;
    conversationId: string;
    waId: string;
    timestamp: number;
    durationMs?: number;
    salesState?: string | null;
    accepted?: number | null;
    abandoned?: number;
    brand?: string | null;
    model?: string | null;
    year?: string | null;
    reference?: string | null;
    technicalQuestion?: string | null;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO learning_events (
          id, tenant_id, conversation_id, wa_id, brand, model, year, reference, match_kind,
          intent, question, technical_question, accepted, abandoned,
          duration_ms, timestamp, sales_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        row.id,
        this.tenant(),
        row.conversationId,
        row.waId,
        row.brand ?? null,
        row.model ?? null,
        row.year ?? null,
        row.reference ?? null,
        row.technicalQuestion ?? null,
        row.accepted ?? null,
        row.abandoned ?? 0,
        row.durationMs ?? 0,
        row.timestamp,
        row.salesState ?? null,
      );
  }

  upsertPersistedSession(row: {
    waId: string;
    conversationId?: string;
    state: string;
    leadScore?: number | null;
    updatedAt: number;
    expiresAt: number;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO persisted_sessions (
          tenant_id, wa_id, conversation_id, customer_id, channel, state, lead_score,
          last_references_json, last_vehicle_json, recommended_ids_json,
          recovery_offer_pending, conversation_json,
          saved_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, 'whatsapp', ?, ?, '[]', '{}', '[]', 0, '{}', ?, ?, ?)
        ON CONFLICT(wa_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          state = excluded.state,
          lead_score = excluded.lead_score,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
        WHERE persisted_sessions.tenant_id = excluded.tenant_id
      `,
      )
      .run(
        this.tenant(),
        row.waId,
        row.conversationId ?? `conv-${row.waId}`,
        `cust-${row.waId}`,
        row.state,
        row.leadScore ?? null,
        row.updatedAt,
        row.updatedAt,
        row.expiresAt,
      );
  }

  close(): void {
    this.db.close();
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

  private countLeadsGenerados(): number {
    const fromLearning = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND (
            sales_state IN (
              'RECOMMENDATION_READY',
              'WAITING_CONFIRMATION',
              'READY_FOR_ADVISOR',
              'CLOSED'
            )
            OR accepted = 1
            OR reference IS NOT NULL
          )
      `,
      )
      .get(this.tenant()) as { c: number };

    const fromSessions = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM persisted_sessions
        WHERE tenant_id = ?
          AND (
            state IN (
              'RECOMMENDATION_READY',
              'WAITING_CONFIRMATION',
              'READY_FOR_ADVISOR',
              'CLOSED'
            )
            OR (lead_score IS NOT NULL AND lead_score > 0)
          )
      `,
      )
      .get(this.tenant()) as { c: number };

    return Math.max(Number(fromLearning.c), Number(fromSessions.c));
  }

  private countDistinctBySalesState(state: string): number {
    const fromLearning = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND sales_state = ?
      `,
      )
      .get(this.tenant(), state) as { c: number };

    const fromSessions = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM persisted_sessions
        WHERE tenant_id = ?
          AND state = ?
      `,
      )
      .get(this.tenant(), state) as { c: number };

    return Math.max(Number(fromLearning.c), Number(fromSessions.c));
  }

  private countAbandoned(): number {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND abandoned = 1
      `,
      )
      .get(this.tenant()) as { c: number };
    return Number(row.c);
  }

  private countClosed(): number {
    const fromLearning = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND (sales_state = 'CLOSED' OR accepted = 1)
      `,
      )
      .get(this.tenant()) as { c: number };

    const fromSessions = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM persisted_sessions
        WHERE tenant_id = ?
          AND state = 'CLOSED'
      `,
      )
      .get(this.tenant()) as { c: number };

    return Math.max(Number(fromLearning.c), Number(fromSessions.c));
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

  private averageLeadScore(): number {
    const fromSessions = this.db
      .prepare(
        `
        SELECT AVG(lead_score) AS avg_score
        FROM persisted_sessions
        WHERE tenant_id = ?
          AND lead_score IS NOT NULL
      `,
      )
      .get(this.tenant()) as { avg_score: number | null };

    if (
      fromSessions.avg_score != null &&
      !Number.isNaN(Number(fromSessions.avg_score))
    ) {
      return Math.round(Number(fromSessions.avg_score) * 10) / 10;
    }
    return 0;
  }

  private acceptanceRate(): number {
    const row = this.db
      .prepare(
        `
        SELECT
          SUM(CASE WHEN accepted = 1 THEN 1 ELSE 0 END) AS accepted_n,
          SUM(CASE WHEN accepted IS NOT NULL THEN 1 ELSE 0 END) AS decided_n
        FROM learning_events
        WHERE tenant_id = ?
      `,
      )
      .get(this.tenant()) as { accepted_n: number | null; decided_n: number | null };

    const decided = Number(row.decided_n ?? 0);
    if (decided <= 0) return 0;
    const accepted = Number(row.accepted_n ?? 0);
    return Math.round((accepted / decided) * 1000) / 1000;
  }

  private topReferences(limit: number): AnalyticsRankedItemDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT reference AS label, COUNT(*) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND reference IS NOT NULL AND TRIM(reference) != ''
        GROUP BY reference
        ORDER BY c DESC, reference ASC
        LIMIT ?
      `,
      )
      .all(this.tenant(), limit) as Array<{ label: string; c: number }>;

    return rows.map((r) => ({
      key: r.label,
      label: r.label,
      count: Number(r.c),
    }));
  }

  private topVehicles(limit: number): AnalyticsRankedItemDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT brand, model, year, COUNT(*) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND brand IS NOT NULL AND model IS NOT NULL
        GROUP BY brand, model, year
        ORDER BY c DESC, brand ASC, model ASC
        LIMIT ?
      `,
      )
      .all(this.tenant(), limit) as Array<{
      brand: string;
      model: string;
      year: string | null;
      c: number;
    }>;

    return rows.map((r) => {
      const year = r.year ? ` ${r.year}` : '';
      const label = `${r.brand} ${r.model}${year}`.trim();
      return {
        key: `${r.brand}|${r.model}|${r.year ?? ''}`,
        label,
        count: Number(r.c),
      };
    });
  }

  private topTechnicalQuestions(limit: number): AnalyticsRankedItemDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT technical_question AS label, COUNT(*) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND technical_question IS NOT NULL AND TRIM(technical_question) != ''
        GROUP BY technical_question
        ORDER BY c DESC, technical_question ASC
        LIMIT ?
      `,
      )
      .all(this.tenant(), limit) as Array<{ label: string; c: number }>;

    return rows.map((r) => ({
      key: r.label,
      label: r.label,
      count: Number(r.c),
    }));
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
}

/** Inicio del mes calendario en America/Bogota (UTC-5 fijo). */
export function monthStartBogota(nowMs: number): number {
  const offsetMs = 5 * 60 * 60_000;
  const local = nowMs - offsetMs;
  const d = new Date(local);
  const firstLocalUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  return firstLocalUtc + offsetMs;
}
