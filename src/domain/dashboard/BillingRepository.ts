import type {
  BillingEventDto,
  BillingMetric,
  PlanDto,
  SubscriptionDto,
  SubscriptionUpdateInput,
  UsageMetricDto,
} from './billingDto';

export interface BillingRepository {
  listPlans(): PlanDto[];
  getPlan(planId: string): PlanDto | null;
  ensureSeedPlans(): void;

  getSubscription(): SubscriptionDto;
  updateSubscription(input: SubscriptionUpdateInput): SubscriptionDto;

  getUsage(period?: string): UsageMetricDto[];
  registerUsage(
    metric: BillingMetric,
    delta: number,
    period?: string,
  ): UsageMetricDto;

  appendEvent(type: string, payload?: Record<string, unknown>): BillingEventDto;
  listEvents(limit?: number): BillingEventDto[];
}
