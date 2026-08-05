import { apiFetch } from './http'

export const API_KEY_PERMISSIONS = [
  'read',
  'write',
  'admin',
  'analytics',
  'knowledge',
  'automation',
  'workflow',
  'billing',
  'marketplace',
  'integrations',
  'copilot',
] as const

export interface ApiKeyDto {
  id: string
  tenantId: string
  name: string
  keyPrefix: string
  permissions: string[]
  enabled: boolean
  lastUsedAt: string | null
  createdAt: string
}

export interface ApiKeyCreatedDto {
  key: ApiKeyDto
  secret: string
}

export interface ApiRequestDto {
  id: string
  tenantId: string
  apiKeyId: string
  endpoint: string
  method: string
  status: number
  latencyMs: number
  createdAt: string
}

export interface DeveloperUsageStats {
  totalRequests: number
  errorCount: number
  avgLatencyMs: number
  byEndpoint: Array<{ endpoint: string; count: number; avgLatencyMs: number }>
  byApiKey: Array<{ apiKeyId: string; count: number; errors: number }>
}

export interface SdkCatalogItem {
  language: string
  name: string
  version: string
  status: 'ready' | 'planned'
  install: string
  docsUrl: string
}

export interface DeveloperDocsDto {
  baseUrl: string
  authHeader: string
  sdks: SdkCatalogItem[]
  examples: Array<{ language: string; title: string; code: string }>
  permissions: string[]
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function fetchDeveloperKeys(): Promise<{
  keys: ApiKeyDto[]
  total: number
}> {
  const res = await apiFetch('/api/developer/keys')
  return parseJson(res)
}

export async function createDeveloperKey(input: {
  name: string
  permissions?: string[]
  enabled?: boolean
}): Promise<ApiKeyCreatedDto> {
  const res = await apiFetch('/api/developer/keys', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return parseJson(res)
}

export async function updateDeveloperKey(
  id: string,
  input: { name?: string; permissions?: string[]; enabled?: boolean },
): Promise<ApiKeyDto> {
  const res = await apiFetch(`/api/developer/keys/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return parseJson(res)
}

export async function deleteDeveloperKey(id: string): Promise<void> {
  const res = await apiFetch(`/api/developer/keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}

export async function rotateDeveloperKey(
  id: string,
): Promise<ApiKeyCreatedDto> {
  const res = await apiFetch(
    `/api/developer/keys/${encodeURIComponent(id)}/rotate`,
    { method: 'POST' },
  )
  return parseJson(res)
}

export async function fetchDeveloperRequests(params?: {
  apiKeyId?: string
  limit?: number
}): Promise<{
  requests: ApiRequestDto[]
  total: number
  usage: DeveloperUsageStats
}> {
  const qs = new URLSearchParams()
  if (params?.apiKeyId) qs.set('apiKeyId', params.apiKeyId)
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  const q = qs.toString()
  const res = await apiFetch(`/api/developer/requests${q ? `?${q}` : ''}`)
  return parseJson(res)
}

export async function fetchDeveloperSdk(): Promise<DeveloperDocsDto> {
  const res = await apiFetch('/api/developer/sdk')
  return parseJson(res)
}
