import { DatabaseSync } from 'node:sqlite';
import type { TenantDto } from '../../domain/tenant/tenantDto';
import { DEFAULT_TENANT_ID } from '../../domain/tenant/tenantDto';
import type { TenantRepository } from '../../domain/tenant/TenantRepository';

/**
 * Catálogo de tenants en SQLite (mismo archivo de producto).
 */
export class SQLiteTenantRepository implements TenantRepository {
  private readonly db: DatabaseSync;
  private readonly now: () => number;

  constructor(
    databasePath: string = ':memory:',
    options: { now?: () => number } = {},
  ) {
    this.now = options.now ?? (() => Date.now());
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

  ensureDefault(
    tenantId: string = DEFAULT_TENANT_ID,
    name: string = 'Rodacenter',
  ): TenantDto {
    const now = this.now();
    this.db
      .prepare(
        `
        INSERT INTO tenants (id, name, active, created_at)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          active = 1
      `,
      )
      .run(tenantId, name, now);

    return this.findById(tenantId)!;
  }

  findById(id: string): TenantDto | null {
    const row = this.db
      .prepare(`SELECT * FROM tenants WHERE id = ?`)
      .get(id) as TenantRow | undefined;
    return row ? rowToDto(row) : null;
  }

  listActive(): TenantDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM tenants
        WHERE active = 1
        ORDER BY id ASC
      `,
      )
      .all() as unknown as TenantRow[];
    return rows.map(rowToDto);
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
    `);
  }
}

interface TenantRow {
  id: string;
  name: string;
  active: number;
  created_at: number;
}

function rowToDto(row: TenantRow): TenantDto {
  return {
    id: row.id,
    name: row.name,
    active: row.active === 1,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
