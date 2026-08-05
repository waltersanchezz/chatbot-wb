import { apiFetch } from './http'

export const CONNECTOR_CATEGORIES = [
  'Messaging',
  'Email',
  'Chat',
  'Webhook',
  'Productivity',
  'Calendar',
  'Payments',
  'Commerce',
  'AI',
  'Automation',
  'Other',
] as const

export const CONNECTOR_PROVIDERS = [
  'whatsapp',
  'telegram',
  'email',
  'slack',
  'discord',
  'webhook',
  'google_sheets',
  'google_calendar',
] as const

export type ConnectorHealthStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'ERROR'
  | 'PENDING'

export interface ConnectorDto {
  id: string
  tenantId: string
  provider: string
  name: string
  category: string
  enabled: boolean
  config: Record<string, unknown>
  status: ConnectorHealthStatus
  createdAt: string
  updatedAt: string
}

export interface ConnectorLogDto {
  id: string
  tenantId: string
  connectorId: string
  event: string
  status: string
  message: string
  createdAt: string
}

export interface ConnectorActionResult {
  connector: ConnectorDto
  health: {
    status: ConnectorHealthStatus
    message: string
    checkedAt: string
  }
  log: ConnectorLogDto
}

export interface ConnectorListFilters {
  q?: string
  category?: string
  provider?: string
  enabled?: boolean
  status?: string
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchConnectors(
  filters: ConnectorListFilters = {},
): Promise<{ connectors: ConnectorDto[]; total: number }> {
  const params = new URLSearchParams()
  if (filters.q) params.set('q', filters.q)
  if (filters.category) params.set('category', filters.category)
  if (filters.provider) params.set('provider', filters.provider)
  if (filters.status) params.set('status', filters.status)
  if (typeof filters.enabled === 'boolean') {
    params.set('enabled', String(filters.enabled))
  }
  const qs = params.toString()
  const res = await apiFetch(`/api/connectors${qs ? `?${qs}` : ''}`)
  return parseJson(res)
}

export async function fetchConnector(id: string): Promise<ConnectorDto> {
  const res = await apiFetch(`/api/connectors/${encodeURIComponent(id)}`)
  return parseJson(res)
}

export async function createConnector(input: {
  provider: string
  name: string
  category?: string
  enabled?: boolean
  config?: Record<string, unknown>
}): Promise<ConnectorDto> {
  const res = await apiFetch('/api/connectors', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return parseJson(res)
}

export async function updateConnector(
  id: string,
  input: {
    name?: string
    category?: string
    enabled?: boolean
    config?: Record<string, unknown>
    status?: string
  },
): Promise<ConnectorDto> {
  const res = await apiFetch(`/api/connectors/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return parseJson(res)
}

export async function deleteConnector(id: string): Promise<void> {
  const res = await apiFetch(`/api/connectors/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

export async function connectConnector(
  id: string,
): Promise<ConnectorActionResult> {
  const res = await apiFetch(
    `/api/connectors/${encodeURIComponent(id)}/connect`,
    { method: 'POST' },
  )
  return parseJson(res)
}

export async function disconnectConnector(
  id: string,
): Promise<ConnectorActionResult> {
  const res = await apiFetch(
    `/api/connectors/${encodeURIComponent(id)}/disconnect`,
    { method: 'POST' },
  )
  return parseJson(res)
}

export async function testConnector(
  id: string,
): Promise<ConnectorActionResult> {
  const res = await apiFetch(
    `/api/connectors/${encodeURIComponent(id)}/test`,
    { method: 'POST' },
  )
  return parseJson(res)
}

export async function fetchConnectorLogs(options?: {
  connectorId?: string
  limit?: number
}): Promise<{ logs: ConnectorLogDto[]; total: number }> {
  const params = new URLSearchParams()
  if (options?.connectorId) params.set('connectorId', options.connectorId)
  if (options?.limit !== undefined) {
    params.set('limit', String(options.limit))
  }
  const qs = params.toString()
  const res = await apiFetch(`/api/connectors/logs${qs ? `?${qs}` : ''}`)
  return parseJson(res)
}
