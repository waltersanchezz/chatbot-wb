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
  recommendedReference: string | null;
  matchKind: string | null;
  leadScore: number | null;
  salesFlowState: string;
  createdAt: string;
  updatedAt: string;
  timeline: ConversationTimelineMessageDto[];
}
