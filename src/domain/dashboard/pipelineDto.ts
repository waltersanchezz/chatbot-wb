/**
 * DTOs de Pipeline API (Dashboard Sprint 5 — Kanban SalesFlow).
 */

export type PipelineColumnKey =
  | 'NEW'
  | 'IDENTIFYING'
  | 'RECOMMENDATION_READY'
  | 'WAITING_CONFIRMATION'
  | 'READY_FOR_ADVISOR'
  | 'CLOSED';

export interface PipelineCardDto {
  id: string;
  nombre: string | null;
  waId: string;
  vehiculo: string | null;
  referencia: string | null;
  leadScore: number | null;
  ultimaActividad: string;
  salesFlowState: string;
}

export interface PipelineColumnDto {
  key: PipelineColumnKey;
  label: string;
  count: number;
  cards: PipelineCardDto[];
}

export interface PipelineDto {
  columns: PipelineColumnDto[];
  totalCards: number;
  generatedAt: string;
}
