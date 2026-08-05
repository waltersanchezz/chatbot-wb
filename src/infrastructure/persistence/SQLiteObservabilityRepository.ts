import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { ObservabilityRepository } from '../../domain/dashboard/ObservabilityRepository';
import type {
  AuditLogCreateInput,
  AuditLogDto,
  AuditLogFilters,
  HealthCheckDto,
  MetricCreateInput,
  MetricDto,
  MetricFilters,
  ObservabilityHealthStatus,
  ObservabilityLogLevel,
  SystemLogCreateInput,
  SystemLogDto,
  SystemLogFilters,
} from '../../domain/dashboard/observabilityDto';
import {
  isObservabilityHealthStatus,
  isObservabilityLogLevel,
} from '../../domain/dashboard/observabilityDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

interface SystemLogRow {
  id: string;
  tenant_id: string;
  level: string;
  module: string;
  event: string;
  message: string;
  metadata_json: string;
  created_at: number;
}

interface AuditRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  resource: string;
  resource_id: string | null;
  old_value_json: string | null;
  new_value_json: string | null;
  created_at: number;
}

interface HealthRow {
  id: string;
  component: string;
  status: string;
  latency_ms: number;
  details_json: string;
  checked_at: number;
}

interface MetricRow {
  id: string;
  tenant_id: string;
  metric: string;
  value: number;
  unit: string;
  recorded_at: number;
}

/**
 * Persistencia Observability — logs, auditoría, health y métricas.
 * health_checks es global por componente (última lectura); logs/audit/metrics por tenant.
 */
