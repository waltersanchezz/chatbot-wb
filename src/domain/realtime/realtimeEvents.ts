/**
 * Eventos SSE del Dashboard (Sprint 8) + triggers de automatización (Sprint 14).
 * Independientes de motores de dominio (SalesFlow, Knowledge, etc.).
 */

export const REALTIME_EVENT_TYPES = [
  'conversation.created',
  'conversation.updated',
  'conversation.closed',
  'client.created',
  'lead.updated',
  'pipeline.updated',
  'task.updated',
  'task.created',
  'analytics.updated',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number];

export interface RealtimeEventPayload {
  conversationId?: string;
  waId?: string;
  tenantId?: string;
  at: string;
  /** Contexto opcional para AutomationService (sin tocar ConversationEngine). */
  leadScore?: number | null;
  salesFlowState?: string | null;
  idleMinutes?: number | null;
  idleHours?: number | null;
  vehicle?: string | null;
  brand?: string | null;
  reference?: string | null;
  accepted?: boolean | null;
  abandoned?: boolean | null;
  customerType?: string | null;
}

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: RealtimeEventPayload;
}
