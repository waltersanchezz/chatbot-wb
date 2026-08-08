/**
 * DTOs de GET /api/conversations/:id
 */

export type ConversationMessageSender = 'bot' | 'customer';

export interface ConversationTimelineMessageDto {
  id: string;
  sender: ConversationMessageSender;
  text: string;
  timestamp: string;
}

export interface ConversationDetailDto {
  id: string;
  customerName: string | null;
  waId: string;
  vehicle: string | null;
  year: string | null;
  /** Planta de sonido / amplificador (salesFlow o battery context). */
  soundSystem: boolean | null;
  recommendedReference: string | null;
  /** Capacidad / CCA desde ficha Willard de la referencia, si existe. */
  amperage: string | null;
  /** Línea / tipo de caja Willard (p.ej. Willard AGM). */
  caseType: string | null;
  matchKind: string | null;
  leadScore: number | null;
  /** Estado del flujo comercial (SalesFlow), solo lectura. */
  salesFlowState: string;
  createdAt: string;
  updatedAt: string;
  timeline: ConversationTimelineMessageDto[];
}
