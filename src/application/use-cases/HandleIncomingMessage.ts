import { randomUUID } from 'crypto';
import { createEmptyContext, type Conversation } from '../../domain/entities/Conversation';
import type { ConversationLog } from '../../domain/entities/ConversationLog';
import type { Message } from '../../domain/entities/Message';
import type { ConversationRepository } from '../../domain/ports/ConversationRepository';
import type { CustomerRepository } from '../../domain/ports/CustomerRepository';
import type { LogRepository } from '../../domain/ports/LogRepository';
import type { MessagingProvider } from '../../domain/ports/MessagingProvider';
import { logger } from '../../infrastructure/logging/logger';
import { buildTurnLogFields } from '../../infrastructure/logging/turnContext';
import { whatsappDeliveryAudit } from '../../infrastructure/messaging/WhatsAppDeliveryAudit';
import {
  FRIENDLY_ERROR_REPLY,
  tryCallAsync,
} from '../../shared/result';
import { withTimeout } from '../../shared/timeout';
import type { Channel } from '../../shared/types';
import { WaIdTurnSerializer } from '../concurrency/WaIdTurnSerializer';
import type { ConversationEngine } from '../services/ConversationEngine';
import type { LeadService } from '../services/LeadService';
import type { MetricsService } from '../services/MetricsService';

export interface IncomingMessageInput {
  phone: string;
  text: string;
  channel: Channel;
  externalConversationId?: string;
  customerName?: string;
  sendReply?: boolean;
  /** WhatsApp Cloud API message id (wamid) for idempotency/audit correlation. */
  inboundWamid?: string;
  /** Correlación auditoría / logging estructurado. */
  auditRequestId?: string;
}

export interface IncomingMessageResult {
  conversationId: string;
  customerId: string;
  reply: string;
  needsHumanHandoff: boolean;
  durationMs: number;
  requestId: string;
  /** true si se omitió sendText porque el save falló/timeout. */
  sendSkippedDueToPersistFailure?: boolean;
}

export interface HandleIncomingTimeouts {
  engineMs: number;
  messagingMs: number;
  persistenceMs: number;
  crmMs: number;
}

const DEFAULT_TIMEOUTS: HandleIncomingTimeouts = {
  engineMs: 8_000,
  messagingMs: 6_000,
  persistenceMs: 3_000,
  crmMs: 5_000,
};

const defaultTurnSerializer = new WaIdTurnSerializer();

export class HandleIncomingMessage {
  private readonly timeouts: HandleIncomingTimeouts;
  private readonly turnSerializer: WaIdTurnSerializer;

  constructor(
    private readonly customers: CustomerRepository,
    private readonly conversations: ConversationRepository,
    private readonly logs: LogRepository,
    private readonly engine: ConversationEngine,
    private readonly messaging: MessagingProvider,
    private readonly leadService: LeadService,
    private readonly sessionTtlMinutes: number,
    private readonly metrics: MetricsService,
    timeouts?: Partial<HandleIncomingTimeouts>,
    turnSerializer?: WaIdTurnSerializer,
  ) {
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
    this.turnSerializer = turnSerializer ?? defaultTurnSerializer;
  }

  async execute(input: IncomingMessageInput): Promise<IncomingMessageResult> {
    const waKey =
      input.externalConversationId?.trim() ||
      `${input.channel}:${input.phone}`;

    return this.turnSerializer.run(waKey, () => this.executeTurn(input));
  }

