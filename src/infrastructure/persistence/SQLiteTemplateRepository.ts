import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { TemplateRepository } from '../../domain/dashboard/TemplateRepository';
import type {
  TemplateDto,
  TemplateInstallDto,
  TemplateInstallResources,
  TemplateListFilters,
  TemplatePayload,
} from '../../domain/dashboard/templateDto';
import {
  isTemplateCategory,
  summarizePayload,
} from '../../domain/dashboard/templateDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';
import { SEED_TEMPLATES } from './templateSeeds';

/**
 * Catálogo global de templates + instalaciones por tenant.
 */
export class SQLiteTemplateRepository implements TemplateRepository {
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
    this.ensureSeedTemplates();
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  ensureSeedTemplates(): void {
    const now = this.now();
    const insert = this.db.prepare(
      `
      INSERT INTO templates (
        id, category, name, description, thumbnail, version, author,
        enabled, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    );
    for (const t of SEED_TEMPLATES) {
      insert.run(
        t.id,
        t.category,
        t.name,
        t.description,
        t.thumbnail,
        t.version,
        t.author,
        JSON.stringify(t.payload),
        now,
      );
    }
  }

  list(filters: TemplateListFilters = {}): TemplateDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM templates
        WHERE enabled = 1
        ORDER BY category ASC, name ASC
      `,
      )
      .all() as unknown as TemplateRow[];

    let items = rows.map(rowToTemplate);
    if (filters.category?.trim()) {
      const cat = filters.category.trim();
      items = items.filter((t) => t.category === cat);
    }
    if (filters.q?.trim()) {
      const q = normalizeSearch(filters.q);
      items = items.filter((t) =>
        normalizeSearch(
          [t.name, t.description, t.category, t.author].join(' '),
        ).includes(q),
      );
    }
    return items;
  }

  getById(id: string): TemplateDto | null {
    const row = this.db
      .prepare(`SELECT * FROM templates WHERE id = ?`)
      .get(id) as unknown as TemplateRow | undefined;
    return row ? rowToTemplate(row) : null;
  }

  listInstalls(): TemplateInstallDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM template_installs
        WHERE tenant_id = ?
        ORDER BY installed_at DESC
      `,
      )
      .all(this.tenant()) as unknown as InstallRow[];
    return rows.map(rowToInstall);
  }

  getInstall(templateId: string): TemplateInstallDto | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM template_installs
        WHERE tenant_id = ? AND template_id = ?
      `,
      )
      .get(this.tenant(), templateId) as unknown as InstallRow | undefined;
    return row ? rowToInstall(row) : null;
  }

  upsertInstall(input: {
    templateId: string;
    version: string;
    resources: TemplateInstallResources;
  }): TemplateInstallDto {
    const tenantId = this.tenant();
    const now = this.now();
    const existing = this.getInstall(input.templateId);
    if (existing) {
      this.db
        .prepare(
          `
          UPDATE template_installs SET
            version = ?, installed_at = ?, resources_json = ?
          WHERE tenant_id = ? AND template_id = ?
        `,
        )
        .run(
          input.version,
          now,
          JSON.stringify(input.resources),
          tenantId,
          input.templateId,
        );
      return this.getInstall(input.templateId)!;
    }

    const id = this.idFactory();
    this.db
      .prepare(
        `
        INSERT INTO template_installs (
          id, tenant_id, template_id, installed_at, version, resources_json
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        input.templateId,
        now,
        input.version,
        JSON.stringify(input.resources),
      );
    return this.getInstall(input.templateId)!;
  }

  deleteInstall(templateId: string): boolean {
    const result = this.db
      .prepare(
        `DELETE FROM template_installs WHERE tenant_id = ? AND template_id = ?`,
      )
      .run(this.tenant(), templateId);
    return Number(result.changes) > 0;
  }

  close(): void {
    this.db.close();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        thumbnail TEXT,
        version TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_templates_category
        ON templates(category, enabled);

      CREATE TABLE IF NOT EXISTS template_installs (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        installed_at INTEGER NOT NULL,
        version TEXT NOT NULL,
        resources_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY (tenant_id, id),
        UNIQUE (tenant_id, template_id)
      );
      CREATE INDEX IF NOT EXISTS idx_template_installs_tenant
        ON template_installs(tenant_id);
    `);
  }
}

interface TemplateRow {
  id: string;
  category: string;
  name: string;
  description: string;
  thumbnail: string | null;
  version: string;
  author: string;
  enabled: number;
  payload_json: string;
  created_at: number;
}

interface InstallRow {
  id: string;
  tenant_id: string;
  template_id: string;
  installed_at: number;
  version: string;
  resources_json: string;
}

function rowToTemplate(row: TemplateRow): TemplateDto {
  const payload = parsePayload(row.payload_json);
  return {
    id: row.id,
    category: isTemplateCategory(row.category) ? row.category : 'Genérico',
    name: row.name,
    description: row.description ?? '',
    thumbnail: row.thumbnail,
    version: row.version,
    author: row.author ?? '',
    enabled: Number(row.enabled) === 1,
    createdAt: new Date(row.created_at).toISOString(),
    payload,
    summary: summarizePayload(payload),
  };
}

function rowToInstall(row: InstallRow): TemplateInstallDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    templateId: row.template_id,
    installedAt: new Date(row.installed_at).toISOString(),
    version: row.version,
    resources: parseResources(row.resources_json),
  };
}

function parsePayload(raw: string): TemplatePayload {
  try {
    return JSON.parse(raw) as TemplatePayload;
  } catch {
    return {};
  }
}

function parseResources(raw: string): TemplateInstallResources {
  try {
    const parsed = JSON.parse(raw) as TemplateInstallResources;
    return {
      knowledgeIds: parsed.knowledgeIds ?? [],
      automationIds: parsed.automationIds ?? [],
      workflowIds: parsed.workflowIds ?? [],
      companyApplied: Boolean(parsed.companyApplied),
      pipeline: parsed.pipeline,
      tasks: parsed.tasks,
      widgets: parsed.widgets,
    };
  } catch {
    return {
      knowledgeIds: [],
      automationIds: [],
      workflowIds: [],
      companyApplied: false,
    };
  }
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