export class SQLiteObservabilityRepository implements ObservabilityRepository {
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
      CREATE TABLE IF NOT EXISTS system_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        level TEXT NOT NULL,
        module TEXT NOT NULL,
        event TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_system_logs_tenant
        ON system_logs(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_system_logs_level
        ON system_logs(tenant_id, level);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        resource TEXT NOT NULL,
        resource_id TEXT,
        old_value_json TEXT,
        new_value_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant
        ON audit_logs(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS health_checks (
        id TEXT PRIMARY KEY,
        component TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        checked_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS metrics (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL DEFAULT 'count',
        recorded_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_metrics_tenant
        ON metrics(tenant_id, recorded_at DESC);
      CREATE INDEX IF NOT EXISTS idx_metrics_name
        ON metrics(tenant_id, metric, recorded_at DESC);
    `);
  }

  appendSystemLog(input: SystemLogCreateInput): SystemLogDto {
    const id = this.idFactory();
    const now = this.now();
    const level = isObservabilityLogLevel(String(input.level))
      ? input.level
      : 'info';
    this.db
      .prepare(
        `
        INSERT INTO system_logs (
          id, tenant_id, level, module, event, message, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        this.tenant(),
        level,
        input.module,
        input.event,
        input.message,
        JSON.stringify(input.metadata ?? {}),
        now,
      );
    return {
      id,
      tenantId: this.tenant(),
      level: level as ObservabilityLogLevel,
      module: input.module,
      event: input.event,
      message: input.message,
      metadata: input.metadata ?? {},
      createdAt: new Date(now).toISOString(),
    };
  }

  listSystemLogs(filters: SystemLogFilters = {}): SystemLogDto[] {
    const limit = clampLimit(filters.limit);
    const rows = this.db
      .prepare(
        `
        SELECT * FROM system_logs
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), Math.max(limit * 4, 200)) as unknown as SystemLogRow[];

    return rows
      .map(rowToSystemLog)
      .filter((row) => matchesSystemFilters(row, filters))
      .slice(0, limit);
  }

  countSystemLogs(filters: SystemLogFilters = {}): number {
    return this.listSystemLogs({ ...filters, limit: 500 }).length;
  }

  appendAuditLog(input: AuditLogCreateInput): AuditLogDto {
    const id = this.idFactory();
    const now = this.now();
    const tenantId = this.tenant();
    this.db
      .prepare(
        `
        INSERT INTO audit_logs (
          id, tenant_id, user_id, action, resource, resource_id,
          old_value_json, new_value_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        input.userId ?? null,
        input.action,
        input.resource,
        input.resourceId ?? null,
        input.oldValue ? JSON.stringify(input.oldValue) : null,
        input.newValue ? JSON.stringify(input.newValue) : null,
        now,
      );
    return {
      id,
      tenantId,
      userId: input.userId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      createdAt: new Date(now).toISOString(),
    };
  }

  listAuditLogs(filters: AuditLogFilters = {}): AuditLogDto[] {
    const limit = clampLimit(filters.limit);
    const rows = this.db
      .prepare(
        `
        SELECT * FROM audit_logs
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), Math.max(limit * 4, 200)) as unknown as AuditRow[];

    return rows
      .map(rowToAudit)
      .filter((row) => matchesAuditFilters(row, filters))
      .slice(0, limit);
  }

  countAuditLogs(filters: AuditLogFilters = {}): number {
    return this.listAuditLogs({ ...filters, limit: 500 }).length;
  }

  upsertHealthCheck(input: {
    component: string;
    status: ObservabilityHealthStatus;
    latencyMs: number;
    details?: Record<string, unknown>;
  }): HealthCheckDto {
    const now = this.now();
    const existing = this.db
      .prepare(`SELECT id FROM health_checks WHERE component = ?`)
      .get(input.component) as { id: string } | undefined;
    const id = existing?.id ?? this.idFactory();
    this.db
      .prepare(
        `
        INSERT INTO health_checks (
          id, component, status, latency_ms, details_json, checked_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(component) DO UPDATE SET
          status = excluded.status,
          latency_ms = excluded.latency_ms,
          details_json = excluded.details_json,
          checked_at = excluded.checked_at
      `,
      )
      .run(
        id,
        input.component,
        input.status,
        input.latencyMs,
        JSON.stringify(input.details ?? {}),
        now,
      );
    return {
      id,
      component: input.component,
      status: input.status,
      latencyMs: input.latencyMs,
      details: input.details ?? {},
      checkedAt: new Date(now).toISOString(),
    };
  }

  listHealthChecks(): HealthCheckDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM health_checks
        ORDER BY component ASC
      `,
      )
      .all() as unknown as HealthRow[];
    return rows.map(rowToHealth);
  }

  getLatestHealthByComponent(): HealthCheckDto[] {
    return this.listHealthChecks();
  }

  recordMetric(input: MetricCreateInput): MetricDto {
    const id = this.idFactory();
    const now = this.now();
    const tenantId = this.tenant();
    const unit = input.unit?.trim() || 'count';
    this.db
      .prepare(
        `
        INSERT INTO metrics (id, tenant_id, metric, value, unit, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(id, tenantId, input.metric, input.value, unit, now);
    return {
      id,
      tenantId,
      metric: input.metric,
      value: input.value,
      unit,
      recordedAt: new Date(now).toISOString(),
    };
  }

  listMetrics(filters: MetricFilters = {}): MetricDto[] {
    const limit = clampLimit(filters.limit);
    const rows = this.db
      .prepare(
        `
        SELECT * FROM metrics
        WHERE tenant_id = ?
        ORDER BY recorded_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), Math.max(limit * 4, 200)) as unknown as MetricRow[];

    return rows
      .map(rowToMetric)
      .filter((row) => matchesMetricFilters(row, filters))
      .slice(0, limit);
  }

  latestMetricsByName(): MetricDto[] {
    const all = this.listMetrics({ limit: 200 });
    const map = new Map<string, MetricDto>();
    for (const m of all) {
      if (!map.has(m.metric)) map.set(m.metric, m);
    }
    return [...map.values()];
  }

  countMetrics(filters: MetricFilters = {}): number {
    return this.listMetrics({ ...filters, limit: 500 }).length;
  }

  ping(): { ok: boolean; latencyMs: number } {
    const started = Date.now();
    try {
      this.db.prepare('SELECT 1 AS ok').get();
      return { ok: true, latencyMs: Math.max(0, Date.now() - started) };
    } catch {
      return { ok: false, latencyMs: Math.max(0, Date.now() - started) };
    }
  }
}

function clampLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(1, Number(limit)), 200);
}

function parseJsonObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function rowToSystemLog(row: SystemLogRow): SystemLogDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    level: (isObservabilityLogLevel(row.level) ? row.level : 'info') as ObservabilityLogLevel,
    module: row.module,
    event: row.event,
    message: row.message,
    metadata: parseJsonObject(row.metadata_json) ?? {},
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToAudit(row: AuditRow): AuditLogDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    action: row.action,
    resource: row.resource,
    resourceId: row.resource_id,
    oldValue: parseJsonObject(row.old_value_json),
    newValue: parseJsonObject(row.new_value_json),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToHealth(row: HealthRow): HealthCheckDto {
  return {
    id: row.id,
    component: row.component,
    status: (isObservabilityHealthStatus(row.status)
      ? row.status
      : 'ERROR') as ObservabilityHealthStatus,
    latencyMs: row.latency_ms,
    details: parseJsonObject(row.details_json) ?? {},
    checkedAt: new Date(row.checked_at).toISOString(),
  };
}

function rowToMetric(row: MetricRow): MetricDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    metric: row.metric,
    value: row.value,
    unit: row.unit,
    recordedAt: new Date(row.recorded_at).toISOString(),
  };
}

function inDateRange(
  iso: string,
  from?: string,
  to?: string,
): boolean {
  const t = Date.parse(iso);
  if (from) {
    const f = Date.parse(from);
    if (Number.isFinite(f) && t < f) return false;
  }
  if (to) {
    const end = Date.parse(to);
    if (Number.isFinite(end) && t > end) return false;
  }
  return true;
}

function matchesSystemFilters(
  row: SystemLogDto,
  filters: SystemLogFilters,
): boolean {
  if (filters.level && row.level !== filters.level) return false;
  if (filters.module && row.module !== filters.module) return false;
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    const hay = `${row.message} ${row.event} ${row.module}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return inDateRange(row.createdAt, filters.from, filters.to);
}

function matchesAuditFilters(
  row: AuditLogDto,
  filters: AuditLogFilters,
): boolean {
  if (filters.userId && row.userId !== filters.userId) return false;
  if (filters.action && row.action !== filters.action) return false;
  if (filters.resource && row.resource !== filters.resource) return false;
  return inDateRange(row.createdAt, filters.from, filters.to);
}

function matchesMetricFilters(
  row: MetricDto,
  filters: MetricFilters,
): boolean {
  if (filters.metric && row.metric !== filters.metric) return false;
  return inDateRange(row.recordedAt, filters.from, filters.to);
}
