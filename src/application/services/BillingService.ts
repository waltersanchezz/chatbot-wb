import type { EventBus } from '../../domain/realtime/EventBus';
import type { RealtimeEvent } from '../../domain/realtime/realtimeEvents';
import type { BillingRepository } from '../../domain/dashboard/BillingRepository';
import type {
  BillingEventDto,
  BillingMetric,
  LimitWarning,
  PlanDto,
  SubscriptionDto,
  SubscriptionUpdateInput,
  UsageSnapshotDto,
  ValidateLimitResult,
} from '../../domain/dashboard/billingDto';
import {
  BILLING_METRICS,
  currentBillingPeriod,
  isBillingMetric,
} from '../../domain/dashboard/billingDto';
import { runWithTenant } from '../../domain/tenant/TenantContext';
import { DEFAULT_TENANT_ID } from '../../domain/tenant/tenantDto';

export class BillingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingValidationError';
  }
}

/**
 * Billing & Subscription Manager — capa SaaS desacoplada.
 * No bloquea módulos; solo mide uso y emite advertencias.
 */
export class BillingService {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly repository: BillingRepository) {
    this.repository.ensureSeedPlans();
  }

  /** Escucha EventBus para registrar conversaciones (sin tocar ConversationEngine). */
  start(eventBus: EventBus): () => void {
    this.stop();
    this.unsubscribe = eventBus.subscribe((event) => {
      this.onRealtimeEvent(event);
    });
    return () => this.stop();
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  listPlans(): PlanDto[] {
    return this.repository.listPlans();
  }

  getPlan(planId?: string): PlanDto {
    const id = planId || this.repository.getSubscription().planId;
    const plan = this.repository.getPlan(id);
    if (!plan) {
      throw new BillingValidationError(`Plan no encontrado: ${id}`);
    }
    return plan;
  }

  getSubscription(): SubscriptionDto {
    return this.repository.getSubscription();
  }

  updateSubscription(input: SubscriptionUpdateInput): SubscriptionDto {
    if (input.planId !== undefined && !String(input.planId).trim()) {
      throw new BillingValidationError('planId inválido');
    }
    if (input.planId) {
      const plan = this.repository.getPlan(input.planId);
      if (!plan || !plan.enabled) {
        throw new BillingValidationError(`Plan inválido: ${input.planId}`);
      }
    }

    try {
      const before = this.repository.getSubscription();
      const next = this.repository.updateSubscription(input);

      if (input.cancel) {
        this.repository.appendEvent('subscription.canceled', {
          subscriptionId: next.id,
          planId: next.planId,
        });
      } else if (input.reactivate) {
        this.repository.appendEvent('subscription.reactivated', {
          subscriptionId: next.id,
          planId: next.planId,
        });
      } else if (input.planId && input.planId !== before.planId) {
        this.repository.appendEvent('subscription.plan_changed', {
          from: before.planId,
          to: next.planId,
          billingCycle: input.billingCycle ?? 'monthly',
        });
      } else {
        this.repository.appendEvent('subscription.updated', {
          status: next.status,
          planId: next.planId,
        });
      }

      return next;
    } catch (err) {
      if (err instanceof BillingValidationError) throw err;
      throw new BillingValidationError(
        err instanceof Error ? err.message : 'No se pudo actualizar',
      );
    }
  }

  getUsage(period?: string): UsageSnapshotDto {
    const p = period || currentBillingPeriod();
    const metrics = this.repository.getUsage(p);
    const byMetric: UsageSnapshotDto['byMetric'] = {};
    for (const m of metrics) {
      byMetric[m.metric] = m.value;
    }
    const plan = this.getPlan();
    const warnings = buildWarnings(plan, byMetric);
    return { period: p, metrics, byMetric, warnings };
  }

  validateLimit(metric: string): ValidateLimitResult {
    if (!isBillingMetric(metric)) {
      throw new BillingValidationError(`Métrica inválida: ${metric}`);
    }
    const plan = this.getPlan();
    const limit = plan.limits[metric];
    const used = this.getUsage().byMetric[metric] ?? 0;
    const unlimited = limit < 0;
    const remaining = unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used);
    const warning = buildWarning(metric, limit, used);
    return {
      metric,
      allowed: unlimited || used < limit,
      limit,
      used,
      remaining: unlimited ? -1 : remaining,
      warning: warning.level === 'ok' ? null : warning,
    };
  }

  registerUsage(
    metric: string,
    delta: number = 1,
    period?: string,
  ): {
    usage: ReturnType<BillingRepository['registerUsage']>;
    warning: LimitWarning | null;
  } {
    if (!isBillingMetric(metric)) {
      throw new BillingValidationError(`Métrica inválida: ${metric}`);
    }
    const usage = this.repository.registerUsage(metric, delta, period);
    const plan = this.getPlan();
    const warning = buildWarning(metric, plan.limits[metric], usage.value);
    if (warning.level !== 'ok') {
      this.repository.appendEvent('usage.warning', {
        metric,
        used: usage.value,
        limit: plan.limits[metric],
        level: warning.level,
        message: warning.message,
      });
    }
    this.repository.appendEvent('usage.registered', {
      metric,
      delta,
      value: usage.value,
      period: usage.period,
    });
    return {
      usage,
      warning: warning.level === 'ok' ? null : warning,
    };
  }

  listEvents(limit?: number): BillingEventDto[] {
    return this.repository.listEvents(limit);
  }

  /** Resumen para dashboard. */
  getBillingOverview() {
    const subscription = this.getSubscription();
    const plan = this.getPlan(subscription.planId);
    const usage = this.getUsage();
    return {
      subscription,
      plan,
      usage,
      events: this.listEvents(20),
    };
  }

  onRealtimeEvent(event: RealtimeEvent): void {
    if (event.type !== 'conversation.created') return;
    const tenantId = event.payload.tenantId?.trim() || DEFAULT_TENANT_ID;
    runWithTenant(tenantId, () => {
      try {
        this.registerUsage('conversations', 1);
        this.registerUsage('apiRequests', 1);
      } catch {
        /* no tumbar el bus */
      }
    });
  }
}

