import { apiFetch } from './http'

export type PipelineColumnKey =
  | 'NEW'
  | 'IDENTIFYING'
  | 'RECOMMENDATION_READY'
  | 'WAITING_CONFIRMATION'
  | 'READY_FOR_ADVISOR'
  | 'CLOSED'

export interface PipelineCardDto {
  id: string
  nombre: string | null
  waId: string
  vehiculo: string | null
  referencia: string | null
  leadScore: number | null
  ultimaActividad: string
  salesFlowState: string
}

export interface PipelineColumnDto {
  key: PipelineColumnKey
  label: string
  count: number
  cards: PipelineCardDto[]
}

export interface PipelineDto {
  columns: PipelineColumnDto[]
  totalCards: number
  generatedAt: string
}

export async function fetchPipeline(): Promise<PipelineDto> {
  const res = await apiFetch('/api/pipeline')
  if (!res.ok) throw new Error(`Pipeline API ${res.status}`)
  return (await res.json()) as PipelineDto
}
