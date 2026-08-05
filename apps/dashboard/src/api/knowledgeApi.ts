import { apiFetch } from './http'

export const KNOWLEDGE_CATEGORIES = [
  'FAQ',
  'Productos',
  'Servicios',
  'Garantías',
  'Instalación',
  'Mantenimiento',
  'Promociones',
  'Otros',
] as const

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number]

export interface KnowledgeItemDto {
  id: string
  tenantId: string
  category: KnowledgeCategory
  title: string
  question: string
  answer: string
  tags: string[]
  priority: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface KnowledgeListResult {
  items: KnowledgeItemDto[]
  total: number
  enabledCount: number
}

export interface KnowledgeCreateInput {
  category?: string
  title: string
  question: string
  answer: string
  tags?: string[]
  priority?: number
  enabled?: boolean
}

export type KnowledgeUpdateInput = Partial<
  Omit<KnowledgeCreateInput, 'title' | 'question' | 'answer'>
> & {
  title?: string
  question?: string
  answer?: string
}

export interface KnowledgeListParams {
  q?: string
  category?: string
  enabled?: boolean
}

function toQuery(params?: KnowledgeListParams): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  if (params.q?.trim()) sp.set('q', params.q.trim())
  if (params.category?.trim()) sp.set('category', params.category.trim())
  if (params.enabled !== undefined) sp.set('enabled', String(params.enabled))
  const q = sp.toString()
  return q ? `?${q}` : ''
}

export async function fetchKnowledge(
  params?: KnowledgeListParams,
): Promise<KnowledgeListResult> {
  const res = await apiFetch(`/api/knowledge${toQuery(params)}`)
  if (!res.ok) throw new Error(`Knowledge API ${res.status}`)
  return (await res.json()) as KnowledgeListResult
}

export async function searchKnowledge(q: string): Promise<KnowledgeItemDto[]> {
  const res = await apiFetch(
    `/api/knowledge/search?q=${encodeURIComponent(q)}`,
  )
  if (!res.ok) throw new Error(`Knowledge search ${res.status}`)
  const data = (await res.json()) as { items: KnowledgeItemDto[] }
  return data.items
}

export async function createKnowledge(
  input: KnowledgeCreateInput,
): Promise<KnowledgeItemDto> {
  const res = await apiFetch('/api/knowledge', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Knowledge create ${res.status}`)
  }
  return (await res.json()) as KnowledgeItemDto
}

export async function updateKnowledge(
  id: string,
  input: KnowledgeUpdateInput,
): Promise<KnowledgeItemDto> {
  const res = await apiFetch(`/api/knowledge/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Knowledge update ${res.status}`)
  }
  return (await res.json()) as KnowledgeItemDto
}

export async function deleteKnowledge(id: string): Promise<void> {
  const res = await apiFetch(`/api/knowledge/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Knowledge delete ${res.status}`)
  }
}

export async function duplicateKnowledge(
  id: string,
): Promise<KnowledgeItemDto> {
  const res = await apiFetch(
    `/api/knowledge/${encodeURIComponent(id)}/duplicate`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`Knowledge duplicate ${res.status}`)
  return (await res.json()) as KnowledgeItemDto
}

export async function importKnowledgeCsv(
  csv: string,
): Promise<{ imported: number; items: KnowledgeItemDto[] }> {
  const res = await apiFetch('/api/knowledge/import', {
    method: 'POST',
    body: JSON.stringify({ csv }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Knowledge import ${res.status}`)
  }
  return (await res.json()) as { imported: number; items: KnowledgeItemDto[] }
}

export async function exportKnowledgeCsv(
  params?: KnowledgeListParams,
): Promise<string> {
  const res = await apiFetch(`/api/knowledge/export${toQuery(params)}`)
  if (!res.ok) throw new Error(`Knowledge export ${res.status}`)
  return res.text()
}
