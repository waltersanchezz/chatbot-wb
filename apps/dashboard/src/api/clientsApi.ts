import { apiFetch } from './http'

export interface ClientDto {
  id: string
  nombre: string | null
  waId: string
  cantidadConversaciones: number
  primerContacto: string
  ultimaActividad: string
  cantidadVehiculos: number
  ultimoVehiculo: string | null
  leadPromedio: number | null
  ultimaReferencia: string | null
  estadoUltimaConversacion: string
}

export interface ClientListDto {
  items: ClientDto[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  query: string | null
  sortBy:
    | 'ultimaActividad'
    | 'primerContacto'
    | 'leadPromedio'
    | 'cantidadConversaciones'
  sortOrder: 'asc' | 'desc'
}

export interface ClientsQuery {
  page?: number
  pageSize?: number
  q?: string
  sortBy?: ClientListDto['sortBy']
  sortOrder?: 'asc' | 'desc'
}

export interface ClientVehicleDto {
  label: string
  brand: string | null
  model: string | null
  year: string | null
}

export interface ClientConversationSummaryDto {
  id: string
  salesFlowState: string
  leadScore: number | null
  recommendedReference: string | null
  updatedAt: string
}

export interface ClientDetailDto {
  id: string
  nombre: string | null
  waId: string
  leadPromedio: number | null
  createdAt: string
  updatedAt: string
  vehiculos: ClientVehicleDto[]
  conversaciones: ClientConversationSummaryDto[]
  referenciasRecomendadas: string[]
}

export async function fetchClients(
  params: ClientsQuery = {},
): Promise<ClientListDto> {
  const search = new URLSearchParams()
  if (params.page) search.set('page', String(params.page))
  if (params.pageSize) search.set('pageSize', String(params.pageSize))
  if (params.q?.trim()) search.set('q', params.q.trim())
  if (params.sortBy) search.set('sortBy', params.sortBy)
  if (params.sortOrder) search.set('sortOrder', params.sortOrder)

  const qs = search.toString()
  const res = await apiFetch(`/api/clients${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new Error(`Clients API ${res.status}`)
  return (await res.json()) as ClientListDto
}

export async function fetchClientDetail(id: string): Promise<ClientDetailDto> {
  const res = await apiFetch(`/api/clients/${encodeURIComponent(id)}`)
  if (res.status === 404) throw new Error('Cliente no encontrado')
  if (!res.ok) throw new Error(`Client detail API ${res.status}`)
  return (await res.json()) as ClientDetailDto
}
