import { DatabaseSync } from 'node:sqlite';
import type {
  ConversationListDto,
  ConversationListItemDto,
  ConversationListQuery,
} from '../../domain/dashboard/conversationListDto';
import type { ConversationRepository } from '../../domain/dashboard/ConversationRepository';
import {
  ensureTenantIdColumn,
  ensureTenantIndexes,
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

interface SessionRow {
  wa_id: string;
  conversation_id: string;
  customer_id: string;
  state: string;
  lead_score: number | null;
  last_reference: string | null;
  last_vehicle_json: string;
  sales_flow_json: string | null;
  conversation_json: string;
  saved_at: number;
  updated_at: number;
}

/**
 * Lista conversaciones desde SQLite (persisted_sessions + learning_events).
 * No modifica PersistenceRepository ni LearningEngine.
 */
export class SQLiteConversationRepository implements ConversationRepository {
  private readonly db: DatabaseSync;
  private readonly fixedTenantId?: string;

  constructor(
    databasePath: string = ':memory:',
    options: TenantScopedOptions = {},
  ) {
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

  list(query: ConversationListQuery = {}): ConversationListDto {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 20)));
    const sortBy = query.sortBy === 'createdAt' ? 'createdAt' : 'lastActivityAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const q = query.q?.trim() ? query.q.trim().toLowerCase() : null;

    const all = this.loadAllItems();
    const filtered = q
      ? all.filter((item) => matchesSearch(item, q))
      : all;

    filtered.sort((a, b) => {
      const av =
        sortBy === 'createdAt'
          ? Date.parse(a.createdAt)
          : Date.parse(a.lastActivityAt);
      const bv =
        sortBy === 'createdAt'
          ? Date.parse(b.createdAt)
          : Date.parse(b.lastActivityAt);
      return sortOrder === 'asc' ? av - bv : bv - av;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const offset = (page - 1) * pageSize;
    const items = filtered.slice(offset, offset + pageSize);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages,
      query: q,
      sortBy,
      sortOrder,
    };
  }

  /** Helpers de prueba. */
  upsertSession(input: {
    waId: string;
    conversationId: string;
    customerId?: string;
    state: string;
    leadScore?: number | null;
    lastReference?: string | null;
    vehicle?: { brand?: string; model?: string; year?: string };
    customerName?: string | null;
    salesFlowState?: string;
    savedAt: number;
    updatedAt: number;
    expiresAt?: number;
  }): void {
    const vehicle = input.vehicle ?? {};
    const conversationJson = JSON.stringify({
      id: input.conversationId,
      customerId: input.customerId ?? `cust-${input.waId}`,
      channel: 'whatsapp',
      externalId: input.waId,
      context: {
        vehicle,
        lastRecommendedReference: input.lastReference ?? undefined,
        salesFlow: input.salesFlowState
          ? {
              state: input.salesFlowState,
              leadScore: input.leadScore ?? 0,
              vehicle,
            }
          : undefined,
      },
      messages: input.customerName
        ? [
            {
              id: 'm0',
              conversationId: input.conversationId,
              role: 'customer',
              content: 'hola',
              createdAt: new Date(input.savedAt).toISOString(),
              metadata: { customerName: input.customerName },
            },
          ]
        : [],
      createdAt: new Date(input.savedAt).toISOString(),
      updatedAt: new Date(input.updatedAt).toISOString(),
      expiresAt: new Date(input.expiresAt ?? input.updatedAt + 3_600_000).toISOString(),
    });

    const salesFlowJson = input.salesFlowState
      ? JSON.stringify({
          state: input.salesFlowState,
          leadScore: input.leadScore ?? 0,
          vehicle,
        })
      : null;

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
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
        WHERE persisted_sessions.tenant_id = excluded.tenant_id
      `,
      )
      .run(
        this.tenant(),
        input.waId,
        input.conversationId,
        input.customerId ?? `cust-${input.waId}`,
        input.state,
        input.leadScore ?? null,
        input.lastReference ?? null,
        JSON.stringify(vehicle),
        salesFlowJson,
        conversationJson,
        input.savedAt,
        input.updatedAt,
        input.expiresAt ?? input.updatedAt + 3_600_000,
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
    durationMs?: number;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO learning_events (
          id, tenant_id, conversation_id, wa_id, brand, model, year, reference, match_kind,
          intent, question, technical_question, accepted, abandoned,
          duration_ms, timestamp, sales_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 0, ?, ?, ?)
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
        input.durationMs ?? 0,
        input.timestamp,
        input.salesState ?? null,
      );
  }

  close(): void {
    this.db.close();
  }

  private loadAllItems(): ConversationListItemDto[] {
    const byKey = new Map<string, ConversationListItemDto>();
    const tenantId = this.tenant();

    const sessions = this.db
      .prepare(`SELECT * FROM persisted_sessions WHERE tenant_id = ?`)
      .all(tenantId) as unknown as SessionRow[];

    for (const row of sessions) {
      const item = sessionToItem(row);
      byKey.set(item.id, item);
    }

    // Enriquecer / agregar conversaciones solo vistas en learning_events.
    const learning = this.db
      .prepare(
        `
        SELECT conversation_id, wa_id,
          MAX(timestamp) AS last_ts,
          MIN(timestamp) AS first_ts,
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
      first_ts: number;
      brand: string | null;
      model: string | null;
      year: string | null;
      reference: string | null;
      sales_state: string | null;
    }>;

    for (const row of learning) {
      const existing = byKey.get(row.conversation_id);
      if (existing) {
        if (!existing.vehicle && (row.brand || row.model)) {
          existing.vehicle = [row.brand, row.model].filter(Boolean).join(' ') || null;
        }
        if (!existing.year && row.year) existing.year = row.year;
        if (!existing.recommendedReference && row.reference) {
          existing.recommendedReference = row.reference;
        }
        continue;
      }

      byKey.set(row.conversation_id, {
        id: row.conversation_id,
        customerName: null,
        phone: row.wa_id,
        vehicle: [row.brand, row.model].filter(Boolean).join(' ') || null,
        year: row.year,
        recommendedReference: row.reference,
        salesFlowState: row.sales_state ?? 'UNKNOWN',
        leadScore: null,
        createdAt: new Date(row.first_ts).toISOString(),
        lastActivityAt: new Date(row.last_ts).toISOString(),
      });
    }

    return [...byKey.values()];
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

function sessionToItem(row: SessionRow): ConversationListItemDto {
  let vehicleObj: { brand?: string; model?: string; year?: string } = {};
  try {
    vehicleObj = JSON.parse(row.last_vehicle_json || '{}') as typeof vehicleObj;
  } catch {
    vehicleObj = {};
  }

  let salesState = row.state;
  let leadScore = row.lead_score;
  try {
    if (row.sales_flow_json) {
      const sales = JSON.parse(row.sales_flow_json) as {
        state?: string;
        leadScore?: number;
        vehicle?: { brand?: string; model?: string; year?: string };
      };
      if (sales.state) salesState = sales.state;
      if (typeof sales.leadScore === 'number') leadScore = sales.leadScore;
      if (sales.vehicle && !vehicleObj.brand) vehicleObj = sales.vehicle;
    }
  } catch {
    /* ignore */
  }

  let customerName: string | null = null;
  let createdIso = new Date(row.saved_at).toISOString();
  try {
    const conv = JSON.parse(row.conversation_json || '{}') as {
      createdAt?: string;
      messages?: Array<{ metadata?: { customerName?: string } }>;
      context?: {
        vehicle?: { brand?: string; model?: string; year?: string };
        lastRecommendedReference?: string;
      };
    };
    if (conv.createdAt) createdIso = new Date(conv.createdAt).toISOString();
    const named = conv.messages?.find((m) => m.metadata?.customerName)?.metadata
      ?.customerName;
    if (named?.trim()) customerName = named.trim();
    if (!vehicleObj.brand && conv.context?.vehicle) {
      vehicleObj = conv.context.vehicle;
    }
  } catch {
    /* ignore */
  }

  const vehicleLabel =
    [vehicleObj.brand, vehicleObj.model].filter(Boolean).join(' ') || null;

  return {
    id: row.conversation_id,
    customerName,
    phone: row.wa_id,
    vehicle: vehicleLabel,
    year: vehicleObj.year?.trim() || null,
    recommendedReference: row.last_reference,
    salesFlowState: salesState,
    leadScore: leadScore ?? null,
    createdAt: createdIso,
    lastActivityAt: new Date(row.updated_at).toISOString(),
  };
}

function matchesSearch(item: ConversationListItemDto, q: string): boolean {
  const haystack = [
    item.id,
    item.customerName,
    item.phone,
    item.vehicle,
    item.year,
    item.recommendedReference,
    item.salesFlowState,
    item.leadScore != null ? String(item.leadScore) : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}
