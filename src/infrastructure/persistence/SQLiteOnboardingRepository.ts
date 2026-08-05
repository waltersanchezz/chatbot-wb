import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { OnboardingRepository } from '../../domain/dashboard/OnboardingRepository';
import type {
  InstallationEventDto,
  OnboardingStatusDto,
} from '../../domain/dashboard/onboardingDto';
import {
  ONBOARDING_TOTAL_STEPS,
  ONBOARDING_VERSION,
} from '../../domain/dashboard/onboardingDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * tenant_installation + eventos — scoped por tenant_id.
 */
export class SQLiteOnboardingRepository implements OnboardingRepository {
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

  getStatus(): OnboardingStatusDto {
    const row = this.ensureRow();
    return rowToStatus(row);
  }

  setStep(step: number): OnboardingStatusDto {
    const tenantId = this.tenant();
    const clamped = Math.min(
      ONBOARDING_TOTAL_STEPS,
      Math.max(1, Math.floor(step)),
    );
    const now = this.now();
    this.ensureRow();
    this.db
      .prepare(
        `
        UPDATE tenant_installation
        SET current_step = ?, updated_at = ?
        WHERE tenant_id = ? AND completed = 0
      `,
      )
      .run(clamped, now, tenantId);
    return this.getStatus();
  }

  markCompleted(version: string): OnboardingStatusDto {
    const tenantId = this.tenant();
    const now = this.now();
    this.ensureRow();
    this.db
      .prepare(
        `
        UPDATE tenant_installation
        SET completed = 1,
            completed_at = ?,
            version = ?,
            current_step = ?,
            updated_at = ?
        WHERE tenant_id = ?
      `,
      )
      .run(now, version || ONBOARDING_VERSION, ONBOARDING_TOTAL_STEPS, now, tenantId);
    return this.getStatus();
  }

  recordEvent(
    eventType: string,
    payload?: Record<string, unknown>,
  ): InstallationEventDto {
    const id = randomUUID();
    const tenantId = this.tenant();
    const createdAt = this.now();
    this.db
      .prepare(
        `
        INSERT INTO tenant_installation_events (
          id, tenant_id, event_type, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        eventType,
        payload ? JSON.stringify(payload) : null,
        createdAt,
      );
    return {
      id,
      tenantId,
      eventType,
      createdAt: new Date(createdAt).toISOString(),
    };
  }

  listEvents(): InstallationEventDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM tenant_installation_events
        WHERE tenant_id = ?
        ORDER BY created_at ASC
      `,
      )
      .all(this.tenant()) as unknown as EventRow[];
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      eventType: r.event_type,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  close(): void {
    this.db.close();
  }

  private ensureRow(): InstallRow {
    const tenantId = this.tenant();
    const existing = this.db
      .prepare(`SELECT * FROM tenant_installation WHERE tenant_id = ?`)
      .get(tenantId) as unknown as InstallRow | undefined;
    if (existing) return existing;

    const now = this.now();
    this.db
      .prepare(
        `
        INSERT INTO tenant_installation (
          tenant_id, completed, completed_at, version, current_step, created_at, updated_at
        ) VALUES (?, 0, NULL, NULL, 1, ?, ?)
      `,
      )
      .run(tenantId, now, now);

    return this.db
      .prepare(`SELECT * FROM tenant_installation WHERE tenant_id = ?`)
      .get(tenantId) as unknown as InstallRow;
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_installation (
        tenant_id TEXT PRIMARY KEY NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        completed_at INTEGER,
        version TEXT,
        current_step INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tenant_installation_events (
        id TEXT PRIMARY KEY NOT NULL,
        tenant_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_install_events_tenant
        ON tenant_installation_events(tenant_id);
    `);
  }
}

interface InstallRow {
  tenant_id: string;
  completed: number;
  completed_at: number | null;
  version: string | null;
  current_step: number;
  created_at: number;
  updated_at: number;
}

interface EventRow {
  id: string;
  tenant_id: string;
  event_type: string;
  payload_json: string | null;
  created_at: number;
}

function rowToStatus(row: InstallRow): OnboardingStatusDto {
  const completed = row.completed === 1;
  const step = completed
    ? ONBOARDING_TOTAL_STEPS
    : Math.min(ONBOARDING_TOTAL_STEPS, Math.max(1, row.current_step || 1));
  const progress = completed
    ? 100
    : Math.round(((step - 1) / ONBOARDING_TOTAL_STEPS) * 100);
  return {
    completed,
    step,
    progress,
    version: row.version,
    completedAt: row.completed_at
      ? new Date(row.completed_at).toISOString()
      : null,
    tenantId: row.tenant_id,
  };
}
