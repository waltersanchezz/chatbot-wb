import type { ConversationContext } from '../entities/Conversation';
import type { SalesFlowState } from '../sales/salesFlow';

/**
 * Snapshot recuperable de una conversación (independiente del TTL de sesión HTTP).
 */
export interface ConversationMemorySummary {
  vehicleLabel: string;
  primaryReference?: string;
  references: string[];
  salesState?: SalesFlowState;
  lastTechnicalQuestion?: string;
  lastTechnicalAnswer?: string;
}

export interface ConversationMemorySnapshot {
  memoryKey: string;
  customerId: string;
  savedAt: number;
  expiresAt: number;
  context: ConversationContext;
  summary: ConversationMemorySummary;
}

export interface ConversationMemoryOptions {
  /** TTL por defecto al guardar (ms). */
  defaultTtlMs?: number;
  /** Reloj inyectable (tests). */
  now?: () => number;
}
