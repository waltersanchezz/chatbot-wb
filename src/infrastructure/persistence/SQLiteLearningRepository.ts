import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  LearningEventDto,
  LearningQueryOptions,
  LearningRecordInput,
  LearningStatsDto,
  RankedItemDto,
} from '../../domain/learning/learningDtos';
import type { LearningRepository } from '../../domain/ports/LearningRepository';
import {
  ensureTenantIdColumn,
  ensureTenantIndexes,
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * Learning Repository en SQLite (scoped por tenantId).
 */
export class SQLiteLearningRepository implements LearningRepository {
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
      CREATE INDEX IF NOT EXISTS idx_learning_brand ON learning_events(brand);
      CREATE INDEX IF NOT EXISTS idx_learning_reference ON learning_events(reference);
      CREATE INDEX IF NOT EXISTS idx_learning_conversation ON learning_events(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_learning_timestamp ON learning_events(timestamp);
    `);
    ensureTenantIdColumn(this.db, 'learning_events');
    ensureTenantIndexes(this.db);
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  record(event: LearningRecordInput): LearningEventDto {
    const id = randomUUID();
    const timestamp = event.timestamp ?? this.now();
    const accepted =
      event.accepted === undefined ? null : event.accepted === null ? null : event.accepted ? 1 : 0;
    const abandoned = event.abandoned ? 1 : 0;
    const durationMs = Math.max(0, event.durationMs ?? 0);
    const tenantId = this.tenant();

    this.db
      .prepare(
        `
        INSERT INTO learning_events (
          id, tenant_id, conversation_id, wa_id, brand, model, year, reference, match_kind,
          intent, question, technical_question, accepted, abandoned,
          duration_ms, timestamp, sales_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        event.conversationId,
        event.waId,
        normalize(event.brand),
        normalize(event.model),
        normalize(event.year),
        normalize(event.reference),
        normalize(event.matchKind),
        normalize(event.intent),
        normalize(event.question),
        normalize(event.technicalQuestion),
        accepted,
        abandoned,
        durationMs,
        timestamp,
        normalize(event.salesState),
      );

    return {
      id,
      conversationId: event.conversationId,
      waId: event.waId,
      brand: normalize(event.brand),
      model: normalize(event.model),
      year: normalize(event.year),
      reference: normalize(event.reference),
      matchKind: normalize(event.matchKind),
      intent: normalize(event.intent),
      question: normalize(event.question),
      technicalQuestion: normalize(event.technicalQuestion),
      accepted: event.accepted === undefined ? null : event.accepted,
      abandoned: Boolean(event.abandoned),
      durationMs,
      timestamp,
      salesState: normalize(event.salesState),
    };
  }

  count(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM learning_events WHERE tenant_id = ?`)
      .get(this.tenant()) as { c: number };
    return Number(row.c);
  }

  topVehicles(options?: LearningQueryOptions): RankedItemDto[] {
    const limit = clampLimit(options?.limit);
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

  topReferences(options?: LearningQueryOptions): RankedItemDto[] {
    return this.rankedColumn('reference', options);
  }

  topBrands(options?: LearningQueryOptions): RankedItemDto[] {
    return this.rankedColumn('brand', options);
  }

  topQuestions(options?: LearningQueryOptions): RankedItemDto[] {
    return this.rankedColumn('question', options);
  }

  topTechnicalQuestions(options?: LearningQueryOptions): RankedItemDto[] {
    return this.rankedColumn('technical_question', options);
  }

  topRecommendations(options?: LearningQueryOptions): RankedItemDto[] {
    const limit = clampLimit(options?.limit);
    const rows = this.db
      .prepare(
        `
        SELECT reference, COUNT(*) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND reference IS NOT NULL
          AND (accepted = 1 OR sales_state IN ('WAITING_CONFIRMATION', 'READY_FOR_ADVISOR'))
        GROUP BY reference
        ORDER BY c DESC, reference ASC
        LIMIT ?
      `,
      )
      .all(this.tenant(), limit) as Array<{ reference: string; c: number }>;

    return rows.map((r) => ({
      key: r.reference,
      label: r.reference,
      count: Number(r.c),
    }));
  }

  finishedConversations(): number {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND (sales_state IN ('READY_FOR_ADVISOR', 'CLOSED') OR accepted = 1)
      `,
      )
      .get(this.tenant()) as { c: number };
    return Number(row.c);
  }

  abandonedConversations(): number {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(DISTINCT conversation_id) AS c
        FROM learning_events
        WHERE tenant_id = ? AND abandoned = 1
      `,
      )
      .get(this.tenant()) as { c: number };
    return Number(row.c);
  }

  averageDurationMs(): number {
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

  getStats(options?: LearningQueryOptions): LearningStatsDto {
    const limit = clampLimit(options?.limit);
    return {
      totalEvents: this.count(),
      finishedConversations: this.finishedConversations(),
      abandonedConversations: this.abandonedConversations(),
      averageDurationMs: this.averageDurationMs(),
      topVehicles: this.topVehicles({ limit }),
      topReferences: this.topReferences({ limit }),
      topBrands: this.topBrands({ limit }),
      topQuestions: this.topQuestions({ limit }),
      topTechnicalQuestions: this.topTechnicalQuestions({ limit }),
      topRecommendations: this.topRecommendations({ limit }),
    };
  }

  listEvents(options?: LearningQueryOptions): LearningEventDto[] {
    const limit = clampLimit(options?.limit, 100);
    const rows = this.db
      .prepare(
        `
        SELECT * FROM learning_events
        WHERE tenant_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), limit) as unknown as LearningRow[];

    return rows.map(rowToDto);
  }

  close(): void {
    this.db.close();
  }

  private rankedColumn(
    column: 'reference' | 'brand' | 'question' | 'technical_question',
    options?: LearningQueryOptions,
  ): RankedItemDto[] {
    const limit = clampLimit(options?.limit);
    const rows = this.db
      .prepare(
        `
        SELECT ${column} AS key, COUNT(*) AS c
        FROM learning_events
        WHERE tenant_id = ?
          AND ${column} IS NOT NULL AND TRIM(${column}) != ''
        GROUP BY ${column}
        ORDER BY c DESC, key ASC
        LIMIT ?
      `,
      )
      .all(this.tenant(), limit) as Array<{ key: string; c: number }>;

    return rows.map((r) => ({
      key: r.key,
      label: r.key,
      count: Number(r.c),
    }));
  }
}

interface LearningRow {
  id: string;
  conversation_id: string;
  wa_id: string;
  brand: string | null;
  model: string | null;
  year: string | null;
  reference: string | null;
  match_kind: string | null;
  intent: string | null;
  question: string | null;
  technical_question: string | null;
  accepted: number | null;
  abandoned: number;
  duration_ms: number;
  timestamp: number;
  sales_state: string | null;
}

function rowToDto(row: LearningRow): LearningEventDto {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    waId: row.wa_id,
    brand: row.brand,
    model: row.model,
    year: row.year,
    reference: row.reference,
    matchKind: row.match_kind,
    intent: row.intent,
    question: row.question,
    technicalQuestion: row.technical_question,
    accepted: row.accepted === null || row.accepted === undefined ? null : row.accepted === 1,
    abandoned: Boolean(row.abandoned),
    durationMs: Number(row.duration_ms),
    timestamp: Number(row.timestamp),
    salesState: row.sales_state,
  };
}

function normalize(value?: string | null): string | null {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

function clampLimit(limit?: number, fallback = 10): number {
  if (limit == null || Number.isNaN(limit)) return fallback;
  return Math.min(Math.max(1, Math.floor(limit)), 100);
}