  private async executeTurn(
    input: IncomingMessageInput,
  ): Promise<IncomingMessageResult> {
    const started = Date.now();
    const requestId = input.auditRequestId ?? randomUUID();
    let reply = '';
    let conversation: Conversation | null = null;
    let isNewConversation = false;
    let previousContext = createEmptyContext();

    // TEMP DIAG: traza de entrada — no cambia lógica
    console.log('[DIAG][HandleIncomingMessage.execute] ENTER', {
      waId: input.externalConversationId ?? `${input.channel}:${input.phone}`,
      phone: input.phone,
      channel: input.channel,
      inboundWamid: input.inboundWamid ?? null,
      textPreview: input.text.slice(0, 80),
      requestId,
    });

    if (input.inboundWamid && input.auditRequestId) {
      whatsappDeliveryAudit.recordHandleEnter({
        wamid: input.inboundWamid,
        requestId: input.auditRequestId,
      });
    }

    try {
      const customerOutcome = await withTimeout(
        () =>
          this.customers.findOrCreate(
            input.phone,
            input.channel,
            input.customerName,
          ),
        this.timeouts.persistenceMs,
        {
          service: 'CustomerRepository',
          operation: 'findOrCreate',
          code: 'TIMEOUT',
        },
      );
      if (!customerOutcome.ok) throw customerOutcome.error;
      const customer = customerOutcome.value;

      const externalId =
        input.externalConversationId ?? `${input.channel}:${input.phone}`;

      const findOutcome = await withTimeout(
        () => this.conversations.findByExternalId(externalId),
        this.timeouts.persistenceMs,
        {
          service: 'ConversationRepository',
          operation: 'findByExternalId',
          code: 'TIMEOUT',
        },
      );
      if (!findOutcome.ok) throw findOutcome.error;
      conversation = findOutcome.value;

      const now = new Date();
      if (!conversation || conversation.expiresAt < now) {
        conversation = this.newConversation(
          customer.id,
          input.channel,
          externalId,
          now,
        );
        isNewConversation = true;
      }

      previousContext = { ...conversation.context };
      const inbound: Message = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'customer',
        content: input.text,
        createdAt: now,
        metadata: {
          ...(input.customerName ? { customerName: input.customerName } : {}),
          ...(input.inboundWamid ? { inboundWamid: input.inboundWamid } : {}),
        },
      };
      conversation.messages.push(inbound);

      const engineOutcome = await withTimeout(
        () => this.engine.process(conversation!, input.text),
        this.timeouts.engineMs,
        {
          service: 'ConversationEngine',
          operation: 'process',
          code: 'TIMEOUT',
          meta: { requestId, conversationId: conversation.id },
        },
      );

      if (!engineOutcome.ok) {
        logger.exception(
          'HandleIncomingMessage — engine timeout/error (controlado)',
          engineOutcome.error,
          {
            service: 'ConversationEngine',
            operation: 'process',
            requestId,
            conversationId: conversation.id,
            waId: input.inboundWamid ?? null,
          },
        );
        reply = FRIENDLY_ERROR_REPLY;
        conversation.context = {
          ...conversation.context,
          needsHumanHandoff: true,
          handoffReason:
            conversation.context.handoffReason ?? 'Error técnico controlado',
        };
        this.metrics.recordTurn({
          isNewConversation,
          previous: previousContext,
          next: conversation.context,
          isError: true,
        });
      } else {
        reply = engineOutcome.value.reply;
        conversation.context = engineOutcome.value.context;
        this.metrics.recordTurn({
          isNewConversation,
          previous: previousContext,
          next: conversation.context,
          isError: reply === FRIENDLY_ERROR_REPLY,
        });
      }

      const duplicateRecentReply = isDuplicateRecentAssistantReply(
        conversation,
        reply,
      );
      const suppressReply =
        (engineOutcome.ok === true &&
          (engineOutcome.value.suppressReply === true || !reply.trim())) ||
        duplicateRecentReply;

      if (duplicateRecentReply) {
        logger.info('HandleIncomingMessage — outbound duplicate suppressed', {
          requestId,
          conversationId: conversation.id,
          waId: input.inboundWamid ?? null,
          previewLen: reply.trim().length,
        });
      }

      conversation.updatedAt = now;
      conversation.expiresAt = this.expiry(now);

      if (reply.trim() && !suppressReply) {
        const outbound: Message = {
          id: randomUUID(),
          conversationId: conversation.id,
          role: 'assistant',
          content: reply,
          createdAt: new Date(),
          metadata: input.inboundWamid
            ? { inboundWamid: input.inboundWamid }
            : undefined,
        };
        conversation.messages.push(outbound);
      }

      const saveOutcome = await withTimeout(
        () => this.conversations.save(conversation!),
        this.timeouts.persistenceMs,
        {
          service: 'ConversationRepository',
          operation: 'save',
          code: 'TIMEOUT',
        },
      );
      // TEMP DIAG: resultado del save post-turno
      console.log('[DIAG][HandleIncomingMessage.execute] AFTER conversations.save', {
        waId: conversation.externalId,
        conversationId: conversation.id,
        saveOk: saveOutcome.ok,
        saveError: saveOutcome.ok
          ? null
          : saveOutcome.error instanceof Error
            ? saveOutcome.error.message
            : String(saveOutcome.error),
      });
      if (!saveOutcome.ok) {
        logger.exception(
          'HandleIncomingMessage — save timeout/error; sendText bloqueado',
          saveOutcome.error,
          { requestId, conversationId: conversation.id },
        );

        const durationMs = Date.now() - started;
        if (input.inboundWamid && input.auditRequestId) {
          whatsappDeliveryAudit.recordHandleExit({
            wamid: input.inboundWamid,
            requestId: input.auditRequestId,
            durationMs,
            ok: false,
            error: 'persist_failed_before_send',
          });
        }

        logger.turn(
          buildTurnLogFields({
            requestId,
            conversationId: conversation.id,
            waId: input.inboundWamid,
            stage: conversation.context.stage,
            intent: conversation.context.intent,
            durationMs,
          }),
          { ok: false, error: 'persist_failed_before_send' },
        );

        return {
          conversationId: conversation.id,
          customerId: customer.id,
          reply,
          needsHumanHandoff: conversation.context.needsHumanHandoff,
          durationMs,
          requestId,
          sendSkippedDueToPersistFailure: true,
        };
      }

      if (input.sendReply !== false && !suppressReply) {
        const sendOutcome = await withTimeout(
          () =>
            this.messaging.sendText({
              to: input.phone,
              body: reply,
              channel: input.channel,
              inboundWamid: input.inboundWamid,
              auditRequestId: requestId,
              conversationId: conversation!.id,
            }),
          this.timeouts.messagingMs,
          {
            service: 'MessagingProvider',
            operation: 'sendText',
            code: 'TIMEOUT',
            meta: { requestId, waId: input.inboundWamid },
          },
        );
        if (!sendOutcome.ok) {
          logger.exception(
            'HandleIncomingMessage — messaging timeout/error (controlado)',
            sendOutcome.error,
            {
              requestId,
              conversationId: conversation.id,
              waId: input.inboundWamid ?? null,
            },
          );
        }
      }

      void this.captureLeadSafe({
        conversation,
        phone: input.phone,
        customerId: customer.id,
        customerName: input.customerName ?? customer.name,
        assistantReply: reply,
        requestId,
      });

      const durationMs = Date.now() - started;
      const turnOk = engineOutcome.ok && reply !== FRIENDLY_ERROR_REPLY;

      await this.writeLog({
        conversation,
        customerPhone: input.phone,
        customerId: customer.id,
        inbound: input.text,
        outbound: reply,
        durationMs,
        requestId,
        waId: input.inboundWamid,
      });

      // Único log estructurado de cierre de turno (sin duplicar console.log).
      logger.turn(
        buildTurnLogFields({
          requestId,
          conversationId: conversation.id,
          waId: input.inboundWamid,
          stage: conversation.context.stage,
          intent: conversation.context.intent,
          durationMs,
        }),
        { ok: turnOk },
      );

      if (input.inboundWamid && input.auditRequestId) {
        whatsappDeliveryAudit.recordHandleExit({
          wamid: input.inboundWamid,
          requestId: input.auditRequestId,
          durationMs,
          ok: turnOk,
          error: turnOk ? undefined : 'engine_timeout_or_error',
        });
      }

      return {
        conversationId: conversation.id,
        customerId: customer.id,
        reply,
        needsHumanHandoff: conversation.context.needsHumanHandoff,
        durationMs,
        requestId,
      };
    } catch (err) {
      const durationMs = Date.now() - started;
      const controlled = logger.exception(
        'HandleIncomingMessage — excepción controlada (conversación no se rompe)',
        err,
        {
          service: 'HandleIncomingMessage',
          operation: 'execute',
          requestId,
          conversationId: conversation?.id ?? 'unknown',
          waId: input.inboundWamid ?? null,
          stage: conversation?.context.stage ?? null,
          intent: conversation?.context.intent ?? null,
          durationMs,
        },
      );

      reply = FRIENDLY_ERROR_REPLY;

      let persistOk = false;
      if (conversation) {
        const nextContext = {
          ...conversation.context,
          needsHumanHandoff: true,
          handoffReason:
            conversation.context.handoffReason ?? 'Error técnico controlado',
        };
        this.metrics.recordTurn({
          isNewConversation,
          previous: previousContext,
          next: nextContext,
          isError: true,
        });
        conversation.context = nextContext;
        conversation.messages.push({
          id: randomUUID(),
          conversationId: conversation.id,
          role: 'assistant',
          content: reply,
          createdAt: new Date(),
          metadata: input.inboundWamid
            ? { inboundWamid: input.inboundWamid }
            : undefined,
        });
        const saved = await withTimeout(
          () => this.conversations.save(conversation!),
          this.timeouts.persistenceMs,
          {
            service: 'ConversationRepository',
            operation: 'saveOnError',
            code: 'TIMEOUT',
          },
        );
        persistOk = saved.ok;
        if (!saved.ok) {
          logger.exception(
            'HandleIncomingMessage — no se pudo guardar tras error; sendText bloqueado',
            saved.error,
            { requestId },
          );
        } else {
          // Handoff por error: igual debe crear lead + Telegram (no silencioso).
          void this.captureLeadSafe({
            conversation,
            phone: input.phone,
            customerId: conversation.customerId,
            customerName: input.customerName,
            assistantReply: reply,
            requestId,
          });
        }
      } else {
        // Sin conversación aún: contar error igual.
        this.metrics.increment('errors');
      }

      if (input.sendReply !== false && persistOk) {
        const sendOutcome = await withTimeout(
          () =>
            this.messaging.sendText({
              to: input.phone,
              body: reply,
              channel: input.channel,
              inboundWamid: input.inboundWamid,
              auditRequestId: requestId,
              conversationId: conversation?.id,
            }),
          this.timeouts.messagingMs,
          {
            service: 'MessagingProvider',
            operation: 'sendTextFriendlyError',
            code: 'TIMEOUT',
          },
        );
        if (!sendOutcome.ok) {
          logger.exception(
            'HandleIncomingMessage — fallo enviando mensaje amable',
            sendOutcome.error,
            { requestId },
          );
        }
      }

      if (input.inboundWamid && input.auditRequestId) {
        whatsappDeliveryAudit.recordHandleExit({
          wamid: input.inboundWamid,
          requestId: input.auditRequestId,
          durationMs,
          ok: false,
          error: controlled.message,
        });
      }

      await tryCallAsync(
        () =>
          this.logs.append({
            id: randomUUID(),
            date: new Date(),
            customerId: conversation?.customerId ?? 'unknown',
            customerPhone: input.phone,
            conversationId: conversation?.id ?? 'unknown',
            inboundMessage: input.text,
            outboundResponse: reply,
            durationMs,
            error: controlled.message,
            metadata: {
              requestId,
              waId: input.inboundWamid,
              intent: conversation?.context.intent,
              stage: conversation?.context.stage,
            },
          }),
        {
          service: 'LogRepository',
          operation: 'appendOnError',
          code: 'PERSISTENCE',
        },
      );

      // Un solo cierre estructurado (exception ya registró stack; turn cierra el turno).
      logger.turn(
        buildTurnLogFields({
          requestId,
          conversationId: conversation?.id,
          waId: input.inboundWamid,
          stage: conversation?.context.stage,
          intent: conversation?.context.intent,
          durationMs,
        }),
        { ok: false, error: controlled.message },
      );

      return {
        conversationId: conversation?.id ?? 'unknown',
        customerId: conversation?.customerId ?? 'unknown',
        reply,
        needsHumanHandoff: true,
        durationMs,
        requestId,
        sendSkippedDueToPersistFailure: conversation ? !persistOk : undefined,
      };
    }
  }

  private async captureLeadSafe(params: {
    conversation: Conversation;
    phone: string;
    customerId: string;
    customerName?: string;
    assistantReply: string;
    requestId: string;
  }): Promise<void> {
    const outcome = await withTimeout(
      () =>
        this.leadService.registerFromConversation({
          conversation: params.conversation,
          phone: params.phone,
          customerId: params.customerId,
          customerName: params.customerName,
          assistantReply: params.assistantReply,
        }),
      this.timeouts.crmMs,
      {
        service: 'LeadService',
        operation: 'registerFromConversation',
        code: 'TIMEOUT',
        meta: { requestId: params.requestId },
      },
    );
    if (!outcome.ok) {
      logger.exception(
        'HandleIncomingMessage — CRM/Telegram timeout/error (ignorado para WhatsApp)',
        outcome.error,
        {
          service: 'LeadService',
          operation: 'registerFromConversation',
          requestId: params.requestId,
          conversationId: params.conversation.id,
        },
      );
    }
  }

  private newConversation(
    customerId: string,
    channel: Channel,
    externalId: string,
    now: Date,
  ): Conversation {
    return {
      id: randomUUID(),
      customerId,
      channel,
      externalId,
      context: createEmptyContext(),
      messages: [],
      createdAt: now,
      updatedAt: now,
      expiresAt: this.expiry(now),
    };
  }

  private expiry(from: Date): Date {
    return new Date(from.getTime() + this.sessionTtlMinutes * 60_000);
  }

  private async writeLog(params: {
    conversation: Conversation;
    customerPhone: string;
    customerId: string;
    inbound: string;
    outbound: string;
    durationMs: number;
    requestId: string;
    waId?: string;
  }): Promise<void> {
    const log: ConversationLog = {
      id: randomUUID(),
      date: new Date(),
      customerId: params.customerId,
      customerPhone: params.customerPhone,
      conversationId: params.conversation.id,
      inboundMessage: params.inbound,
      outboundResponse: params.outbound,
      durationMs: params.durationMs,
      metadata: {
        requestId: params.requestId,
        waId: params.waId,
        intent: params.conversation.context.intent,
        stage: params.conversation.context.stage,
        handoff: params.conversation.context.needsHumanHandoff,
      },
    };
    const outcome = await withTimeout(
      () => this.logs.append(log),
      this.timeouts.persistenceMs,
      {
        service: 'LogRepository',
        operation: 'append',
        code: 'TIMEOUT',
      },
    );
    if (!outcome.ok) {
      logger.exception(
        'HandleIncomingMessage — log append timeout/error',
        outcome.error,
        { requestId: params.requestId },
      );
    }
  }
}

/**
 * Evita reenviar el mismo texto del bot si el último outbound es idéntico
 * dentro de la ventana (retries Meta / doble entrega con otro wamid).
 * Defensa secundaria; la primaria es serialización por wa_id + save-before-send.
 * Exportada para tests unitarios.
 */
export function isDuplicateRecentAssistantReply(
  conversation: Conversation,
  reply: string,
  nowMs: number = Date.now(),
  windowMs: number = 3 * 60_000,
): boolean {
  const normalized = reply.trim();
  if (!normalized) return false;

  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    const m = conversation.messages[i]!;
    if (m.role !== 'assistant') continue;
    if (m.content.trim() !== normalized) return false;
    const created = new Date(m.createdAt).getTime();
    if (Number.isNaN(created)) return false;
    const age = nowMs - created;
    return age >= 0 && age < windowMs;
  }
  return false;
}
