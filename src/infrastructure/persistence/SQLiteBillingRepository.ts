import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { BillingRepository } from '../../domain/dashboard/BillingRepository';
import type {
  BillingEventDto,
  BillingMetric,
  PlanDto,
  PlanLimits,
  SubscriptionDto,
  SubscriptionStatus,
  SubscriptionUpdateInput,
  UsageMetricDto,
} from '../../domain/dashboard/billingDto';
import {
  BILLING_METRICS,
  BILLING_PLAN_IDS,
  currentBillingPeriod,
  defaultPlanLimits,
  isBillingMetric,
} from '../../domain/dashboard/billingDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

const PLAN_SEED: Array<{
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
}> = [
  {
    id: 'FREE',
    name: 'Free',
    description: 'Ideal para probar Rodacenter AI con límites básicos.',
    monthlyPrice: 0,
    annualPrice: 0,
  },
  {
    id: 'STARTER',
    name: 'Starter',
    description: 'Para talleres pequeños con automatizaciones ligeras.',
    monthlyPrice: 49,
    annualPrice: 490,
  },
  {
    id: 'PRO',
    name: 'Pro',
    description: 'Operación comercial completa con workflows e integraciones.',
    monthlyPrice: 149,
    annualPrice: 1490,
  },
  {
    id: 'ENTERPRISE',
    name: 'Enterprise',
    description: 'Sin límites prácticos, soporte y escala multi-sede.',
    monthlyPrice: 499,
    annualPrice: 4990,
  },
];

/**
 * plans (catálogo global) + subscriptions / usage / events por tenant.
 */
export class SQLiteBillingRepository implements BillingRepository {
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
    this.ensureSeedPlans();
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  ensureSeedPlans(): void {
    const now = this.now();
    const insert = this.db.prepare(
      `
      INSERT INTO plans (
        id, name, description, monthly_price, annual_price,
        limits_json, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `,
    );
    for (const plan of PLAN_SEED) {
      const limits = defaultPlanLimits(
        plan.id as (typeof BILLING_PLAN_IDS)[number],
      );
      insert.run(
        plan.id,
        plan.name,
        plan.description,
        plan.monthlyPrice,
        plan.annualPrice,
        JSON.stringify(limits),
        now,
        now,
      );
    }
  }

  listPlans(): PlanDto[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM plans WHERE enabled = 1 ORDER BY monthly_price ASC, name ASC`,
      )
      .all() as unknown as PlanRow[];
    return rows.map(rowToPlan);
  }

  getPlan(planId: string): PlanDto | null {
    const row = this.db
      .prepare(`SELECT * FROM plans WHERE id = ?`)
      .get(planId) as unknown as PlanRow | undefined;
    return row ? rowToPlan(row) : null;
  }

  getSubscription(): SubscriptionDto {
    const tenantId = this.tenant();
    const row = this.db
      .prepare(`SELECT * FROM subscriptions WHERE tenant_id = ?`)
      .get(tenantId) as unknown as SubRow | undefined;
    if (row) return rowToSub(row);
    return this.createDefaultSubscription(tenantId);
  }

  updateSubscription(input: SubscriptionUpdateInput): SubscriptionDto {
    const current = this.getSubscription();
    const now = this.now();
    let status: SubscriptionStatus = current.status;
    let planId = current.planId;
    let cancelDate = current.cancelDate
      ? Date.parse(current.cancelDate)
      : null;
    let renewDate = current.renewDate ? Date.parse(current.renewDate) : null;
    let trialEndsAt = current.trialEndsAt
      ? Date.parse(current.trialEndsAt)
      : null;

    if (input.planId) {
      const plan = this.getPlan(input.planId);
      if (!plan || !plan.enabled) {
        throw new Error(`Plan inválido: ${input.planId}`);
      }
      planId = plan.id;
      if (status === 'canceled' || status === 'expired' || status === 'trialing') {
        status = 'active';
        cancelDate = null;
      }
      renewDate = addMonths(now, input.billingCycle === 'annual' ? 12 : 1);
    }

    if (input.status) status = input.status;

    if (input.cancel) {
      status = 'canceled';
      cancelDate = now;
    }

    if (input.reactivate) {
      status = 'active';
      cancelDate = null;
      renewDate = addMonths(now, 1);
      trialEndsAt = null;
    }

    this.db
      .prepare(
        `
        UPDATE subscriptions SET
          plan_id = ?, status = ?, renew_date = ?, cancel_date = ?,
          trial_ends_at = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      )
      .run(
        planId,
        status,
        renewDate,
        cancelDate,
        trialEndsAt,
        now,
        this.tenant(),
        current.id,
      );

