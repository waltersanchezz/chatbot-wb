import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { ConnectorRepository } from '../../domain/dashboard/ConnectorRepository';
import type {
  ConnectorCreateInput,
  ConnectorDto,
  ConnectorHealthStatus,
  ConnectorListFilters,
  ConnectorLogCreateInput,
  ConnectorLogDto,
  ConnectorProviderId,
  ConnectorCategory,
  ConnectorUpdateInput,
} from '../../domain/dashboard/connectorDto';
import {
  defaultCategoryForProvider,
  isConnectorCategory,
  isConnectorHealthStatus,
  isConnectorProviderId,
} from '../../domain/dashboard/connectorDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

interface ConnectorRow {
  id: string;
  tenant_id: string;
  provider: string;
  name: string;
  category: string;
  enabled: number;
  config_json: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface LogRow {
  id: string;
  tenant_id: string;
  connector_id: string;
  event: string;
  status: string;
  message: string;
  created_at: number;
}

/**
 * Persistencia Integration Hub — conectores y logs por tenant.
 */
export class SQLiteConnectorRepository implements ConnectorRepository {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly fixedTenantId?: string;
  private readonly idFactory: () => string;

  constructor(
    databasePath: string = ':memory:',
    options: {
      now?: () => number;
      idFactory?: () => string;
    } & TenantScopedOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.fixedTenantId = options.tenantId;
    this.idFactory = options.idFactory ?? (() => randomUUID());
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

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connectors (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        config_json TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'PENDING',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_connectors_tenant
        ON connectors(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_connectors_tenant_provider
        ON connectors(tenant_id, provider);

      CREATE TABLE IF NOT EXISTS connector_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        connector_id TEXT NOT NULL,
        event TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_connector_logs_tenant
        ON connector_logs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_connector_logs_connector
        ON connector_logs(tenant_id, connector_id, created_at DESC);
    `);
  }

  list(filters: ConnectorListFilters = {}): ConnectorDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM connectors
        WHERE tenant_id = ?
        ORDER BY created_at DESC
      `,
      )
      .all(this.tenant()) as unknown as ConnectorRow[];

    let items = rows.map(rowToConnector);

    if (filters.category?.trim()) {
      const cat = filters.category.trim();
      items = items.filter((c) => c.category === cat);
    }
    if (filters.provider?.trim()) {
      const p = filters.provider.trim();
      items = items.filter((c) => c.provider === p);
    }
    if (filters.status?.trim()) {
      const s = filters.status.trim();
      items = items.filter((c) => c.status === s);
    }
    if (typeof filters.enabled === 'boolean') {
      items = items.filter((c) => c.enabled === filters.enabled);
    }
    if (filters.q?.trim()) {
      const q = normalize(filters.q);
      items = items.filter(
        (c) =>
          normalize(c.name).includes(q) ||
          normalize(c.provider).includes(q) ||
          normalize(c.category).includes(q),
      );
    }
    return items;
  }

  getById(id: string): ConnectorDto | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM connectors
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .get(id, this.tenant()) as ConnectorRow | undefined;
    return row ? rowToConnector(row) : null;
  }

  create(input: ConnectorCreateInput): ConnectorDto {
    const id = this.idFactory();
    const now = this.now();
    const tenantId = this.tenant();
    const provider = String(input.provider);
    const category =
      input.category && isConnectorCategory(input.category)
        ? input.category
        : defaultCategoryForProvider(provider);
    const status =
      input.status && isConnectorHealthStatus(input.status)
        ? input.status
        : 'PENDING';
    const enabled = input.enabled !== false ? 1 : 0;
    const config = JSON.stringify(input.config ?? {});

    this.db
      .prepare(
        `
        INSERT INTO connectors (
          id, tenant_id, provider, name, category, enabled,
          config_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        provider,
        input.name.trim(),
        category,
        enabled,
        config,
        status,
        now,
        now,
      );
    return this.getById(id)!;
  }

  update(id: string, input: ConnectorUpdateInput): ConnectorDto | null {
    const existing = this.getById(id);
    if (!existing) return null;
    const now = this.now();
    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const category =
      input.category !== undefined && isConnectorCategory(input.category)
        ? input.category
        : existing.category;
    const enabled =
      input.enabled !== undefined ? (input.enabled ? 1 : 0) : existing.enabled ? 1 : 0;
    const config =
      input.config !== undefined
        ? JSON.stringify(input.config)
        : JSON.stringify(existing.config);
    const status =
      input.status !== undefined && isConnectorHealthStatus(input.status)
        ? input.status
        : existing.status;

    this.db
      .prepare(
        `
        UPDATE connectors
        SET name = ?, category = ?, enabled = ?, config_json = ?,
            status = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(name, category, enabled, config, status, now, id, this.tenant());
    return this.getById(id);
  }

  delete(id: string): boolean {
    this.db
      .prepare(
        `
        DELETE FROM connector_logs
        WHERE connector_id = ? AND tenant_id = ?
      `,
      )
      .run(id, this.tenant());
    const result = this.db
      .prepare(
        `
        DELETE FROM connectors
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(id, this.tenant());
    return Number(result.changes) > 0;
  }

  appendLog(input: ConnectorLogCreateInput): ConnectorLogDto {
    const id = this.idFactory();
    const now = this.now();
    const tenantId = this.tenant();
    this.db
      .prepare(
        `
        INSERT INTO connector_logs (
          id, tenant_id, connector_id, event, status, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        input.connectorId,
        input.event,
        input.status,
        input.message,
        now,
      );
    return {
      id,
      tenantId,
      connectorId: input.connectorId,
      event: input.event,
      status: input.status,
      message: input.message,
      createdAt: new Date(now).toISOString(),
    };
  }

  listLogs(options: { connectorId?: string; limit?: number } = {}): ConnectorLogDto[] {
    const safe = Math.min(Math.max(1, options.limit ?? 50), 200);
    if (options.connectorId?.trim()) {
      const rows = this.db
        .prepare(
          `
          SELECT * FROM connector_logs
          WHERE tenant_id = ? AND connector_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `,
        )
        .all(this.tenant(), options.connectorId.trim(), safe) as unknown as LogRow[];
      return rows.map(rowToLog);
    }
    const rows = this.db
      .prepare(
        `
        SELECT * FROM connector_logs
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), safe) as unknown as LogRow[];
    return rows.map(rowToLog);
  }
}

function rowToConnector(row: ConnectorRow): ConnectorDto {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(row.config_json) as Record<string, unknown>;
  } catch {
    config = {};
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: (isConnectorProviderId(row.provider)
      ? row.provider
      : row.provider) as ConnectorProviderId,
    name: row.name,
    category: (isConnectorCategory(row.category)
      ? row.category
      : 'Other') as ConnectorCategory,
    enabled: row.enabled === 1,
    config,
    status: (isConnectorHealthStatus(row.status)
      ? row.status
      : 'PENDING') as ConnectorHealthStatus,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToLog(row: LogRow): ConnectorLogDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    connectorId: row.connector_id,
    event: row.event,
    status: row.status,
    message: row.message,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
