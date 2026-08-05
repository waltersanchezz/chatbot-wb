import type { EventBus } from '../../domain/realtime/EventBus';
import type {
  RealtimeEventPayload,
  RealtimeEventType,
} from '../../domain/realtime/realtimeEvents';

export interface TurnCompletedInput {
  conversationId: string;
  waId: string;
  /** Primer turno de la conversación (mensaje entrante único). */
  createdConversation: boolean;
  /** Tenant activo (desde TenantContext). Opcional por compatibilidad. */
  tenantId?: string;
}

/**
 * Publica eventos de dashboard tras un turno.
 * No conoce SalesFlow / Knowledge / Recommendation.
 */
export class RealtimeService {
  constructor(
    private readonly bus: EventBus,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Llamado por ConversationEngine al terminar un turno exitoso. */
  onTurnCompleted(input: TurnCompletedInput): void {
    const base: RealtimeEventPayload = {
      conversationId: input.conversationId,
      waId: input.waId,
      tenantId: input.tenantId,
      at: new Date(this.now()).toISOString(),
    };

    if (input.createdConversation) {
      this.emit('conversation.created', base);
      this.emit('client.created', base);
      this.emit('task.created', base);
    } else {
      this.emit('conversation.updated', base);
    }

    this.emit('pipeline.updated', base);
    this.emit('task.updated', base);
    this.emit('analytics.updated', base);
  }

  /** Publicación directa (pruebas / herramientas). */
  emit(type: RealtimeEventType, payload?: Partial<RealtimeEventPayload>): void {
    this.bus.publish({
      type,
      payload: {
        at: new Date(this.now()).toISOString(),
        ...payload,
      },
    });
  }
}
