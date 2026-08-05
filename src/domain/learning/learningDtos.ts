/**
 * DTOs del Learning Engine.
 * No contienen SQL ni detalles de almacenamiento.
 */

export interface LearningEventDto {
  id: string;
  conversationId: string;
  waId: string;
  brand: string | null;
  model: string | null;
  year: string | null;
  /** Referencia Willard recomendada. */
  reference: string | null;
  matchKind: string | null;
  intent: string | null;
  /** Pregunta / mensaje del turno (no técnica). */
  question: string | null;
  technicalQuestion: string | null;
  /** true = aceptó recomendación; false = rechazó; null = N/A. */
  accepted: boolean | null;
  abandoned: boolean;
  /** Duración de la conversación hasta este evento (ms). */
  durationMs: number;
  timestamp: number;
  salesState: string | null;
}

export interface RankedItemDto {
  key: string;
  label: string;
  count: number;
}

export interface LearningStatsDto {
  totalEvents: number;
  finishedConversations: number;
  abandonedConversations: number;
  averageDurationMs: number;
  topVehicles: RankedItemDto[];
  topReferences: RankedItemDto[];
  topBrands: RankedItemDto[];
  topQuestions: RankedItemDto[];
  topTechnicalQuestions: RankedItemDto[];
  topRecommendations: RankedItemDto[];
}

/** Entrada de registro desde ConversationEngine (sin SQL). */
export interface LearningRecordInput {
  conversationId: string;
  waId: string;
  brand?: string | null;
  model?: string | null;
  year?: string | null;
  reference?: string | null;
  matchKind?: string | null;
  intent?: string | null;
  question?: string | null;
  technicalQuestion?: string | null;
  accepted?: boolean | null;
  abandoned?: boolean;
  durationMs?: number;
  timestamp?: number;
  salesState?: string | null;
}

export interface LearningQueryOptions {
  limit?: number;
}
