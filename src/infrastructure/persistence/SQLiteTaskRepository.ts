import { DatabaseSync } from 'node:sqlite';
import type {
  TaskDto,
  TaskPriority,
  TasksDto,
  TaskType,
} from '../../domain/dashboard/taskDto';
import type { TaskRepository } from '../../domain/dashboard/TaskRepository';
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

interface Candidate {
  conversationId: string;
  waId: string;
  cliente: string | null;
  vehiculo: string | null;
  referencia: string | null;
  leadScore: number | null;
  estado: string;
  updatedAt: number;
  abandoned: boolean;
}

const HIGH_LEAD_SCORE = 80;
const ABANDONED_IDLE_MS = 24 * 60 * 60 * 1000;
const FOLLOW_UP_IDLE_MS = 2 * 60 * 60 * 1000;

const PRIORITY_RANK: Record<TaskPriority, number> = {
  Alta: 0,
  Media: 1,
  Baja: 2,
};

/**
 * Centro de tareas desde SQLite (persisted_sessions + learning_events).
 * No modifica PersistenceRepository ni motores del chatbot.
 */
export class SQLiteTaskRepository implements TaskRepository {
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

  getTasks(): TasksDto {
    const now = this.now();
    const candidates = this.loadCandidates();
    const tasks: TaskDto[] = [];

    for (const c of candidates) {
      const match = classifyTask(c, now);
      if (!match) continue;
      tasks.push({
        id: `${slugType(match.tipo)}:${c.conversationId}`,
        tipo: match.tipo,
        prioridad: match.prioridad,
        cliente: c.cliente,
        waId: c.waId,
        vehiculo: c.vehiculo,
        referencia: c.referencia,
        leadScore: c.leadScore,
        estado: c.estado,
        tiempoDesdeUltimaActividad: formatElapsed(now - c.updatedAt),
        ultimaActividad: new Date(c.updatedAt).toISOString(),
      });
    }

    tasks.sort((a, b) => {
      const pr = PRIORITY_RANK[a.prioridad] - PRIORITY_RANK[b.prioridad];
      if (pr !== 0) return pr;
      return Date.parse(a.ultimaActividad) - Date.parse(b.ultimaActividad);
    });

    const byPriority = { Alta: 0, Media: 0, Baja: 0 };
    for (const t of tasks) byPriority[t.prioridad] += 1;

    return {
      tasks,
      total: tasks.length,
      byPriority,
      generatedAt: new Date(now).toISOString(),
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
    abandoned?: number;
    timestamp: number;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO learning_events (
          id, tenant_id, conversation_id, wa_id, brand, model, year, reference, match_kind,
          intent, question, technical_question, accepted, abandoned,
          duration_ms, timestamp, sales_state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, 0, ?, ?)
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
        input.abandoned ?? 0,
        input.timestamp,
        input.salesState ?? null,
      );
  }

  close(): void {
    this.db.close();
  }

  private loadCandidates(): Candidate[] {
    const byId = new Map<string, Candidate>();
    const abandonedIds = this.loadAbandonedConversationIds();
    const tenantId = this.tenant();

    const sessions = this.db
      .prepare(`SELECT * FROM persisted_sessions WHERE tenant_id = ?`)
      .all(tenantId) as unknown as SessionRow[];

    for (const row of sessions) {
      const c = sessionToCandidate(row);
      c.abandoned = abandonedIds.has(c.conversationId);
      byId.set(c.conversationId, c);
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
          MAX(sales_state) AS sales_state,
          MAX(abandoned) AS abandoned
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
      abandoned: number;
    }>;

    for (const row of learning) {
      if (byId.has(row.conversation_id)) continue;
      const base = [row.brand, row.model].filter(Boolean).join(' ');
      byId.set(row.conversation_id, {
        conversationId: row.conversation_id,
        waId: row.wa_id,
        cliente: null,
        vehiculo: base
          ? row.year
            ? `${base} ${row.year}`
            : base
          : null,
        referencia: row.reference,
        leadScore: null,
        estado: row.sales_state ?? 'NEW',
        updatedAt: row.last_ts,
        abandoned: row.abandoned === 1 || abandonedIds.has(row.conversation_id),
      });
    }

    return [...byId.values()];
  }

