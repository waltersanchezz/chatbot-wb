import { apiFetch } from './http'
import { phoneDigits } from '../lib/operatorDisplay'

export interface ConversationListItemDto {
  id: string
  customerName: string | null
  phone: string
  vehicle: string | null
  year: string | null
  recommendedReference: string | null
  salesFlowState: string
  leadScore: number | null
  createdAt: string
  lastActivityAt: string
}

export interface ConversationListDto {
  items: ConversationListItemDto[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  query: string | null
  sortBy: 'createdAt' | 'lastActivityAt'
  sortOrder: 'asc' | 'desc'
}

export interface ConversationsQuery {
  page?: number
  pageSize?: number
  q?: string
  sortBy?: 'createdAt' | 'lastActivityAt'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Lista real de conversaciones (backend SQLite).
 * No hay fallback a mocks: si falla, el caller muestra error/vacío.
 */
export async function fetchConversations(
  params: ConversationsQuery = {},
): Promise<ConversationListDto> {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.pageSize) search.set('pageSize', String(params.pageSize))
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.sortBy) search.set('sortBy', params.sortBy)
  if (params.sortOrder) search.set('sortOrder', params.sortOrder)

  const qs = search.toString()
  const res = await apiFetch(`/api/conversations${qs ? `?${qs}` : ''}`)
  if (!res.ok) {
    throw new Error(`Conversations API ${res.status}`)
  }
  const body = (await res.json()) as Partial<ConversationListDto>
  if (!body || !Array.isArray(body.items)) {
    throw new Error('Conversations API: respuesta inválida')
  }
  return {
    items: body.items,
    page: body.page ?? params.page ?? 1,
    pageSize: body.pageSize ?? params.pageSize ?? 20,
    total: body.total ?? body.items.length,
    totalPages: body.totalPages ?? 1,
    query: body.query ?? null,
    sortBy: body.sortBy ?? params.sortBy ?? 'lastActivityAt',
    sortOrder: body.sortOrder ?? params.sortOrder ?? 'desc',
  }
}

export type ConversationMessageSender = 'bot' | 'customer'

export interface ConversationTimelineMessageDto {
  id: string
  sender: ConversationMessageSender
  text: string
  timestamp: string
}

export interface ConversationDetailDto {
  id: string
  customerName: string | null
  waId: string
  vehicle: string | null
  year: string | null
  soundSystem: boolean | null
  recommendedReference: string | null
  amperage: string | null
  caseType: string | null
  matchKind: string | null
  leadScore: number | null
  salesFlowState: string
  createdAt: string
  updatedAt: string
  timeline: ConversationTimelineMessageDto[]
}

export async function fetchConversationDetail(
  id: string,
): Promise<ConversationDetailDto> {
  const res = await apiFetch(`/api/conversations/${encodeURIComponent(id)}`)
  if (res.status === 404) {
    throw new Error('Conversación no encontrada')
  }
  if (!res.ok) {
    throw new Error(`Conversation detail API ${res.status}`)
  }
  return (await res.json()) as ConversationDetailDto
}

/** Construye enlace wa.me a partir del waId persistido (wa: / whatsapp: / +57…). */
export function buildWhatsAppLink(waId: string): string {
  const digits = phoneDigits(waId)
  if (digits.length < 8) return '#'
  return `https://wa.me/${digits}`
}
