import { DatabaseSync } from 'node:sqlite';
import type {
  ConversationDetailDto,
  ConversationTimelineMessageDto,
} from '../../domain/dashboard/conversationDetailDto';
import type { ConversationDetailRepository } from '../../domain/dashboard/ConversationDetailRepository';
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
 * Detalle de conversación desde SQLite.
 * Independiente de PersistenceRepository / LearningEngine.
 */
export class SQLiteConversationDetailRepository
  implements ConversationDetailRepository
{
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

  findById(id: string): ConversationDetailDto | null {
    const row = this.db
      .prepare(
        `SELECT * FROM persisted_sessions WHERE tenant_id = ? AND conversation_id = ?`,
      )
      .get(this.tenant(), id) as SessionRow | undefined;

    if (row) {
      return this.fromSession(row);
    }

    // Fallback: conversación solo en learning_events.
    return this.fromLearningOnly(id);
  }

  /** Helper de pruebas. */
  upsertSession(input: {
    waId: string;
    conversationId: string;
    state: string;
    leadScore?: number | null;
    lastReference?: string | null;
    matchKind?: string | null;
    vehicle?: { brand?: string; model?: string; year?: string };
    customerName?: string | null;
    salesFlowState?: string;
    messages?: Array<{
      id: string;
      role: 'customer' | 'assistant' | 'system';
      content: string;
      createdAt: number;
    }>;
    savedAt: number;
    updatedAt: number;
  }): void {
    const vehicle = input.vehicle ?? {};
    const messages = (input.messages ?? []).map((m) => ({
      id: m.id,
      conversationId: input.conversationId,
      role: m.role,
      content: m.content,
      createdAt: new Date(m.createdAt).toISOString(),
      metadata:
        m.role === 'customer' && input.customerName
          ? { customerName: input.customerName }
          : undefined,
    }));

    const conversationJson = JSON.stringify({
      id: input.conversationId,
      customerId: `cust-${input.waId}`,
      channel: 'whatsapp',
      externalId: input.waId,
      context: {
        vehicle,
        lastRecommendedReference: input.lastReference ?? undefined,
        salesFlow: {
          state: input.salesFlowState ?? input.state,
          leadScore: input.leadScore ?? 0,
          matchKind: input.matchKind ?? undefined,
          vehicle,
        },
      },
      messages,
      createdAt: new Date(input.savedAt).toISOString(),
      updatedAt: new Date(input.updatedAt).toISOString(),
      expiresAt: new Date(input.updatedAt + 3_600_000).toISOString(),
    });

    const salesFlowJson = JSON.stringify({
      state: input.salesFlowState ?? input.state,
      leadScore: input.leadScore ?? 0,
      matchKind: input.matchKind ?? undefined,
      vehicle,
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
        salesFlowJson,
        conversationJson,
        input.savedAt,
        input.updatedAt,
        input.updatedAt + 3_600_000,
      );
  }

  close(): void {
    this.db.close();
  }

  private fromSession(row: SessionRow): ConversationDetailDto {
    let vehicleObj: { brand?: string; model?: string; year?: string } = {};
    try {
      vehicleObj = JSON.parse(row.last_vehicle_json || '{}') as typeof vehicleObj;
    } catch {
      vehicleObj = {};
    }

    let salesFlowState = row.state;
    let leadScore = row.lead_score;
    let matchKind: string | null = null;

    try {
      if (row.sales_flow_json) {
        const sales = JSON.parse(row.sales_flow_json) as {
          state?: string;
          leadScore?: number;
          matchKind?: string;
          vehicle?: { brand?: string; model?: string; year?: string };
        };
        if (sales.state) salesFlowState = sales.state;
        if (typeof sales.leadScore === 'number') leadScore = sales.leadScore;
        if (sales.matchKind) matchKind = sales.matchKind;
        if (sales.vehicle && !vehicleObj.brand) vehicleObj = sales.vehicle;
      }
    } catch {
      /* ignore */
    }

    let customerName: string | null = null;
    let createdAt = new Date(row.saved_at).toISOString();
    let updatedAt = new Date(row.updated_at).toISOString();
    let recommendedReference = row.last_reference;
    let timeline: ConversationTimelineMessageDto[] = [];

    try {
      const conv = JSON.parse(row.conversation_json || '{}') as {
        createdAt?: string;
        updatedAt?: string;
        messages?: Array<{
          id?: string;
          role?: string;
          content?: string;
          createdAt?: string;
          metadata?: { customerName?: string };
        }>;
        context?: {
          vehicle?: { brand?: string; model?: string; year?: string };
          lastRecommendedReference?: string;
          salesFlow?: { matchKind?: string; state?: string; leadScore?: number };
        };
      };

      if (conv.createdAt) createdAt = new Date(conv.createdAt).toISOString();
      if (conv.updatedAt) updatedAt = new Date(conv.updatedAt).toISOString();
      if (!vehicleObj.brand && conv.context?.vehicle) {
        vehicleObj = conv.context.vehicle;
      }
      if (!recommendedReference && conv.context?.lastRecommendedReference) {
        recommendedReference = conv.context.lastRecommendedReference;
      }
      if (!matchKind && conv.context?.salesFlow?.matchKind) {
        matchKind = conv.context.salesFlow.matchKind;
      }
      if (conv.context?.salesFlow?.state) {
        salesFlowState = conv.context.salesFlow.state;
      }
      if (
        typeof conv.context?.salesFlow?.leadScore === 'number' &&
        leadScore == null
      ) {
        leadScore = conv.context.salesFlow.leadScore;
      }

      const named = conv.messages?.find((m) => m.metadata?.customerName)?.metadata
        ?.customerName;
      if (named?.trim()) customerName = named.trim();

      timeline = (conv.messages ?? [])
        .map((m, index): ConversationTimelineMessageDto | null => {
          if (!m.content?.trim()) return null;
          const role = (m.role ?? '').toLowerCase();
          const sender =
            role === 'customer' ? 'customer' : ('bot' as const);
          const ts = m.createdAt
            ? new Date(m.createdAt).toISOString()
            : updatedAt;
          return {
            id: m.id || `msg-${index}`,
            sender,
            text: m.content.trim(),
            timestamp: ts,
          };
        })
        .filter((m): m is ConversationTimelineMessageDto => m !== null)
        .sort(
          (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
        );
    } catch {
      /* ignore */
    }

    if (timeline.length === 0) {
      timeline = this.learningTimeline(row.conversation_id, row.wa_id);
    }

    return {
      id: row.conversation_id,
      customerName,
      waId: row.wa_id,
      vehicle: [vehicleObj.brand, vehicleObj.model].filter(Boolean).join(' ') || null,
      year: vehicleObj.year?.trim() || null,
      recommendedReference,
      matchKind,
      leadScore: leadScore ?? null,
      salesFlowState,
      createdAt,
      updatedAt,
      timeline,
    };
  }

  private fromLearningOnly(conversationId: string): ConversationDetailDto | null {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM learning_events
        WHERE tenant_id = ?
          AND conversation_id = ?
        ORDER BY timestamp ASC
      `,
      )
      .all(this.tenant(), conversationId) as Array<{
      id: string;
      conversation_id: string;
      wa_id: string;
      brand: string | null;
      model: string | null;
      year: string | null;
      reference: string | null;
      match_kind: string | null;
      sales_state: string | null;
      question: string | null;
      technical_question: string | null;
      timestamp: number;
    }>;

    if (rows.length === 0) return null;

    const first = rows[0]!;
    const last = rows[rows.length - 1]!;
    const withVehicle = [...rows].reverse().find((r) => r.brand || r.model);
    const withRef = [...rows].reverse().find((r) => r.reference);
    const withMatch = [...rows].reverse().find((r) => r.match_kind);
    const withState = [...rows].reverse().find((r) => r.sales_state);

    const timeline: ConversationTimelineMessageDto[] = rows
      .filter((r) => r.question || r.technical_question)
      .map((r) => ({
        id: r.id,
        sender: 'customer' as const,
        text: (r.technical_question || r.question || '').trim(),
        timestamp: new Date(r.timestamp).toISOString(),
      }));

    return {
      id: conversationId,
      customerName: null,
      waId: first.wa_id,
      vehicle:
        [withVehicle?.brand, withVehicle?.model].filter(Boolean).join(' ') ||
        null,
      year: withVehicle?.year ?? null,
      recommendedReference: withRef?.reference ?? null,
      matchKind: withMatch?.match_kind ?? null,
      leadScore: null,
      salesFlowState: withState?.sales_state ?? 'UNKNOWN',
      createdAt: new Date(first.timestamp).toISOString(),
      updatedAt: new Date(last.timestamp).toISOString(),
      timeline,
    };
  }

  private learningTimeline(
    conversationId: string,
    _waId: string,
  ): ConversationTimelineMessageDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, question, technical_question, timestamp
        FROM learning_events
        WHERE tenant_id = ?
          AND conversation_id = ?
          AND (question IS NOT NULL OR technical_question IS NOT NULL)
        ORDER BY timestamp ASC
      `,
      )
      .all(this.tenant(), conversationId) as Array<{
      id: string;
      question: string | null;
      technical_question: string | null;
      timestamp: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      sender: 'customer' as const,
      text: (r.technical_question || r.question || '').trim(),
      timestamp: new Date(r.timestamp).toISOString(),
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
