import type {
  LearningEventDto,
  LearningQueryOptions,
  LearningRecordInput,
  LearningStatsDto,
  RankedItemDto,
} from '../../domain/learning/learningDtos';
import type { Conversation, ConversationContext } from '../../domain/entities/Conversation';
import type { LearningRepository } from '../../domain/ports/LearningRepository';

/**
 * Learning Engine del producto.
 * Registra señales de uso y expone rankings/estadísticas vía DTOs.
 * No usa APIs externas ni modifica motores de recomendación.
 */
export class LearningEngine {
  constructor(
    private readonly repository: LearningRepository,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Registro automático tras un turno de ConversationEngine.
   */
  recordTurn(input: {
    conversation: Conversation;
    context: ConversationContext;
    previousContext?: ConversationContext;
    userMessage?: string;
  }): LearningEventDto {
    const { conversation, context, previousContext, userMessage } = input;
    const sales = context.salesFlow;
    const prevSales = previousContext?.salesFlow;

    const accepted = detectAcceptance(prevSales?.state, sales?.state, userMessage);
    const abandoned = detectAbandonment(context, previousContext, accepted);

    const technicalQuestion =
      context.lastTechnicalQuestion &&
      context.lastTechnicalQuestion !== previousContext?.lastTechnicalQuestion
        ? context.lastTechnicalQuestion
        : null;

    const question =
      !technicalQuestion && shouldTrackQuestion(userMessage, context)
        ? userMessage!.trim()
        : null;

    const durationMs = Math.max(
      0,
      this.now() - conversation.createdAt.getTime(),
    );

    const payload: LearningRecordInput = {
      conversationId: conversation.id,
      waId: conversation.externalId,
      brand: context.vehicle.brand ?? sales?.vehicle.brand ?? null,
      model: context.vehicle.model ?? sales?.vehicle.model ?? null,
      year: context.vehicle.year ?? sales?.vehicle.year ?? null,
      reference:
        context.lastRecommendedReference ??
        context.lastRecommendedReferences?.[0] ??
        null,
      matchKind: sales?.matchKind ?? null,
      intent: context.intent ?? null,
      question,
      technicalQuestion,
      accepted,
      abandoned,
      durationMs,
      timestamp: this.now(),
      salesState: sales?.state ?? null,
    };

    return this.repository.record(payload);
  }

  /** Registro directo (tests / jobs). */
  record(event: LearningRecordInput): LearningEventDto {
    return this.repository.record({
      ...event,
      timestamp: event.timestamp ?? this.now(),
    });
  }

  topVehicles(options?: LearningQueryOptions): RankedItemDto[] {
    return this.repository.topVehicles(options);
  }

  topReferences(options?: LearningQueryOptions): RankedItemDto[] {
    return this.repository.topReferences(options);
  }

  topBrands(options?: LearningQueryOptions): RankedItemDto[] {
    return this.repository.topBrands(options);
  }

  topQuestions(options?: LearningQueryOptions): RankedItemDto[] {
    return this.repository.topQuestions(options);
  }

  topTechnicalQuestions(options?: LearningQueryOptions): RankedItemDto[] {
    return this.repository.topTechnicalQuestions(options);
  }

  topRecommendations(options?: LearningQueryOptions): RankedItemDto[] {
    return this.repository.topRecommendations(options);
  }

  finishedConversations(): number {
    return this.repository.finishedConversations();
  }

  abandonedConversations(): number {
    return this.repository.abandonedConversations();
  }

  averageDurationMs(): number {
    return this.repository.averageDurationMs();
  }

  getStats(options?: LearningQueryOptions): LearningStatsDto {
    return this.repository.getStats(options);
  }

  count(): number {
    return this.repository.count();
  }

  listEvents(options?: LearningQueryOptions): LearningEventDto[] {
    return this.repository.listEvents(options);
  }
}

function detectAcceptance(
  previousState: string | undefined,
  currentState: string | undefined,
  userMessage?: string,
): boolean | null {
  if (
    previousState === 'WAITING_CONFIRMATION' &&
    currentState === 'READY_FOR_ADVISOR'
  ) {
    return true;
  }
  if (
    previousState === 'WAITING_CONFIRMATION' &&
    currentState &&
    currentState !== 'WAITING_CONFIRMATION' &&
    currentState !== 'READY_FOR_ADVISOR'
  ) {
    return false;
  }
  if (currentState === 'READY_FOR_ADVISOR' && previousState !== 'READY_FOR_ADVISOR') {
    return true;
  }
  // Sí/no explícito no basta solo: el estado manda.
  void userMessage;
  return null;
}

function detectAbandonment(
  context: ConversationContext,
  previousContext: ConversationContext | undefined,
  accepted: boolean | null,
): boolean {
  if (accepted === true) return false;

  if (context.salesFlow?.state === 'CLOSED') {
    return true;
  }

  // Reinicio / decline de recovery: se perdió progreso previo.
  if (
    previousContext &&
    (previousContext.salesFlow || previousContext.vehicle.brand) &&
    !context.salesFlow &&
    !context.vehicle.brand?.trim() &&
    !context.recoveryOfferPending
  ) {
    return true;
  }

  return false;
}

function shouldTrackQuestion(
  userMessage: string | undefined,
  context: ConversationContext,
): boolean {
  if (!userMessage?.trim()) return false;
  const t = userMessage.trim();
  if (t.length < 3) return false;
  if (/^(si|sí|no|ok|hola|hey|hi|hello)\b/i.test(t)) return false;
  if (/^\d{4}$/.test(t)) return false;
  // Evitar ruido de selección de categoría corta.
  if (/^(bater[ií]a|baterias|rodamiento)/i.test(t) && t.length < 12) return false;
  void context;
  return true;
}
