import { apiFetch } from './http'

export type ObservabilityHealthStatus =
  | 'ONLINE'
  | 'DEGRADED'
  | 'OFFLINE'
  | 'ERROR'

export interface HealthCheckDto {
  id: string
  component: string
  status: ObservabilityHealthStatus
  latencyMs: number
  details: Record<string, unknown>
  checkedAt: string
}

export interface SystemLogDto {
  id: string
  tenantId: string
  level: string
  module: string
  event: string
  message: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuditLogDto {
  id: string
  tenantId: string
  userId: string | null
  action: string
  resource: string
  resourceId: string | null
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  createdAt: string
}

export interface MetricDto {
  id: string
  tenantId: string
  metric: string
  value: number
  unit: string
  recordedAt: string
}

export interface SystemOverviewDto {
  status: ObservabilityHealthStatus
  uptimeMs: number
  uptimeLabel: string
  components: HealthCheckDto[]
  recentErrors: SystemLogDto[]
  metricsSummary: Array<{ metric: string; value: number; unit: string }>
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number }
  cpu: { available: boolean; userMs: number; systemMs: number }
  counts: {
    logs: number
    audits: number
    metrics: number
    healthChecks: number
  }
  checkedAt: string
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchObservabilityHealth(): Promise<{
  status: ObservabilityHealthStatus
  components: HealthCheckDto[]
}> {
  const res = await apiFetch('/api/observability/health')
  return parseJson(res)
}

export async function runObservabilityHealthCheck(): Promise<{
  status: ObservabilityHealthStatus
  components: HealthCheckDto[]
}> {
  const res = await apiFetch('/api/observability/health/check', {
    method: 'POST',
  })
  return parseJson(res)
}

export async function fetchObservabilityLogs(params?: {
  level?: string
  module?: string
  q?: string
  limit?: number
}): Promise<{ logs: SystemLogDto[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.level) qs.set('level', params.level)
  if (params?.module) qs.set('module', params.module)
  if (params?.q) qs.set('q', params.q)
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  const q = qs.toString()
  const res = await apiFetch(`/api/observability/logs${q ? `?${q}` : ''}`)
  return parseJson(res)
}

export async function fetchObservabilityAudit(params?: {
  userId?: string
  action?: string
  resource?: string
  limit?: number
}): Promise<{ audits: AuditLogDto[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.userId) qs.set('userId', params.userId)
  if (params?.action) qs.set('action', params.action)
  if (params?.resource) qs.set('resource', params.resource)
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  const q = qs.toString()
  const res = await apiFetch(`/api/observability/audit${q ? `?${q}` : ''}`)
  return parseJson(res)
}

export async function fetchObservabilityMetrics(params?: {
  metric?: string
  limit?: number
}): Promise<{ metrics: MetricDto[]; total: number }> {
  const qs = new URLSearchParams()
  if (params?.metric) qs.set('metric', params.metric)
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  const q = qs.toString()
  const res = await apiFetch(`/api/observability/metrics${q ? `?${q}` : ''}`)
  return parseJson(res)
}

export async function fetchObservabilitySystem(): Promise<SystemOverviewDto> {
  const res = await apiFetch('/api/observability/system')
  return parseJson(res)
}
