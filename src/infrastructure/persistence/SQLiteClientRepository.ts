import { DatabaseSync } from 'node:sqlite';
import type {
  ClientDetailDto,
  ClientDto,
  ClientListDto,
  ClientListQuery,
  ClientVehicleDto,
} from '../../domain/dashboard/clientDto';
import type { ClientRepository } from '../../domain/dashboard/ClientRepository';
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

interface AggregatedClient {
  waId: string;
  nombre: string | null;
  conversations: Array<{
    id: string;
    state: string;
    leadScore: number | null;
    reference: string | null;
    createdAtMs: number;
    updatedAtMs: number;
    vehicle: ClientVehicleDto | null;
  }>;
}

/**
 * Clientes agregados desde persisted_sessions + learning_events.
 * No modifica PersistenceRepository ni LearningEngine.
 */
export class SQLiteClientRepository implements ClientRepository {
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

  list(query: ClientListQuery = {}): ClientListDto {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 20)));
    const sortBy = query.sortBy ?? 'ultimaActividad';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const q = query.q?.trim() ? query.q.trim().toLowerCase() : null;

    let aggregated = this.loadAllClients();
    if (q) {
      aggregated = aggregated.filter((c) => matchesAggregated(c, q));
    }

    const items = aggregated.map((c) => toClientDto(c));
    items.sort((a, b) => compareClients(a, b, sortBy, sortOrder));

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
    const offset = (page - 1) * pageSize;

    return {
      items: items.slice(offset, offset + pageSize),
      page,
      pageSize,
      total,
      totalPages,
      query: q,
      sortBy,
      sortOrder,
    };
  }

  findById(id: string): ClientDetailDto | null {
    const decoded = decodeURIComponent(id);
    const clients = this.loadAllClients();
    const hit =
      clients.find((c) => c.waId === decoded || c.waId === id) ??
      clients.find((c) => clientKey(c.waId) === decoded || clientKey(c.waId) === id);
    if (!hit) return null;
    return toClientDetailDto(hit);
  }

  /** Helper de pruebas. */
  upsertSession(input: {
    waId: string;
    conversationId: string;
    state: string;
    leadScore?: number | null;
    lastReference?: string | null;
    vehicle?: { brand?: string; model?: string; year?: string };
    customerName?: string | null;
    salesFlowState?: string;
    savedAt: number;
    updatedAt: number;
  }): void {
    const vehicle = input.vehicle ?? {};
    const conversationJson = JSON.stringify({
      id: input.conversationId,
      externalId: input.waId,
      context: {
        vehicle,
        lastRecommendedReference: input.lastReference ?? undefined,
        salesFlow: {
          state: input.salesFlowState ?? input.state,
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
              createdAt: new Date(input.savedAt).toISOString(),
              metadata: { customerName: input.customerName },
            },
          ]
        : [],
      createdAt: new Date(input.savedAt).toISOString(),
      updatedAt: new Date(input.updatedAt).toISOString(),
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
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at
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
          state: input.salesFlowState ?? input.state,
          leadScore: input.leadScore ?? 0,
          vehicle,
        }),
        conversationJson,
        input.savedAt,
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

  private loadAllClients(): AggregatedClient[] {
    const byWa = new Map<string, AggregatedClient>();
    const tenantId = this.tenant();

    const sessions = this.db
      .prepare(`SELECT * FROM persisted_sessions WHERE tenant_id = ?`)
      .all(tenantId) as unknown as SessionRow[];

    for (const row of sessions) {
      const client = ensureClient(byWa, row.wa_id);
      const parsed = parseSession(row);
      if (parsed.nombre && !client.nombre) client.nombre = parsed.nombre;
      // Un persisted_sessions es 1 fila por wa_id; puede sobrescribir conversación.
      const existingIdx = client.conversations.findIndex(
        (c) => c.id === parsed.conversation.id,
      );
      if (existingIdx >= 0) {
        client.conversations[existingIdx] = parsed.conversation;
      } else {
        client.conversations.push(parsed.conversation);
      }
    }

    const learning = this.db
      .prepare(
        `
        SELECT conversation_id, wa_id,
          MIN(timestamp) AS first_ts,
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
      first_ts: number;
      last_ts: number;
      brand: string | null;
      model: string | null;
      year: string | null;
      reference: string | null;
      sales_state: string | null;
    }>;

    for (const row of learning) {
      const client = ensureClient(byWa, row.wa_id);
      if (client.conversations.some((c) => c.id === row.conversation_id)) {
        continue;
      }
      const label = [row.brand, row.model].filter(Boolean).join(' ');
      client.conversations.push({
        id: row.conversation_id,
        state: row.sales_state ?? 'UNKNOWN',
        leadScore: null,
        reference: row.reference,
        createdAtMs: row.first_ts,
        updatedAtMs: row.last_ts,
        vehicle: label
          ? {
              label,
              brand: row.brand,
              model: row.model,
              year: row.year,
            }
          : null,
      });
    }

    return [...byWa.values()];
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

function ensureClient(
  map: Map<string, AggregatedClient>,
  waId: string,
): AggregatedClient {
  let c = map.get(waId);
  if (!c) {
    c = { waId, nombre: null, conversations: [] };
    map.set(waId, c);
  }
  return c;
}

function parseSession(row: SessionRow): {
  nombre: string | null;
  conversation: AggregatedClient['conversations'][number];
} {
  let vehicleObj: { brand?: string; model?: string; year?: string } = {};
  try {
    vehicleObj = JSON.parse(row.last_vehicle_json || '{}') as typeof vehicleObj;
  } catch {
    vehicleObj = {};
  }

  let state = row.state;
  let leadScore = row.lead_score;
  try {
    if (row.sales_flow_json) {
      const sales = JSON.parse(row.sales_flow_json) as {
        state?: string;
        leadScore?: number;
        vehicle?: { brand?: string; model?: string; year?: string };
      };
      if (sales.state) state = sales.state;
      if (typeof sales.leadScore === 'number') leadScore = sales.leadScore;
      if (sales.vehicle && !vehicleObj.brand) vehicleObj = sales.vehicle;
    }
  } catch {
    /* ignore */
  }

  let nombre: string | null = null;
  let createdAtMs = row.saved_at;
  try {
    const conv = JSON.parse(row.conversation_json || '{}') as {
      createdAt?: string;
      messages?: Array<{ metadata?: { customerName?: string } }>;
      context?: { vehicle?: { brand?: string; model?: string; year?: string } };
    };
    if (conv.createdAt) createdAtMs = Date.parse(conv.createdAt) || createdAtMs;
    const named = conv.messages?.find((m) => m.metadata?.customerName)?.metadata
      ?.customerName;
    if (named?.trim()) nombre = named.trim();
    if (!vehicleObj.brand && conv.context?.vehicle) {
      vehicleObj = conv.context.vehicle;
    }
  } catch {
    /* ignore */
  }

  const label = [vehicleObj.brand, vehicleObj.model].filter(Boolean).join(' ');

  return {
    nombre,
    conversation: {
      id: row.conversation_id,
      state,
      leadScore: leadScore ?? null,
      reference: row.last_reference,
      createdAtMs,
      updatedAtMs: row.updated_at,
      vehicle: label
        ? {
            label,
            brand: vehicleObj.brand ?? null,
            model: vehicleObj.model ?? null,
            year: vehicleObj.year ?? null,
          }
        : null,
    },
  };
}

function toClientDto(client: AggregatedClient): ClientDto {
  const convs = [...client.conversations].sort(
    (a, b) => b.updatedAtMs - a.updatedAtMs,
  );
  const first = Math.min(...convs.map((c) => c.createdAtMs));
  const last = Math.max(...convs.map((c) => c.updatedAtMs));
  const scores = convs
    .map((c) => c.leadScore)
    .filter((s): s is number => typeof s === 'number');
  const leadPromedio =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;

  const vehicles = uniqueVehicles(convs.map((c) => c.vehicle).filter(Boolean) as ClientVehicleDto[]);
  const latestVehicle = convs[0]?.vehicle ?? null;
  const ultimoVehiculo = latestVehicle
    ? [latestVehicle.label, latestVehicle.year].filter(Boolean).join(' ')
    : null;

  return {
    id: client.waId,
    nombre: client.nombre,
    waId: client.waId,
    cantidadConversaciones: convs.length,
    primerContacto: new Date(first).toISOString(),
    ultimaActividad: new Date(last).toISOString(),
    cantidadVehiculos: vehicles.length,
    ultimoVehiculo,
    leadPromedio,
    ultimaReferencia: convs[0]?.reference ?? null,
    estadoUltimaConversacion: convs[0]?.state ?? 'UNKNOWN',
  };
}

function toClientDetailDto(client: AggregatedClient): ClientDetailDto {
  const list = toClientDto(client);
  const convs = [...client.conversations].sort(
    (a, b) => b.updatedAtMs - a.updatedAtMs,
  );
  const vehiculos = uniqueVehicles(
    convs.map((c) => c.vehicle).filter(Boolean) as ClientVehicleDto[],
  );
  const refs = uniqueStrings(
    convs.map((c) => c.reference).filter((r): r is string => Boolean(r)),
  );

  return {
    id: client.waId,
    nombre: client.nombre,
    waId: client.waId,
    leadPromedio: list.leadPromedio,
    createdAt: list.primerContacto,
    updatedAt: list.ultimaActividad,
    vehiculos,
    conversaciones: convs.map((c) => ({
      id: c.id,
      salesFlowState: c.state,
      leadScore: c.leadScore,
      recommendedReference: c.reference,
      updatedAt: new Date(c.updatedAtMs).toISOString(),
    })),
    referenciasRecomendadas: refs,
  };
}

function uniqueVehicles(items: ClientVehicleDto[]): ClientVehicleDto[] {
  const seen = new Set<string>();
  const out: ClientVehicleDto[] = [];
  for (const v of items) {
    const key = `${v.brand}|${v.model}|${v.year}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function matchesAggregated(client: AggregatedClient, q: string): boolean {
  const hay = [
    client.waId,
    client.nombre,
    ...client.conversations.flatMap((c) => [
      c.id,
      c.state,
      c.reference,
      c.vehicle?.label,
      c.vehicle?.brand,
      c.vehicle?.model,
      c.vehicle?.year,
      c.leadScore != null ? String(c.leadScore) : '',
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function compareClients(
  a: ClientDto,
  b: ClientDto,
  sortBy: ClientListDto['sortBy'],
  order: 'asc' | 'desc',
): number {
  let av = 0;
  let bv = 0;
  switch (sortBy) {
    case 'primerContacto':
      av = Date.parse(a.primerContacto);
      bv = Date.parse(b.primerContacto);
      break;
    case 'leadPromedio':
      av = a.leadPromedio ?? -1;
      bv = b.leadPromedio ?? -1;
      break;
    case 'cantidadConversaciones':
      av = a.cantidadConversaciones;
      bv = b.cantidadConversaciones;
      break;
    case 'ultimaActividad':
    default:
      av = Date.parse(a.ultimaActividad);
      bv = Date.parse(b.ultimaActividad);
      break;
  }
  return order === 'asc' ? av - bv : bv - av;
}

function clientKey(waId: string): string {
  return waId.replace(/^wa:/i, '');
}
