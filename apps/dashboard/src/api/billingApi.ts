import { apiFetch } from './http'

export interface PlanLimits {
  users: number
  conversations: number
  automations: number
  workflows: number
  integrations: number
  knowledge: number
  clients: number
  storage: number
  apiRequests: number
}

export interface PlanDto {
  id: string
  name: string
  description: string
  monthlyPrice: number
  annualPrice: number
  limits: PlanLimits
  enabled: boolean
}

export interface SubscriptionDto {
  id: string
  tenantId: string
  planId: string
  status: string
  startDate: string
  renewDate: string | null
  cancelDate: string | null
  trialEndsAt: string | null
}

export interface LimitWarning {
  metric: string
  limit: number
  used: number
  ratio: number
  level: 'ok' | 'warning' | 'exceeded'
  message: string
}

export interface UsageSnapshotDto {
  period: string
  byMetric: Partial<Record<string, number>>
  warnings: LimitWarning[]
  metrics: Array<{ metric: string; value: number; period: string }>
}

export interface BillingEventDto {
  id: string
  tenantId: string
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface BillingOverview {
  subscription: SubscriptionDto
  plan: PlanDto
  usage: UsageSnapshotDto
  events: BillingEventDto[]
}

export async function fetchPlans(): Promise<PlanDto[]> {
  const res = await apiFetch('/api/plans')
  if (!res.ok) throw new Error(`Plans ${res.status}`)
  const data = (await res.json()) as { plans: PlanDto[] }
  return data.plans
}

export async function fetchSubscription(): Promise<BillingOverview> {
  const res = await apiFetch('/api/subscription')
  if (!res.ok) throw new Error(`Subscription ${res.status}`)
  return (await res.json()) as BillingOverview
}

export async function updateSubscription(input: {
  planId?: string
  cancel?: boolean
  reactivate?: boolean
  billingCycle?: 'monthly' | 'annual'
}): Promise<{
  subscription: SubscriptionDto
  plan: PlanDto
  usage: UsageSnapshotDto
}> {
  const res = await apiFetch('/api/subscription', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Update ${res.status}`)
  }
  return (await res.json()) as {
    subscription: SubscriptionDto
    plan: PlanDto
    usage: UsageSnapshotDto
  }
}

export async function fetchUsage(): Promise<UsageSnapshotDto> {
  const res = await apiFetch('/api/usage')
  if (!res.ok) throw new Error(`Usage ${res.status}`)
  return (await res.json()) as UsageSnapshotDto
}

export async function fetchBillingEvents(): Promise<BillingEventDto[]> {
  const res = await apiFetch('/api/billing/events?limit=30')
  if (!res.ok) throw new Error(`Events ${res.status}`)
  const data = (await res.json()) as { events: BillingEventDto[] }
  return data.events
}
