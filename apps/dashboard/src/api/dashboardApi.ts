import { apiFetch } from './http'

export interface DashboardDto {
  conversacionesHoy: number
  clientesActivos: number
  leadsPendientes: number
  conversacionesCerradasHoy: number
  tiempoPromedioConversacionMs: number
  tiempoPromedioConversacion: string
  generatedAt: string
}

/**
 * Cliente del Dashboard API.
 * En dev, Vite proxy → backend Express.
 */
export async function fetchDashboard(): Promise<DashboardDto> {
  const res = await apiFetch('/api/dashboard')
  if (!res.ok) {
    throw new Error(`Dashboard API ${res.status}`)
  }
  return (await res.json()) as DashboardDto
}
