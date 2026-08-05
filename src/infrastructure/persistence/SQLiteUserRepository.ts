import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  CreateUserInput,
  UserRepository,
} from '../../domain/auth/UserRepository';
import type { UserRecord, UserRole } from '../../domain/auth/userDto';

/**
 * Usuarios SaaS en SQLite (scoped por tenant_id).
 */
export class SQLiteUserRepository implements UserRepository {
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

  findByEmail(email: string): UserRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1`,
      )
      .get(email.trim()) as UserRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  findById(id: string): UserRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .get(id) as UserRow | undefined;
    return row ? rowToRecord(row) : null;
  }

  create(input: CreateUserInput): UserRecord {
    const id = input.id ?? randomUUID();
    const createdAt = this.now();
    const active = input.active === false ? 0 : 1;
    this.db
      .prepare(
        `
        INSERT INTO users (
          id, tenant_id, email, name, role, password_hash, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        input.tenantId,
        input.email.trim().toLowerCase(),
        input.name.trim(),
        input.role,
        input.passwordHash,
        active,
        createdAt,
      );
    return this.findById(id)!;
  }

  ensureSeedAdmin(input: {
    tenantId: string;
    email: string;
    name: string;
    passwordHash: string;
  }): UserRecord {
    const existing = this.findByEmail(input.email);
    if (existing) return existing;
    return this.create({
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      role: 'ADMIN',
      passwordHash: input.passwordHash,
      active: true,
    });
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        tenant_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
  }
}

interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
  active: number;
  created_at: number;
}

function rowToRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    active: row.active === 1,
    createdAt: new Date(row.created_at).toISOString(),
    passwordHash: row.password_hash,
  };
}