  private loadAbandonedConversationIds(): Set<string> {
    const rows = this.db
      .prepare(
        `
        SELECT DISTINCT conversation_id
        FROM learning_events
        WHERE tenant_id = ?
          AND abandoned = 1
      `,
      )
      .all(this.tenant()) as Array<{ conversation_id: string }>;
    return new Set(rows.map((r) => r.conversation_id));
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

/** Una tarea por conversación; regla de mayor prioridad gana. */
export function classifyTask(
  c: Candidate,
  now: number,
): { tipo: TaskType; prioridad: TaskPriority } | null {
  const estado = normalizeState(c.estado);
  if (estado === 'CLOSED') return null;

  const idleMs = now - c.updatedAt;

  if (estado === 'READY_FOR_ADVISOR') {
    return { tipo: 'Cliente listo para asesor', prioridad: 'Alta' };
  }

  if (estado === 'WAITING_CONFIRMATION') {
    return { tipo: 'Cliente esperando respuesta', prioridad: 'Alta' };
  }

  if (c.leadScore != null && c.leadScore >= HIGH_LEAD_SCORE) {
    return { tipo: 'Cliente con lead alto', prioridad: 'Alta' };
  }

  if (c.abandoned || idleMs >= ABANDONED_IDLE_MS) {
    return { tipo: 'Conversación abandonada', prioridad: 'Media' };
  }

  if (estado === 'RECOMMENDATION_READY' || idleMs >= FOLLOW_UP_IDLE_MS) {
    return {
      tipo: 'Seguimiento recomendado',
      prioridad: estado === 'RECOMMENDATION_READY' ? 'Media' : 'Baja',
    };
  }

  return null;
}

function normalizeState(state: string): string {
  const s = (state || '').toUpperCase();
  if (s === 'IDENTIFYING_VEHICLE') return 'IDENTIFYING';
  return s;
}

function sessionToCandidate(row: SessionRow): Candidate {
  let vehicleObj: { brand?: string; model?: string; year?: string } = {};
  try {
    vehicleObj = JSON.parse(row.last_vehicle_json || '{}') as typeof vehicleObj;
  } catch {
    vehicleObj = {};
  }

  let estado = row.state;
  let leadScore = row.lead_score;
  try {
    if (row.sales_flow_json) {
      const sales = JSON.parse(row.sales_flow_json) as {
        state?: string;
        leadScore?: number;
        vehicle?: { brand?: string; model?: string; year?: string };
      };
      if (sales.state) estado = sales.state;
      if (typeof sales.leadScore === 'number') leadScore = sales.leadScore;
      if (sales.vehicle && !vehicleObj.brand) vehicleObj = sales.vehicle;
    }
  } catch {
    /* ignore */
  }

  let cliente: string | null = null;
  try {
    const conv = JSON.parse(row.conversation_json || '{}') as {
      messages?: Array<{ metadata?: { customerName?: string } }>;
      context?: { vehicle?: { brand?: string; model?: string; year?: string } };
    };
    const named = conv.messages?.find((m) => m.metadata?.customerName)?.metadata
      ?.customerName;
    if (named?.trim()) cliente = named.trim();
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
    conversationId: row.conversation_id,
    waId: row.wa_id,
    cliente,
    vehiculo,
    referencia: row.last_reference,
    leadScore: leadScore ?? null,
    estado,
    updatedAt: row.updated_at,
    abandoned: false,
  };
}

function slugType(tipo: TaskType): string {
  switch (tipo) {
    case 'Cliente esperando respuesta':
      return 'waiting';
    case 'Cliente listo para asesor':
      return 'advisor';
    case 'Cliente con lead alto':
      return 'high-lead';
    case 'Conversación abandonada':
      return 'abandoned';
    case 'Seguimiento recomendado':
      return 'follow-up';
  }
}

export function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'hace instantes';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}
