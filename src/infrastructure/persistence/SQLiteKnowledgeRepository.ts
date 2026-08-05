import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { KnowledgeRepository } from '../../domain/dashboard/KnowledgeRepository';
import type {
  KnowledgeCreateInput,
  KnowledgeItemDto,
  KnowledgeListFilters,
  KnowledgeListResult,
  KnowledgeUpdateInput,
} from '../../domain/dashboard/knowledgeItemDto';
import {
  normalizeKnowledgeCategory,
} from '../../domain/dashboard/knowledgeItemDto';
import {
  KNOWLEDGE_ARTICLES,
  type KnowledgeArticle,
} from '../../domain/knowledge/knowledgeArticles';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * knowledge_items en SQLite, scoped por tenant_id.
 */
export class SQLiteKnowledgeRepository implements KnowledgeRepository {
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

  list(filters: KnowledgeListFilters = {}): KnowledgeListResult {
    const tenantId = this.tenant();
    const rows = this.db
      .prepare(
        `
        SELECT * FROM knowledge_items
        WHERE tenant_id = ?
        ORDER BY priority DESC, updated_at DESC, title ASC
      `,
      )
      .all(tenantId) as unknown as KnowledgeRow[];

    let items = rows.map(rowToDto);
    const enabledCount = items.filter((i) => i.enabled).length;

    if (filters.category) {
      const cat = normalizeKnowledgeCategory(filters.category);
      items = items.filter((i) => i.category === cat);
    }
    if (filters.enabled !== undefined) {
      items = items.filter((i) => i.enabled === filters.enabled);
    }
    if (filters.q?.trim()) {
      const q = normalizeSearch(filters.q);
      items = items.filter((i) => matchesSearch(i, q));
    }

    return { items, total: items.length, enabledCount };
  }

  getById(id: string): KnowledgeItemDto | null {
    const row = this.db
      .prepare(
        `SELECT * FROM knowledge_items WHERE tenant_id = ? AND id = ?`,
      )
      .get(this.tenant(), id) as unknown as KnowledgeRow | undefined;
    return row ? rowToDto(row) : null;
  }

