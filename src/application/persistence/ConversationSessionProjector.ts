import type { ConversationMemorySnapshot } from '../../domain/conversation/conversationMemory';
import type { Conversation } from '../../domain/entities/Conversation';
import {
  buildPersistedSession,
  type PersistedSession,
} from '../../domain/persistence/persistedSession';

export interface ProjectConversationInput {
  /** Conversación de dominio ya lista para persistir (post-outbound en R2). */
  conversation: Conversation;
  /** Memoria de recovery opcional; la Fase 1 no la inventa. */
  memory?: ConversationMemorySnapshot | null;
  /** Reloj inyectable (tests). */
  now?: number;
}

/**
 * Proyecta Conversation (write model CRM) → PersistedSession (read model Dashboard).
 *
 * Fase 1 (ADR): puro, sin I/O ni DI. Reutiliza buildPersistedSession y fuerza
 * expiresAt = conversation.expiresAt (contrato C4).
 *
 * No escribe SQLite; el cableado al PersistenceRepository es R2.
 */
export class ConversationSessionProjector {
  /**
   * Proyección determinística. No filtra por “progreso comercial”:
   * un saludo también produce sesión proyectable.
   */
  project(input: ProjectConversationInput): PersistedSession {
    const { conversation } = input;
    const now = input.now ?? Date.now();
    const expiresAtMs = conversation.expiresAt.getTime();

    // ttlMs se pasa por compatibilidad con buildPersistedSession; se sobrescribe expiresAt (C4).
    const ttlMs = Math.max(0, expiresAtMs - now);

    const session = buildPersistedSession({
      conversation,
      context: conversation.context,
      memory: input.memory ?? null,
      ttlMs,
      now,
    });

    return {
      ...session,
      waId: conversation.externalId,
      conversationId: conversation.id,
      expiresAt: expiresAtMs,
    };
  }
}

/** Instancia por defecto para tests / uso sin DI (Fase 1). */
export const conversationSessionProjector = new ConversationSessionProjector();

/** Atajo funcional equivalente a projector.project. */
export function projectConversationToSession(
  input: ProjectConversationInput,
): PersistedSession {
  return conversationSessionProjector.project(input);
}
