import { apiFetch } from './http'

export type TaskPriority = 'Alta' | 'Media' | 'Baja'

export type TaskType =
  | 'Cliente esperando respuesta'
  | 'Cliente listo para asesor'
  | 'Cliente con lead alto'
  | 'Conversación abandonada'
  | 'Seguimiento recomendado'

export interface TaskDto {
  id: string
  tipo: TaskType
  prioridad: TaskPriority
  cliente: string | null
  waId: string
  vehiculo: string | null
  referencia: string | null
  leadScore: number | null
  estado: string
  tiempoDesdeUltimaActividad: string
  ultimaActividad: string
}

export interface TasksDto {
  tasks: TaskDto[]
  total: number
  byPriority: {
    Alta: number
    Media: number
    Baja: number
  }
  generatedAt: string
}

export async function fetchTasks(): Promise<TasksDto> {
  const res = await apiFetch('/api/tasks')
  if (!res.ok) throw new Error(`Tasks API ${res.status}`)
  return (await res.json()) as TasksDto
}