function buildWarnings(
  plan: PlanDto,
  byMetric: Partial<Record<BillingMetric, number>>,
): LimitWarning[] {
  const out: LimitWarning[] = [];
  for (const metric of BILLING_METRICS) {
    const used = byMetric[metric] ?? 0;
    const warning = buildWarning(metric, plan.limits[metric], used);
    if (warning.level !== 'ok') out.push(warning);
  }
  return out;
}

function buildWarning(
  metric: BillingMetric,
  limit: number,
  used: number,
): LimitWarning {
  if (limit < 0) {
    return {
      metric,
      limit,
      used,
      ratio: 0,
      level: 'ok',
      message: 'Ilimitado',
    };
  }
  if (limit === 0) {
    const exceeded = used > 0;
    return {
      metric,
      limit,
      used,
      ratio: exceeded ? 1 : 0,
      level: exceeded ? 'exceeded' : 'ok',
      message: exceeded
        ? `Límite de ${metric} alcanzado (plan no incluye esta métrica)`
        : `Sin cuota para ${metric}`,
    };
  }
  const ratio = used / limit;
  if (ratio >= 1) {
    return {
      metric,
      limit,
      used,
      ratio,
      level: 'exceeded',
      message: `Has superado el límite de ${metric} (${used}/${limit})`,
    };
  }
  if (ratio >= 0.8) {
    return {
      metric,
      limit,
      used,
      ratio,
      level: 'warning',
      message: `Te acercas al límite de ${metric} (${used}/${limit})`,
    };
  }
  return {
    metric,
    limit,
    used,
    ratio,
    level: 'ok',
    message: 'Dentro del límite',
  };
}
