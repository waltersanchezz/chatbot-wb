import { createHash, randomUUID } from 'crypto';
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
import type { WhatsAppIdempotencyGate } from '../../infrastructure/messaging/WhatsAppMessageIdempotency';
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

function replyHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

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
  private readonly sendGate: WhatsAppIdempotencyGate | undefined;

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
    sendGate?: WhatsAppIdempotencyGate,
  ) {
    this.timeouts = { ...DEFAULT_TIMEOUTS, ...timeouts };
    this.turnSerializer = turnSerializer ?? defaultTurnSerializer;
    this.sendGate = sendGate;
  }

  async execute(input: IncomingMessageInput): Promise<IncomingMessageResult> {
    const waKey =
      input.externalConversationId?.trim() ||
      `${input.channel}:${input.phone}`;

    return this.turnSerializer.run(waKey, () => this.executeTurn(input));
  }

  /**
   * 1 inboundWamid → máximo 1 sendText (reusa claimOutbound del mismo gate).
   * Sin wamid / sin gate → envío normal (p.ej. /api/chat).
   */
  private async sendTextOnce(
    input: IncomingMessageInput,
    turnId: string,
    body: string,
    conversationId: string | undefined,
    operation: 'sendText' | 'sendTextFriendlyError',
  ): Promise<'sent' | 'skipped_duplicate' | 'failed'> {
    const wamid = input.inboundWamid?.trim();
    if (wamid && this.sendGate) {
      const allowed = this.sendGate.claimOutbound(wamid);
      if (!allowed) {
        console.log(
          `[TURN SEND SKIP] turnId=${turnId} inboundWamid=${wamid} reason=already_sent`,
        );
        logger.info('sendText skipped: outbound already claimed for wamid', {
          turnId,
          inboundWamid: wamid,
        });
        return 'skipped_duplicate';
      }
    }

    const hash = replyHash(body);
    console.log(
      `[TURN SEND] turnId=${turnId} inboundWamid=${wamid ?? 'none'} replyHash=${hash}`,
    );

    const sendOutcome = await withTimeout(
      () =>
        this.messaging.sendText({
          to: input.phone,
          body,
          channel: input.channel,
          inboundWamid: input.inboundWamid,
          auditRequestId: turnId,
          conversationId,
        }),
      this.timeouts.messagingMs,
      {
        service: 'MessagingProvider',
        operation,
        code: 'TIMEOUT',
        meta: { requestId: turnId, waId: input.inboundWamid },
      },
    );

    if (!sendOutcome.ok) {
      logger.exception(
        `HandleIncomingMessage — ${operation} timeout/error (controlado)`,
        sendOutcome.error,
        {
          requestId: turnId,
          conversationId: conversationId ?? null,
          waId: input.inboundWamid ?? null,
        },
      );
      return 'failed';
    }

    // MessagingProvider puede devolver { ok:false } sin lanzar (p.ej. Cloud sin
    // credenciales o Graph API error). No tratarlo como envío exitoso.
    const providerResult = sendOutcome.value;
    if (!providerResult?.ok) {
      logger.error(`HandleIncomingMessage — ${operation} provider returned ok:false`, {
        requestId: turnId,
        conversationId: conversationId ?? null,
        waId: input.inboundWamid ?? null,
      });
      console.log(
        `[TURN SEND FAIL] turnId=${turnId} inboundWamid=${wamid ?? 'none'} reason=provider_ok_false`,
      );
      return 'failed';
    }

    return 'sent';
  }

  private async executeTurn(
    input: IncomingMessageInput,
  ): Promise<IncomingMessageResult> {
    const started = Date.now();
    const turnId = input.auditRequestId ?? randomUUID();
    const requestId = turnId;
    const waId =
      input.externalConversationId ?? `${input.channel}:${input.phone}`;
    let reply = '';
    let conversation: Conversation | null = null;
    let isNewConversation = false;
    let previousContext = createEmptyContext();

    console.log(
      `[TURN START] turnId=${turnId} waId=${waId} inboundWamid=${input.inboundWamid ?? 'none'} text=${JSON.stringify(input.text.slice(0, 120))}`,
    );

    // TEMP DIAG: traza de entrada — no cambia lógica
    console.log('[DIAG][HandleIncomingMessage.execute] ENTER', {
      waId,
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

        console.log(
          `[TURN SAVE FAIL] turnId=${turnId} conversationId=${conversation.id}`,
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

        console.log(
          `[TURN END] turnId=${turnId} ok=false reason=persist_failed_before_send`,
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

      console.log(
        `[TURN SAVE OK] turnId=${turnId} conversationId=${conversation.id}`,
      );

      let sendStatus: 'sent' | 'skipped_duplicate' | 'failed' | 'not_attempted' =
        'not_attempted';
      if (input.sendReply !== false && !suppressReply) {
        sendStatus = await this.sendTextOnce(
          input,
          turnId,
          reply,
          conversation.id,
          'sendText',
        );
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
      const turnOk =
        engineOutcome.ok &&
        reply !== FRIENDLY_ERROR_REPLY &&
        sendStatus !== 'failed';

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

      console.log(`[TURN END] turnId=${turnId} ok=${turnOk}`);

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
        await this.sendTextOnce(
          input,
          turnId,
          reply,
          conversation?.id,
          'sendTextFriendlyError',
        );
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

      console.log(
        `[TURN END] turnId=${turnId} ok=false reason=controlled_exception`,
      );

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
 * Evita reenviar el mismo texto del bot.
 *
 * Capas (defensa en profundidad; claim(wamid) es la primaria en el webhook):
 * 1) Replay de inbound: mismo texto de cliente dos veces seguidas + misma reply → no send.
 *    Cubre reintentos Meta tardíos (6–20 min) aunque el claim por instancia falle.
 * 2) Paso pendiente: reply idéntica al último assistant mientras nextAction sigue
 *    esperando dato del usuario → no reenviar el mismo prompt.
 * 3) Ventana corta (3 min) para cualquier reply idéntica.
 *
 * Exportada para tests unitarios.
 */
const PENDING_OUTBOUND_ACTIONS = new Set([
  'ASK_VEHICLE',
  'ASK_BRAND',
  'ASK_MODEL',
  'ASK_YEAR',
  'ASK_SOUND',
  'CONFIRM_VEHICLE',
  'ASK_INTEREST_AFTER_RECOMMENDATION',
  'ASK_CATEGORY',
]);

export function isDuplicateRecentAssistantReply(
  conversation: Conversation,
  reply: string,
  nowMs: number = Date.now(),
  windowMs: number = 3 * 60_000,
): boolean {
  const normalized = reply.trim();
  if (!normalized) return false;

  let lastAssistant: (typeof conversation.messages)[number] | undefined;
  for (let i = conversation.messages.length - 1; i >= 0; i -= 1) {
    const m = conversation.messages[i]!;
    if (m.role === 'assistant') {
      lastAssistant = m;
      break;
    }
  }
  if (!lastAssistant || lastAssistant.content.trim() !== normalized) {
    return false;
  }

  const customerMsgs = conversation.messages.filter((m) => m.role === 'customer');
  if (customerMsgs.length >= 2) {
    const prev = customerMsgs[customerMsgs.length - 2]!.content.trim().toLowerCase();
    const curr = customerMsgs[customerMsgs.length - 1]!.content.trim().toLowerCase();
    if (prev && prev === curr) {
      return true;
    }
  }

  const nextAction = conversation.context.salesFlow?.nextAction;
  if (nextAction && PENDING_OUTBOUND_ACTIONS.has(nextAction)) {
    return true;
  }

  const created = new Date(lastAssistant.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  const age = nowMs - created;
  return age >= 0 && age < windowMs;
}