  create(input: KnowledgeCreateInput): KnowledgeItemDto {
    const now = this.now();
    const tenantId = this.tenant();
    const id = this.idFactory();
    const dto: KnowledgeItemDto = {
      id,
      tenantId,
      category: normalizeKnowledgeCategory(input.category ?? 'FAQ'),
      title: String(input.title ?? '').trim() || 'Sin título',
      question: String(input.question ?? '').trim() || String(input.title ?? '').trim(),
      answer: String(input.answer ?? '').trim(),
      tags: normalizeTags(input.tags),
      priority: normalizePriority(input.priority),
      enabled: input.enabled !== false,
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    this.insert(dto, now);
    return dto;
  }

  update(id: string, input: KnowledgeUpdateInput): KnowledgeItemDto | null {
    const current = this.getById(id);
    if (!current) return null;
    const now = this.now();
    const next: KnowledgeItemDto = {
      ...current,
      category:
        input.category !== undefined
          ? normalizeKnowledgeCategory(input.category)
          : current.category,
      title:
        input.title !== undefined
          ? String(input.title).trim() || current.title
          : current.title,
      question:
        input.question !== undefined
          ? String(input.question).trim() || current.question
          : current.question,
      answer:
        input.answer !== undefined ? String(input.answer).trim() : current.answer,
      tags: input.tags !== undefined ? normalizeTags(input.tags) : current.tags,
      priority:
        input.priority !== undefined
          ? normalizePriority(input.priority)
          : current.priority,
      enabled: input.enabled !== undefined ? Boolean(input.enabled) : current.enabled,
      updatedAt: new Date(now).toISOString(),
    };

    this.db
      .prepare(
        `
        UPDATE knowledge_items SET
          category = ?, title = ?, question = ?, answer = ?, tags = ?,
          priority = ?, enabled = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      )
      .run(
        next.category,
        next.title,
        next.question,
        next.answer,
        JSON.stringify(next.tags),
        next.priority,
        next.enabled ? 1 : 0,
        now,
        this.tenant(),
        id,
      );

    return next;
  }

  delete(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM knowledge_items WHERE tenant_id = ? AND id = ?`)
      .run(this.tenant(), id);
    return Number(result.changes) > 0;
  }

  search(query: string): KnowledgeItemDto[] {
    return this.list({ q: query, enabled: true }).items;
  }

  duplicate(id: string): KnowledgeItemDto | null {
    const current = this.getById(id);
    if (!current) return null;
    return this.create({
      category: current.category,
      title: `${current.title} (copia)`,
      question: current.question,
      answer: current.answer,
      tags: [...current.tags],
      priority: current.priority,
      enabled: current.enabled,
    });
  }

  listEnabledArticles(): KnowledgeArticle[] {
    const { items } = this.list({ enabled: true });
    return items
      .slice()
      .sort((a, b) => b.priority - a.priority)
      .map(itemToArticle);
  }

  seedDefaultsIfEmpty(): number {
    const tenantId = this.tenant();
    const count = this.db
      .prepare(`SELECT COUNT(*) AS c FROM knowledge_items WHERE tenant_id = ?`)
      .get(tenantId) as unknown as { c: number };
    if (Number(count.c) > 0) return 0;

    let seeded = 0;
    for (const article of KNOWLEDGE_ARTICLES) {
      const now = this.now() + seeded;
      const dto: KnowledgeItemDto = {
        id: article.id,
        tenantId,
        category: 'FAQ',
        title: article.title,
        question: article.title,
        answer: article.body,
        tags: [...article.keywords],
        priority: 10,
        enabled: true,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };
      this.insert(dto, now);
      seeded += 1;
    }
    return seeded;
  }

  close(): void {
    this.db.close();
  }

  private insert(dto: KnowledgeItemDto, now: number): void {
    this.db
      .prepare(
        `
        INSERT INTO knowledge_items (
          id, tenant_id, category, title, question, answer, tags,
          priority, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        dto.id,
        dto.tenantId,
        dto.category,
        dto.title,
        dto.question,
        dto.answer,
        JSON.stringify(dto.tags),
        dto.priority,
        dto.enabled ? 1 : 0,
        Date.parse(dto.createdAt) || now,
        Date.parse(dto.updatedAt) || now,
      );
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_items (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_knowledge_items_tenant
        ON knowledge_items(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_knowledge_items_category
        ON knowledge_items(tenant_id, category);
      CREATE INDEX IF NOT EXISTS idx_knowledge_items_enabled
        ON knowledge_items(tenant_id, enabled);
    `);
  }
}

interface KnowledgeRow {
  id: string;
  tenant_id: string;
  category: string;
  title: string;
  question: string;
  answer: string;
  tags: string;
  priority: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function rowToDto(row: KnowledgeRow): KnowledgeItemDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    category: normalizeKnowledgeCategory(row.category),
    title: row.title,
    question: row.question,
    answer: row.answer,
    tags: parseTags(row.tags),
    priority: Number(row.priority) || 0,
    enabled: Number(row.enabled) === 1,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function itemToArticle(item: KnowledgeItemDto): KnowledgeArticle {
  const keywords = new Set<string>();
  for (const tag of item.tags) {
    const t = tag.trim();
    if (t) keywords.add(t);
  }
  if (item.question.trim()) keywords.add(item.question.trim());
  if (item.title.trim()) keywords.add(item.title.trim());
  return {
    id: item.id,
    title: item.title,
    keywords: [...keywords],
    body: item.answer,
  };
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    const t = String(raw).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function normalizePriority(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1000, Math.min(1000, Math.trunc(n)));
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return normalizeTags(parsed.map((x) => String(x)));
  } catch {
    return raw
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean);
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

function matchesSearch(item: KnowledgeItemDto, q: string): boolean {
  const hay = normalizeSearch(
    [item.title, item.question, item.answer, item.category, ...item.tags].join(
      ' ',
    ),
  );
  return hay.includes(q);
}
