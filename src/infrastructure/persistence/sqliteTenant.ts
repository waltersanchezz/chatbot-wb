import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_TENANT_ID } from '../../domain/tenant/tenantDto';
import { getActiveTenantId } from '../../domain/tenant/TenantContext';

export { DEFAULT_TENANT_ID };

export interface TenantScopedOptions {
  /**
   * Fija el tenant (tests / DI).
   * Si se omite, usa TenantContext ALS o `rodacenter`.
   */
  tenantId?: string;
}

/**
 * Resuelve tenant activo para acceso SQLite.
 */
export function resolveTenantId(fixed?: string): string {
  if (fixed && fixed.trim()) return fixed.trim();
  return getActiveTenantId();
}

/** Asegura columna tenant_id (migración aditiva, default rodacenter). */
export function ensureTenantIdColumn(
  db: DatabaseSync,
  table: 'persisted_sessions' | 'learning_events',
): void {
  const cols = db
    .prepare(`PRAGMA table_info(${table})`)
    .all() as Array<{ name: string }>;
  if (cols.length === 0) return;
  if (cols.some((c) => c.name === 'tenant_id')) return;

  db.exec(
    `ALTER TABLE ${table} ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${DEFAULT_TENANT_ID}'`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_${table}_tenant ON ${table}(tenant_id)`,
  );
}

export function ensureTenantIndexes(db: DatabaseSync): void {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('persisted_sessions', 'learning_events')`,
    )
    .all() as Array<{ name: string }>;
  const names = new Set(tables.map((t) => t.name));

  // Migrar columnas antes de indexar (DB antiguas sin tenant_id).
  if (names.has('persisted_sessions')) {
    ensureTenantIdColumn(db, 'persisted_sessions');
  }
  if (names.has('learning_events')) {
    ensureTenantIdColumn(db, 'learning_events');
  }

  if (names.has('persisted_sessions')) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_persisted_sessions_tenant
        ON persisted_sessions(tenant_id);
    `);
  }
  if (names.has('learning_events')) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_learning_events_tenant
        ON learning_events(tenant_id);
    `);
  }
}
