import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { AutomationRepository } from '../../domain/dashboard/AutomationRepository';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationCreateInput,
  AutomationLogDto,
  AutomationRuleDto,
  AutomationUpdateInput,
} from '../../domain/dashboard/automationDto';
import {
  isAutomationActionType,
  isAutomationTrigger,
} from '../../domain/dashboard/automationDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * automation_rules + automation_logs en SQLite, scoped por tenant_id.
 */
export class SQLiteAutomationRepository implements AutomationRepository {
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

  listRules(): AutomationRuleDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM automation_rules
        WHERE tenant_id = ?
        ORDER BY priority DESC, updated_at DESC, name ASC
      `,
      )
      .all(this.tenant()) as unknown as RuleRow[];
    return rows.map(rowToRule);
  }

  getRule(id: string): AutomationRuleDto | null {
    const row = this.db
      .prepare(
        `SELECT * FROM automation_rules WHERE tenant_id = ? AND id = ?`,
      )
      .get(this.tenant(), id) as unknown as RuleRow | undefined;
    return row ? rowToRule(row) : null;
  }

  createRule(input: AutomationCreateInput): AutomationRuleDto {
    const now = this.now();
    const tenantId = this.tenant();
    const dto: AutomationRuleDto = {
      id: this.idFactory(),
      tenantId,
      name: String(input.name ?? '').trim() || 'Sin nombre',
      enabled: input.enabled !== false,
      priority: normalizePriority(input.priority),
      trigger: normalizeTrigger(input.trigger),
      condition: normalizeCondition(input.condition ?? null),
      action: normalizeAction(input.action),
      config: normalizeConfig(input.config),
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
    this.insertRule(dto, now);
    return dto;
  }

  updateRule(
    id: string,
    input: AutomationUpdateInput,
  ): AutomationRuleDto | null {
    const current = this.getRule(id);
    if (!current) return null;
    const now = this.now();
    const next: AutomationRuleDto = {
      ...current,
      name:
        input.name !== undefined
          ? String(input.name).trim() || current.name
          : current.name,
      enabled:
        input.enabled !== undefined ? Boolean(input.enabled) : current.enabled,
      priority:
        input.priority !== undefined
          ? normalizePriority(input.priority)
          : current.priority,
      trigger:
        input.trigger !== undefined
          ? normalizeTrigger(input.trigger)
          : current.trigger,
      condition:
        input.condition !== undefined
          ? normalizeCondition(input.condition)
          : current.condition,
      action:
        input.action !== undefined
          ? normalizeAction(input.action)
          : current.action,
      config:
        input.config !== undefined
          ? normalizeConfig(input.config)
          : current.config,
      updatedAt: new Date(now).toISOString(),
    };

    this.db
      .prepare(
        `
        UPDATE automation_rules SET
          name = ?, enabled = ?, priority = ?, trigger = ?,
          condition_json = ?, action_json = ?, config_json = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      )
      .run(
        next.name,
        next.enabled ? 1 : 0,
        next.priority,
        next.trigger,
        JSON.stringify(next.condition),
        JSON.stringify(next.action),
        JSON.stringify(next.config),
        now,
        this.tenant(),
        id,
      );

    return next;
  }

  deleteRule(id: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM automation_rules WHERE tenant_id = ? AND id = ?`)
      .run(this.tenant(), id);
    return Number(result.changes) > 0;
  }

  duplicateRule(id: string): AutomationRuleDto | null {
    const current = this.getRule(id);
    if (!current) return null;
    return this.createRule({
      name: `${current.name} (copia)`,
      enabled: current.enabled,
      priority: current.priority,
      trigger: current.trigger,
      condition: current.condition,
      action: current.action,
      config: { ...current.config },
    });
  }

  listEnabledByTrigger(trigger: string): AutomationRuleDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM automation_rules
        WHERE tenant_id = ? AND enabled = 1 AND trigger = ?
        ORDER BY priority DESC, updated_at DESC
      `,
      )
      .all(this.tenant(), trigger) as unknown as RuleRow[];
    return rows.map(rowToRule);
  }

  appendLog(input: {
    ruleId: string;
    trigger: string;
    result: string;
  }): AutomationLogDto {
    const now = this.now();
    const dto: AutomationLogDto = {
      id: this.idFactory(),
      ruleId: input.ruleId,
      tenantId: this.tenant(),
      trigger: input.trigger,
      result: input.result,
      executedAt: new Date(now).toISOString(),
    };
    this.db
      .prepare(
        `
        INSERT INTO automation_logs (
          id, rule_id, tenant_id, trigger, result, executed_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        dto.id,
        dto.ruleId,
        dto.tenantId,
        dto.trigger,
        dto.result,
        now,
      );
    return dto;
  }

  listLogs(options: { ruleId?: string; limit?: number } = {}): AutomationLogDto[] {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const tenantId = this.tenant();
    const rows = options.ruleId
      ? (this.db
          .prepare(
            `
            SELECT * FROM automation_logs
            WHERE tenant_id = ? AND rule_id = ?
            ORDER BY executed_at DESC
            LIMIT ?
          `,
          )
          .all(tenantId, options.ruleId, limit) as unknown as LogRow[])
      : (this.db
          .prepare(
            `
            SELECT * FROM automation_logs
            WHERE tenant_id = ?
            ORDER BY executed_at DESC
            LIMIT ?
          `,
          )
          .all(tenantId, limit) as unknown as LogRow[]);
    return rows.map(rowToLog);
  }

  close(): void {
    this.db.close();
  }

  private insertRule(dto: AutomationRuleDto, now: number): void {
    this.db
      .prepare(
        `
        INSERT INTO automation_rules (
          id, tenant_id, name, enabled, priority, trigger,
          condition_json, action_json, config_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        dto.id,
        dto.tenantId,
        dto.name,
        dto.enabled ? 1 : 0,
        dto.priority,
        dto.trigger,
        JSON.stringify(dto.condition),
        JSON.stringify(dto.action),
        JSON.stringify(dto.config),
        Date.parse(dto.createdAt) || now,
        Date.parse(dto.updatedAt) || now,
      );
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automation_rules (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        trigger TEXT NOT NULL,
        condition_json TEXT,
        action_json TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant
        ON automation_rules(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger
        ON automation_rules(tenant_id, trigger, enabled);

      CREATE TABLE IF NOT EXISTS automation_logs (
        id TEXT NOT NULL,
        rule_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        result TEXT NOT NULL,
        executed_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_automation_logs_tenant
        ON automation_logs(tenant_id, executed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_automation_logs_rule
        ON automation_logs(tenant_id, rule_id);
    `);
  }
}

interface RuleRow {
  id: string;
  tenant_id: string;
  name: string;
  enabled: number;
  priority: number;
  trigger: string;
  condition_json: string | null;
  action_json: string;
  config_json: string;
  created_at: number;
  updated_at: number;
}

interface LogRow {
  id: string;
  rule_id: string;
  tenant_id: string;
  trigger: string;
  result: string;
  executed_at: number;
}

function rowToRule(row: RuleRow): AutomationRuleDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    enabled: Number(row.enabled) === 1,
    priority: Number(row.priority) || 0,
    trigger: normalizeTrigger(row.trigger),
    condition: parseJson<AutomationCondition | null>(row.condition_json, null),
    action: normalizeAction(
      parseJson<AutomationAction>(row.action_json, {
        type: 'record_event',
        eventName: 'unknown',
      }),
    ),
    config: parseJson<Record<string, unknown>>(row.config_json, {}),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToLog(row: LogRow): AutomationLogDto {
  const result = row.result;
  let detail: AutomationLogDto['detail'];
  try {
    detail = JSON.parse(result) as AutomationLogDto['detail'];
  } catch {
    detail = undefined;
  }
  return {
    id: row.id,
    ruleId: row.rule_id,
    tenantId: row.tenant_id,
    trigger: row.trigger,
    result,
    executedAt: new Date(row.executed_at).toISOString(),
    detail,
  };
}

function normalizeTrigger(value: string): AutomationRuleDto['trigger'] {
  const t = String(value ?? '').trim();
  if (isAutomationTrigger(t)) return t;
  return 'conversation.updated';
}

function normalizePriority(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-1000, Math.min(1000, Math.trunc(n)));
}

function normalizeCondition(
  value: AutomationCondition | null | undefined,
): AutomationCondition | null {
  if (value == null) return null;
  if (!value.field) return null;
  return {
    field: value.field,
    op: value.op,
    value: value.value,
  };
}

function normalizeAction(value: AutomationAction): AutomationAction {
  const type = isAutomationActionType(String(value?.type ?? ''))
    ? value.type
    : 'record_event';
  return {
    type,
    label: value.label,
    priority: value.priority,
    tag: value.tag,
    eventName: value.eventName,
    metadata: value.metadata,
  };
}

function normalizeConfig(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
