/**
 * Billing & Subscription (Dashboard Sprint 17).
 * SaaS comercial desacoplado: planes, límites y uso por tenant.
 */

export const BILLING_PLAN_IDS = [
  'FREE',
  'STARTER',
  'PRO',
  'ENTERPRISE',
] as const;

export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];

export const BILLING_METRICS = [
  'users',
  'conversations',
  'automations',
  'workflows',
  'integrations',
  'knowledge',
  'clients',
  'storage',
  'apiRequests',
] as const;

export type BillingMetric = (typeof BILLING_METRICS)[number];

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'expired';

/** -1 = ilimitado */
export type PlanLimits = Record<BillingMetric, number>;

export interface PlanDto {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  limits: PlanLimits;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionDto {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  startDate: string;
  renewDate: string | null;
  cancelDate: string | null;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsageMetricDto {
  id: string;
  tenantId: string;
  metric: BillingMetric;
  value: number;
  period: string;
  updatedAt: string;
}

export interface UsageSnapshotDto {
  period: string;
  metrics: UsageMetricDto[];
  byMetric: Partial<Record<BillingMetric, number>>;
  warnings: LimitWarning[];
}

export interface LimitWarning {
  metric: BillingMetric;
  limit: number;
  used: number;
  ratio: number;
  level: 'ok' | 'warning' | 'exceeded';
  message: string;
}

export interface BillingEventDto {
  id: string;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SubscriptionUpdateInput {
  planId?: string;
  status?: SubscriptionStatus;
  /** true → marca cancelación y status canceled */
  cancel?: boolean;
  /** true → reactiva / quita cancelDate */
  reactivate?: boolean;
  billingCycle?: 'monthly' | 'annual';
}

export interface ValidateLimitResult {
  metric: BillingMetric;
  allowed: boolean;
  limit: number;
  used: number;
  remaining: number;
  warning: LimitWarning | null;
}

export function isBillingMetric(value: string): value is BillingMetric {
  return (BILLING_METRICS as readonly string[]).includes(value);
}

export function isBillingPlanId(value: string): value is BillingPlanId {
  return (BILLING_PLAN_IDS as readonly string[]).includes(value);
}

export function currentBillingPeriod(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function defaultPlanLimits(planId: BillingPlanId): PlanLimits {
  switch (planId) {
    case 'FREE':
      return {
        users: 1,
        conversations: 100,
        automations: 3,
        workflows: 1,
        integrations: 0,
        knowledge: 20,
        clients: 50,
        storage: 100,
        apiRequests: 1_000,
      };
    case 'STARTER':
      return {
        users: 3,
        conversations: 1_000,
        automations: 20,
        workflows: 5,
        integrations: 2,
        knowledge: 200,
        clients: 500,
        storage: 1_000,
        apiRequests: 20_000,
      };
    case 'PRO':
      return {
        users: 10,
        conversations: 10_000,
        automations: 100,
        workflows: 50,
        integrations: 10,
        knowledge: 2_000,
        clients: 5_000,
        storage: 10_000,
        apiRequests: 200_000,
      };
    case 'ENTERPRISE':
      return {
        users: -1,
        conversations: -1,
        automations: -1,
        workflows: -1,
        integrations: -1,
        knowledge: -1,
        clients: -1,
        storage: -1,
        apiRequests: -1,
      };
    default:
      return defaultPlanLimits('FREE');
  }
}
