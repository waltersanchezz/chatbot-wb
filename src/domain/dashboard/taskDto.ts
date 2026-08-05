/**
 * DTOs de Task Center API (Dashboard Sprint 6).
 */

export type TaskPriority = 'Alta' | 'Media' | 'Baja';

export type TaskType =
  | 'Cliente esperando respuesta'
  | 'Cliente listo para asesor'
  | 'Cliente con lead alto'
  | 'Conversación abandonada'
  | 'Seguimiento recomendado';

export interface TaskDto {
  id: string;
  tipo: TaskType;
  prioridad: TaskPriority;
  cliente: string | null;
  waId: string;
  vehiculo: string | null;
  referencia: string | null;
  leadScore: number | null;
  estado: string;
  tiempoDesdeUltimaActividad: string;
  /** ISO de última actividad (útil para ordenar / depurar). */
  ultimaActividad: string;
}

export interface TasksDto {
  tasks: TaskDto[];
  total: number;
  byPriority: {
    Alta: number;
    Media: number;
    Baja: number;
  };
  generatedAt: string;
}
