import type { ConversationMemorySnapshot } from '../conversation/conversationMemory';
import type {
  Conversation,
  ConversationContext,
  VehicleContext,
} from '../entities/Conversation';
import type { SalesFlowSnapshot } from '../sales/salesFlow';
import type { Channel } from '../../shared/types';
import type { Message, MessageRole } from '../entities/Message';

/**
 * Snapshot durable del producto (independiente de SQLite / canal).
 * Persistido vía PersistenceRepository.
 */
export interface PersistedSession {
  /** Clave de búsqueda (waId / externalId de WhatsApp). */
  waId: string;
  conversationId: string;
  customerId: string;
  channel: Channel;
  /** Estado conversacional (stage / sales state). */
  state: string;
  leadScore: number | null;
  lastRecommendedReference: string | null;
  lastRecommendedReferences: string[];
  lastVehicle: VehicleContext;
  lastTechnicalQuestion: string | null;
  lastTechnicalAnswer: string | null;
  recommendedProductIds: string[];
  salesFlow: SalesFlowSnapshot | null;
  recoveryOfferPending: boolean;
  /** Conversación completa (fechas como ISO string en JSON interno). */
  conversation: PersistedConversation;
  /** Snapshot de ConversationMemory (recovery), si existe. */
  memory: ConversationMemorySnapshot | null;
  savedAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface PersistedMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PersistedConversation {
  id: string;
  customerId: string;
  channel: Channel;
  externalId: string;
  context: ConversationContext;
  messages: PersistedMessage[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface PersistenceRepositoryOptions {
  /** TTL por defecto al guardar (ms). */
  defaultTtlMs?: number;
  /** Reloj inyectable (tests). */
  now?: () => number;
}

/** Convierte Conversation de dominio → forma persistible. */
export function toPersistedConversation(
  conversation: Conversation,
  contextOverride?: ConversationContext,
): PersistedConversation {
  return {
    id: conversation.id,
    customerId: conversation.customerId,
    channel: conversation.channel,
    externalId: conversation.externalId,
    context: structuredClone(contextOverride ?? conversation.context),
    messages: conversation.messages.map((m, index): PersistedMessage => {
      const rawDate = m.createdAt;
      const date =
        rawDate instanceof Date
          ? rawDate
          : new Date(rawDate ?? Date.now());
      const createdAt = Number.isNaN(date.getTime())
        ? new Date().toISOString()
        : date.toISOString();
      return {
        id: m.id || `msg-${index}`,
        conversationId: m.conversationId || conversation.id,
        role: m.role,
        content: m.content,
        createdAt,
        metadata: m.metadata ? structuredClone(m.metadata) : undefined,
      };
    }),
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
    expiresAt: conversation.expiresAt.toISOString(),
  };
}

/** Restaura Conversation de dominio desde persistencia. */
export function fromPersistedConversation(
  persisted: PersistedConversation,
): Conversation {
  return {
    id: persisted.id,
    customerId: persisted.customerId,
    channel: persisted.channel,
    externalId: persisted.externalId,
    context: structuredClone(persisted.context),
    messages: persisted.messages.map(
      (m): Message => ({
        id: m.id,
        conversationId: m.conversationId,
        role: m.role,
        content: m.content,
        createdAt: new Date(m.createdAt),
        metadata: m.metadata ? structuredClone(m.metadata) : undefined,
      }),
    ),
    createdAt: new Date(persisted.createdAt),
    updatedAt: new Date(persisted.updatedAt),
    expiresAt: new Date(persisted.expiresAt),
  };
}

export function buildPersistedSession(input: {
  conversation: Conversation;
  context?: ConversationContext;
  memory?: ConversationMemorySnapshot | null;
  ttlMs: number;
  now?: number;
}): PersistedSession {
  const context = input.context ?? input.conversation.context;
  const now = input.now ?? Date.now();
  const sales = context.salesFlow;
  const state =
    sales?.state ??
    context.stage ??
    (context.recoveryOfferPending ? 'RECOVERY_OFFER' : 'unknown');

  return {
    waId: input.conversation.externalId,
    conversationId: input.conversation.id,
    customerId: input.conversation.customerId,
    channel: input.conversation.channel,
    state,
    leadScore: sales?.leadScore ?? null,
    lastRecommendedReference: context.lastRecommendedReference ?? null,
    lastRecommendedReferences: [
      ...(context.lastRecommendedReferences ?? []),
    ],
    lastVehicle: structuredClone(context.vehicle ?? {}),
    lastTechnicalQuestion: context.lastTechnicalQuestion ?? null,
    lastTechnicalAnswer: context.lastTechnicalAnswer ?? null,
    recommendedProductIds: [...(context.recommendedProductIds ?? [])],
    salesFlow: sales ? structuredClone(sales) : null,
    recoveryOfferPending: Boolean(context.recoveryOfferPending),
    conversation: toPersistedConversation(input.conversation, context),
    memory: input.memory ? structuredClone(input.memory) : null,
    savedAt: now,
    updatedAt: now,
    expiresAt: now + input.ttlMs,
  };
}
