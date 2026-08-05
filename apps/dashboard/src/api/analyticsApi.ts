import { apiFetch } from './http'

export interface AnalyticsRankedItemDto {
  key: string
  label: string
  count: number
}

export interface AnalyticsDto {
  conversaciones: {
    hoy: number
    semana: number
    mes: number
  }
  leads: {
    generados: number
    listosParaAsesor: number
    abandonados: number
    cerrados: number
  }
  topReferencias: AnalyticsRankedItemDto[]
  topVehiculos: AnalyticsRankedItemDto[]
  topPreguntasTecnicas: AnalyticsRankedItemDto[]
  promedioLeadScore: number
  tiempoPromedioConversacionMs: number
  tiempoPromedioConversacion: string
  tasaAceptacion: number
  generatedAt: string
}

export async function fetchAnalytics(): Promise<AnalyticsDto> {
  const res = await apiFetch('/api/analytics')
  if (!res.ok) throw new Error(`Analytics API ${res.status}`)
  return (await res.json()) as AnalyticsDto
}
