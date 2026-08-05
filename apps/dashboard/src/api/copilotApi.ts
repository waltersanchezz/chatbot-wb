import { apiFetch } from './http'

export type CopilotIntent =
  | 'taller'
  | 'veterinaria'
  | 'inmobiliaria'
  | 'restaurante'
  | 'ferreteria'
  | 'personalizada'

export type CopilotSessionStatus = 'draft' | 'ready' | 'applied' | 'failed'

export interface CopilotGeneratedResponse {
  intent: CopilotIntent
  industry: string
  summary: string
  payload: Record<string, unknown>
  suggestedMarketplaceTemplateId?: string | null
  marketplaceTemplate?: {
    name: string
    category: string
    description: string
  } | null
}

export interface CopilotSessionDto {
  id: string
  tenantId: string
  prompt: string
  response: CopilotGeneratedResponse
  status: CopilotSessionStatus
  createdAt: string
  updatedAt: string
}

export interface CopilotTemplateDto {
  id: string
  tenantId: string
  type: string
  payload: CopilotGeneratedResponse
  createdAt: string
}

export interface CopilotApplyResult {
  session: CopilotSessionDto
  applied: {
    knowledge: number
    automations: number
    workflows: number
    company: boolean
    marketplaceInstalled: boolean
    pipeline: boolean
    widgets: number
  }
  template: CopilotTemplateDto | null
  billingWarning: string | null
}

export interface CopilotHistory {
  sessions: CopilotSessionDto[]
  templates: CopilotTemplateDto[]
}

export const COPILOT_SUGGESTIONS = [
  'Crear un taller',
  'Crear una veterinaria',
  'Crear una inmobiliaria',
  'Crear un restaurante',
  'Crear una ferretería',
  'Crear una empresa personalizada',
] as const

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function generateCopilot(
  prompt: string,
): Promise<CopilotSessionDto> {
  const res = await apiFetch('/api/copilot/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  })
  const data = await parseJson<{ session: CopilotSessionDto }>(res)
  return data.session
}

export async function applyCopilot(input: {
  sessionId: string
  response?: CopilotGeneratedResponse
  saveAsTemplate?: boolean
  templateType?: string
  installMarketplace?: boolean
}): Promise<CopilotApplyResult> {
  const res = await apiFetch('/api/copilot/apply', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return parseJson<CopilotApplyResult>(res)
}

export async function fetchCopilotHistory(
  limit?: number,
): Promise<CopilotHistory> {
  const qs =
    limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : ''
  const res = await apiFetch(`/api/copilot/history${qs}`)
  return parseJson<CopilotHistory>(res)
}

export async function deleteCopilotHistory(id: string): Promise<void> {
  const res = await apiFetch(`/api/copilot/history/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
}
