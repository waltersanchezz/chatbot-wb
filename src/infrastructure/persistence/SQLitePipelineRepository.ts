import { DatabaseSync } from 'node:sqlite';
import type {
  PipelineCardDto,
  PipelineColumnDto,
  PipelineColumnKey,
  PipelineDto,
} from '../../domain/dashboard/pipelineDto';
import type { PipelineRepository } from '../../domain/dashboard/PipelineRepository';
import {
  ensureTenantIdColumn,
  ensureTenantIndexes,
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

interface SessionRow {
  wa_id: string;
  conversation_id: string;
  state: string;
  lead_score: number | null;
  last_reference: string | null;
  last_vehicle_json: string;
  sales_flow_json: string | null;
  conversation_json: string;
  updated_at: number;
}

const COLUMN_ORDER: PipelineColumnKey[] = [
  'NEW',
  'IDENTIFYING',
  'RECOMMENDATION_READY',
  'WAITING_CONFIRMATION',
  'READY_FOR_ADVISOR',
  'CLOSED',
];

const COLUMN_LABELS: Record<PipelineColumnKey, string> = {
  NEW: 'Nuevas',
  IDENTIFYING: 'Identificando',
  RECOMMENDATION_READY: 'Recomendación lista',
  WAITING_CONFIRMATION: 'Esperando confirmación',
  READY_FOR_ADVISOR: 'Listo para asesor',
  CLOSED: 'Cerradas',
};

/**
 * Pipeline Kanban desde SQLite (persisted_sessions + learning_events).
 * No modifica PersistenceRepository ni SalesFlowEngine.
 */
export class SQLitePipelineRepository implements PipelineRepository {
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

  getPipeline(): PipelineDto {
    const cards = this.loadCards();
    const buckets = new Map<PipelineColumnKey, PipelineCardDto[]>();
    for (const key of COLUMN_ORDER) buckets.set(key, []);

    for (const card of cards) {
      const col = mapStateToColumn(card.salesFlowState);
      buckets.get(col)!.push(card);
    }

    for (const key of COLUMN_ORDER) {
      buckets.get(key)!.sort(
        (a, b) => Date.parse(b.ultimaActividad) - Date.parse(a.ultimaActividad),
      );
    }

    const columns: PipelineColumnDto[] = COLUMN_ORDER.map((key) => {
      const list = buckets.get(key) ?? [];
      return {
        key,
        label: COLUMN_LABELS[key],
        count: list.length,
        cards: list,
      };
    });

    return {
      columns,
      totalCards: cards.length,
      generatedAt: new Date(this.now()).toISOString(),
    };
  }

  /** Helper de pruebas. */
  upsertSession(input: {
    waId: string;
    conversationId: string;
    state: string;
    salesFlowState?: string;
    leadScore?: number | null;
    lastReference?: string | null;
    vehicle?: { brand?: string; model?: string; year?: string };
    customerName?: string | null;
    updatedAt: number;
    savedAt?: number;
  }): void {
    const vehicle = input.vehicle ?? {};
    const salesState = input.salesFlowState ?? input.state;
    const savedAt = input.savedAt ?? input.updatedAt;
    const conversationJson = JSON.stringify({
      id: input.conversationId,
      externalId: input.waId,
      context: {
        vehicle,
        lastRecommendedReference: input.lastReference ?? undefined,
        salesFlow: {
          state: salesState,
          leadScore: input.leadScore ?? 0,
          vehicle,
        },
      },
      messages: input.customerName
        ? [
            {
              id: 'm0',
              role: 'customer',
              content: 'hola',
              createdAt: new Date(savedAt).toISOString(),
              metadata: { customerName: input.customerName },
            },
          ]
        : [],
    });

    this.db
      .prepare(
        `
        INSERT INTO persisted_sessions (
          tenant_id, wa_id, conversation_id, customer_id, channel, state, lead_score,
          last_reference, last_references_json, last_vehicle_json,
          recommended_ids_json, sales_flow_json, recovery_offer_pending,
          conversation_json, saved_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, 'whatsapp', ?, ?, ?, '[]', ?, '[]', ?, 0, ?, ?, ?, ?)
        ON CONFLICT(wa_id) DO UPDATE SET
          tenant_id = excluded.tenant_id,
          conversation_id = excluded.conversation_id,
          state = excluded.state,
          lead_score = excluded.lead_score,
          last_reference = excluded.last_reference,
          last_vehicle_json = excluded.last_vehicle_json,
          sales_flow_json = excluded.sales_flow_json,
          conversation_json = excluded.conversation_json,
          updated_at = excluded.updated_at
        WHERE persisted_sessions.tenant_id = excluded.tenant_id
      `,
      )
      .run(
        this.tenant(),
        input.waId,
        input.conversationId,
        `cust-${input.waId}`,
        input.state,
        input.leadScore ?? null,
        input.lastReference ?? null,
        JSON.stringify(vehicle),
        JSON.stringify({
          state: salesState,
          leadScore: input.leadScore ?? 0,
          vehicle,
        }),
        conversationJson,
        savedAt,
        input.updatedAt,
        input.updatedAt + 3_600_000,
      );
  }

  insertLearningEvent(input: {
    id: string;
    conversationId: string;
    waId: string;
    brand?: string;
    model?: string;
    year?: string;
    reference?: string;
    salesState?: string;
    timestamp: number;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO learning_events (
          id, tenant_id, conversation_id, wa_id, brand, model, year, reference, match_kind,
          intent, question, technical_question, accepted, abandoned,
          duration_ms, timestamp, sales_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 0, 0, ?, ?)
      `,
      )
      .run(
        input.id,
        this.tenant(),
        input.conversationId,
        input.waId,
        input.brand ?? null,
        input.model ?? null,
        input.year ?? null,
        input.reference ?? null,
        input.timestamp,
        input.salesState ?? null,
      );
  }

  close(): void {
    this.db.close();
  }

  private loadCards(): PipelineCardDto[] {
    const byId = new Map<string, PipelineCardDto>();
    const tenantId = this.tenant();

    const sessions = this.db
      .prepare(`SELECT * FROM persisted_sessions WHERE tenant_id = ?`)
      .all(tenantId) as unknown as SessionRow[];

    for (const row of sessions) {
      const card = sessionToCard(row);
      byId.set(card.id, card);
    }

    const learning = this.db
      .prepare(
        `
        SELECT conversation_id, wa_id,
          MAX(timestamp) AS last_ts,
          MAX(brand) AS brand,
          MAX(model) AS model,
          MAX(year) AS year,
          MAX(reference) AS reference,
          MAX(sales_state) AS sales_state
        FROM learning_events
        WHERE tenant_id = ?
        GROUP BY conversation_id, wa_id
      `,
      )
      .all(tenantId) as Array<{
      conversation_id: string;
      wa_id: string;
      last_ts: number;
      brand: string | null;
      model: string | null;
      year: string | null;
      reference: string | null;
      sales_state: string | null;
    }>;

    for (const row of learning) {
      if (byId.has(row.conversation_id)) continue;
      const vehiculo = [row.brand, row.model].filter(Boolean).join(' ') || null;
      byId.set(row.conversation_id, {
        id: row.conversation_id,
        nombre: null,
        waId: row.wa_id,
        vehiculo: vehiculo
          ? row.year
            ? `${vehiculo} ${row.year}`
            : vehiculo
          : null,
        referencia: row.reference,
        leadScore: null,
        ultimaActividad: new Date(row.last_ts).toISOString(),
        salesFlowState: row.sales_state ?? 'NEW',
      });
    }

    return [...byId.values()];
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

function sessionToCard(row: SessionRow): PipelineCardDto {
  let vehicleObj: { brand?: string; model?: string; year?: string } = {};
  try {
    vehicleObj = JSON.parse(row.last_vehicle_json || '{}') as typeof vehicleObj;
  } catch {
    vehicleObj = {};
  }

  let salesFlowState = row.state;
  let leadScore = row.lead_score;
  try {
    if (row.sales_flow_json) {
      const sales = JSON.parse(row.sales_flow_json) as {
        state?: string;
        leadScore?: number;
        vehicle?: { brand?: string; model?: string; year?: string };
      };
      if (sales.state) salesFlowState = sales.state;
      if (typeof sales.leadScore === 'number') leadScore = sales.leadScore;
      if (sales.vehicle && !vehicleObj.brand) vehicleObj = sales.vehicle;
    }
  } catch {
    /* ignore */
  }

  let nombre: string | null = null;
  try {
    const conv = JSON.parse(row.conversation_json || '{}') as {
      messages?: Array<{ metadata?: { customerName?: string } }>;
      context?: { vehicle?: { brand?: string; model?: string; year?: string } };
    };
    const named = conv.messages?.find((m) => m.metadata?.customerName)?.metadata
      ?.customerName;
    if (named?.trim()) nombre = named.trim();
    if (!vehicleObj.brand && conv.context?.vehicle) {
      vehicleObj = conv.context.vehicle;
    }
  } catch {
    /* ignore */
  }

  const base = [vehicleObj.brand, vehicleObj.model].filter(Boolean).join(' ');
  const vehiculo = base
    ? vehicleObj.year
      ? `${base} ${vehicleObj.year}`
      : base
    : null;

  return {
    id: row.conversation_id,
    nombre,
    waId: row.wa_id,
    vehiculo,
    referencia: row.last_reference,
    leadScore: leadScore ?? null,
    ultimaActividad: new Date(row.updated_at).toISOString(),
    salesFlowState,
  };
}

export function mapStateToColumn(state: string): PipelineColumnKey {
  const s = (state || '').toUpperCase();
  if (s === 'IDENTIFYING_VEHICLE' || s === 'IDENTIFYING') return 'IDENTIFYING';
  if (s === 'RECOMMENDATION_READY') return 'RECOMMENDATION_READY';
  if (s === 'WAITING_CONFIRMATION') return 'WAITING_CONFIRMATION';
  if (s === 'READY_FOR_ADVISOR') return 'READY_FOR_ADVISOR';
  if (s === 'CLOSED') return 'CLOSED';
  if (s === 'NEW') return 'NEW';
  return 'NEW';
}
