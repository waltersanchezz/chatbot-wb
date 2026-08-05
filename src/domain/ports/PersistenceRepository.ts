import type { ConversationMemorySnapshot } from '../conversation/conversationMemory';
import type { Conversation } from '../entities/Conversation';
import type { PersistedSession } from '../persistence/persistedSession';

/**
 * Puerto de persistencia del producto.
 * La implementación (SQLite) es detalle de infraestructura.
 * ConversationEngine solo usa save / load / delete.
 */
export interface PersistenceRepository {
  /** Inserta o actualiza la sesión por waId. */
  save(session: PersistedSession): void;

  /**
   * Busca por waId. Si el TTL expiró, elimina y retorna null.
   * Dispara cleanup automático de expirados.
   */
  load(waId: string): PersistedSession | null;

  /** Elimina la sesión (p.ej. reinicio / decline recovery). */
  delete(waId: string): void;

  /**
   * Purge de filas con TTL vencido.
   * También se invoca automáticamente en save/load.
   */
  cleanupExpired(now?: number): number;

  /** Atajo: restaura Conversation de dominio o null. */
  restoreConversation(waId: string): Conversation | null;

  /** Atajo: restaura ConversationMemory snapshot o null. */
  restoreMemory(waId: string): ConversationMemorySnapshot | null;
}