    return this.getSubscription();
  }

  getUsage(period?: string): UsageMetricDto[] {
    const p = period || currentBillingPeriod(new Date(this.now()));
    const rows = this.db
      .prepare(
        `
        SELECT * FROM usage_metrics
        WHERE tenant_id = ? AND period = ?
        ORDER BY metric ASC
      `,
      )
      .all(this.tenant(), p) as unknown as UsageRow[];
    return rows.map(rowToUsage);
  }

  registerUsage(
    metric: BillingMetric,
    delta: number,
    period?: string,
  ): UsageMetricDto {
    const tenantId = this.tenant();
    const p = period || currentBillingPeriod(new Date(this.now()));
    const now = this.now();
    const amount = Number.isFinite(delta) ? Math.trunc(delta) : 0;

    const existing = this.db
      .prepare(
        `
        SELECT * FROM usage_metrics
        WHERE tenant_id = ? AND metric = ? AND period = ?
      `,
      )
      .get(tenantId, metric, p) as unknown as UsageRow | undefined;

    if (existing) {
      const next = Math.max(0, Number(existing.value) + amount);
      this.db
        .prepare(
          `
          UPDATE usage_metrics SET value = ?, updated_at = ?
          WHERE tenant_id = ? AND id = ?
        `,
        )
        .run(next, now, tenantId, existing.id);
    } else {
      this.db
        .prepare(
          `
          INSERT INTO usage_metrics (
            id, tenant_id, metric, value, period, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          this.idFactory(),
          tenantId,
          metric,
          Math.max(0, amount),
          p,
          now,
        );
    }

    const row = this.db
      .prepare(
        `
        SELECT * FROM usage_metrics
        WHERE tenant_id = ? AND metric = ? AND period = ?
      `,
      )
      .get(tenantId, metric, p) as unknown as UsageRow;
    return rowToUsage(row);
  }

  appendEvent(
    type: string,
    payload: Record<string, unknown> = {},
  ): BillingEventDto {
    const now = this.now();
    const dto: BillingEventDto = {
      id: this.idFactory(),
      tenantId: this.tenant(),
      type: String(type || 'billing.event'),
      payload: payload && typeof payload === 'object' ? { ...payload } : {},
      createdAt: new Date(now).toISOString(),
    };
    this.db
      .prepare(
        `
        INSERT INTO billing_events (id, tenant_id, type, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        dto.id,
        dto.tenantId,
        dto.type,
        JSON.stringify(dto.payload),
        now,
      );
    return dto;
  }

  listEvents(limit: number = 50): BillingEventDto[] {
    const lim = Math.max(1, Math.min(500, Number(limit) || 50));
    const rows = this.db
      .prepare(
        `
        SELECT * FROM billing_events
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), lim) as unknown as EventRow[];
    return rows.map(rowToEvent);
  }

  close(): void {
    this.db.close();
  }

  private createDefaultSubscription(tenantId: string): SubscriptionDto {
    const now = this.now();
    const trialEnds = addDays(now, 14);
    const renew = addMonths(now, 1);
    const id = this.idFactory();
    this.db
      .prepare(
        `
        INSERT INTO subscriptions (
          id, tenant_id, plan_id, status, start_date, renew_date,
          cancel_date, trial_ends_at, created_at, updated_at
        ) VALUES (?, ?, 'FREE', 'trialing', ?, ?, NULL, ?, ?, ?)
        ON CONFLICT(tenant_id) DO NOTHING
      `,
      )
      .run(id, tenantId, now, renew, trialEnds, now, now);

    const row = this.db
      .prepare(`SELECT * FROM subscriptions WHERE tenant_id = ?`)
      .get(tenantId) as unknown as SubRow;
    return rowToSub(row);
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        monthly_price REAL NOT NULL DEFAULT 0,
        annual_price REAL NOT NULL DEFAULT 0,
        limits_json TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL UNIQUE,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL,
        start_date INTEGER NOT NULL,
        renew_date INTEGER,
        cancel_date INTEGER,
        trial_ends_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant
        ON subscriptions(tenant_id);

      CREATE TABLE IF NOT EXISTS usage_metrics (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        metric TEXT NOT NULL,
        value INTEGER NOT NULL DEFAULT 0,
        period TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id),
        UNIQUE (tenant_id, metric, period)
      );
      CREATE INDEX IF NOT EXISTS idx_usage_tenant_period
        ON usage_metrics(tenant_id, period);

      CREATE TABLE IF NOT EXISTS billing_events (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_billing_events_tenant
        ON billing_events(tenant_id, created_at DESC);
    `);
  }
}

interface PlanRow {
  id: string;
  name: string;
  description: string;
  monthly_price: number;
  annual_price: number;
  limits_json: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

interface SubRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: string;
  start_date: number;
  renew_date: number | null;
  cancel_date: number | null;
  trial_ends_at: number | null;
  created_at: number;
  updated_at: number;
}

interface UsageRow {
  id: string;
  tenant_id: string;
  metric: string;
  value: number;
  period: string;
  updated_at: number;
}

interface EventRow {
  id: string;
  tenant_id: string;
  type: string;
  payload_json: string;
  created_at: number;
}

function rowToPlan(row: PlanRow): PlanDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    monthlyPrice: Number(row.monthly_price) || 0,
    annualPrice: Number(row.annual_price) || 0,
    limits: parseLimits(row.limits_json),
    enabled: Number(row.enabled) === 1,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToSub(row: SubRow): SubscriptionDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planId: row.plan_id,
    status: normalizeStatus(row.status),
    startDate: new Date(row.start_date).toISOString(),
    renewDate:
      row.renew_date == null ? null : new Date(row.renew_date).toISOString(),
    cancelDate:
      row.cancel_date == null ? null : new Date(row.cancel_date).toISOString(),
    trialEndsAt:
      row.trial_ends_at == null
        ? null
        : new Date(row.trial_ends_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToUsage(row: UsageRow): UsageMetricDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    metric: isBillingMetric(row.metric) ? row.metric : 'apiRequests',
    value: Math.max(0, Number(row.value) || 0),
    period: row.period,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function rowToEvent(row: EventRow): BillingEventDto {
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type,
    payload,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function parseLimits(raw: string): PlanLimits {
  const base = defaultPlanLimits('FREE');
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of BILLING_METRICS) {
      const n = Number(parsed[key]);
      if (Number.isFinite(n)) base[key] = Math.trunc(n);
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

function normalizeStatus(value: string): SubscriptionStatus {
  if (
    value === 'trialing' ||
    value === 'active' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'expired'
  ) {
    return value;
  }
  return 'active';
}

function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.getTime();
}

function addDays(ms: number, days: number): number {
  return ms + days * 24 * 60 * 60 * 1000;
}
