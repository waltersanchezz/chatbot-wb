/**
 * Campos obligatorios del logging estructurado por turno de conversación.
 * Un solo log de cierre por turno (sin duplicar).
 */
export interface TurnLogFields {
  requestId: string;
  conversationId: string;
  waId: string | null;
  stage: string | null;
  intent: string | null;
  durationMs: number;
}

export function buildTurnLogFields(input: {
  requestId: string;
  conversationId?: string;
  waId?: string | null;
  stage?: string | null;
  intent?: string | null;
  durationMs: number;
}): TurnLogFields {
  return {
    requestId: input.requestId,
    conversationId: input.conversationId ?? 'unknown',
    waId: input.waId ?? null,
    stage: input.stage ?? null,
    intent: input.intent ?? null,
    durationMs: input.durationMs,
  };
}
