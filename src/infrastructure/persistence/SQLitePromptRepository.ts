import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { PromptRepository } from '../../domain/dashboard/PromptRepository';
import type {
  CopilotGeneratedResponse,
  CopilotSessionDto,
  CopilotSessionStatus,
  CopilotTemplateDto,
  CopilotTemplateType,
} from '../../domain/dashboard/copilotDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

interface SessionRow {
  id: string;
  tenant_id: string;
  prompt: string;
  response: string;
  status: string;
  created_at: number;
  updated_at: number;
}

interface TemplateRow {
  id: string;
  tenant_id: string;
  type: string;
  payload: string;
  created_at: number;
}

/**
 * Persistencia Copilot — sesiones y plantillas aisladas por tenant.
 */
export class SQLitePromptRepository implements PromptRepository {
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
      CREATE TABLE IF NOT EXISTS copilot_sessions (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        response TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_copilot_sessions_tenant
        ON copilot_sessions(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS copilot_templates (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_copilot_templates_tenant
        ON copilot_templates(tenant_id, created_at DESC);
    `);
  }

  createSession(input: {
    prompt: string;
    response: CopilotGeneratedResponse;
    status?: CopilotSessionStatus;
  }): CopilotSessionDto {
    const id = this.idFactory();
    const now = this.now();
    const status = input.status ?? 'ready';
    const tenantId = this.tenant();
    this.db
      .prepare(
        `
        INSERT INTO copilot_sessions (
          id, tenant_id, prompt, response, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        input.prompt,
        JSON.stringify(input.response),
        status,
        now,
        now,
      );
    return this.getSession(id)!;
  }

  getSession(id: string): CopilotSessionDto | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM copilot_sessions
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .get(id, this.tenant()) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  listSessions(limit: number = 50): CopilotSessionDto[] {
    const safe = Math.min(Math.max(1, limit), 200);
    const rows = this.db
      .prepare(
        `
        SELECT * FROM copilot_sessions
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), safe) as unknown as SessionRow[];
    return rows.map(rowToSession);
  }

  updateSession(
    id: string,
    patch: {
      response?: CopilotGeneratedResponse;
      status?: CopilotSessionStatus;
    },
  ): CopilotSessionDto | null {
    const existing = this.getSession(id);
    if (!existing) return null;
    const now = this.now();
    const response = patch.response ?? existing.response;
    const status = patch.status ?? existing.status;
    this.db
      .prepare(
        `
        UPDATE copilot_sessions
        SET response = ?, status = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(JSON.stringify(response), status, now, id, this.tenant());
    return this.getSession(id);
  }

  deleteSession(id: string): boolean {
    const result = this.db
      .prepare(
        `
        DELETE FROM copilot_sessions
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(id, this.tenant());
    return Number(result.changes) > 0;
  }

  saveTemplate(input: {
    type: CopilotTemplateType;
    payload: CopilotGeneratedResponse;
  }): CopilotTemplateDto {
    const id = this.idFactory();
    const now = this.now();
    const tenantId = this.tenant();
    this.db
      .prepare(
        `
        INSERT INTO copilot_templates (id, tenant_id, type, payload, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(id, tenantId, input.type, JSON.stringify(input.payload), now);
    return this.getTemplate(id)!;
  }

  listTemplates(limit: number = 50): CopilotTemplateDto[] {
    const safe = Math.min(Math.max(1, limit), 200);
    const rows = this.db
      .prepare(
        `
        SELECT * FROM copilot_templates
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), safe) as unknown as TemplateRow[];
    return rows.map(rowToTemplate);
  }

  getTemplate(id: string): CopilotTemplateDto | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM copilot_templates
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .get(id, this.tenant()) as TemplateRow | undefined;
    return row ? rowToTemplate(row) : null;
  }

  deleteTemplate(id: string): boolean {
    const result = this.db
      .prepare(
        `
        DELETE FROM copilot_templates
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(id, this.tenant());
    return Number(result.changes) > 0;
  }
}

function rowToSession(row: SessionRow): CopilotSessionDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    prompt: row.prompt,
    response: JSON.parse(row.response) as CopilotGeneratedResponse,
    status: row.status as CopilotSessionStatus,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToTemplate(row: TemplateRow): CopilotTemplateDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type as CopilotTemplateType,
    payload: JSON.parse(row.payload) as CopilotGeneratedResponse,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
