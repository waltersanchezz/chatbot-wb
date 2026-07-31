import { randomUUID } from 'crypto';
import { createEmptyContext, type Conversation } from '../../domain/entities/Conversation';
import type { ConversationLog } from '../../domain/entities/ConversationLog';
import type { Message } from '../../domain/entities/Message';
import type { ConversationRepository } from '../../domain/ports/ConversationRepository';
import type { CustomerRepository } from '../../domain/ports/CustomerRepository';
import type { LogRepository } from '../../domain/ports/LogRepository';
import type { MessagingProvider } from '../../domain/ports/MessagingProvider';
import type { Channel } from '../../shared/types';
import type { ConversationEngine } from '../services/ConversationEngine';
import type { LeadService } from '../services/LeadService';
import { whatsappDeliveryAudit } from '../../infrastructure/messaging/WhatsAppDeliveryAudit';

export interface IncomingMessageInput {
  phone: string;
  text: string;
  channel: Channel;
  externalConversationId?: string;
  customerName?: string;
  sendReply?: boolean;
  /** WhatsApp Cloud API message id (wamid) for idempotency/audit correlation. */
  inboundWamid?: string;
  /** Correlación auditoría: requestId del POST webhook (solo traza). */
  auditRequestId?: string;
}

export interface IncomingMessageResult {
  conversationId: string;
  customerId: string;
  reply: string;
  needsHumanHandoff: boolean;
  durationMs: number;
}

export class HandleIncomingMessage {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly conversations: ConversationRepository,
    private readonly logs: LogRepository,
    private readonly engine: ConversationEngine,
    private readonly messaging: MessagingProvider,
    private readonly leadService: LeadService,
    private readonly sessionTtlMinutes: number,
  ) {}

  async execute(input: IncomingMessageInput): Promise<IncomingMessageResult> {
    const started = Date.now();
    let reply = '';
    let conversation: Conversation | null = null;

    // Instrumentación temporal: entrada HandleIncomingMessage (no cambia flujo).
    if (input.inboundWamid && input.auditRequestId) {
      whatsappDeliveryAudit.recordHandleEnter({
        wamid: input.inboundWamid,
        requestId: input.auditRequestId,
      });
    }

    console.log('[HandleIncomingMessage] Mensaje recibido', {
      channel: input.channel,
      phone: input.phone,
      inboundWamid: input.inboundWamid,
      textPreview: input.text.slice(0, 80),
    });

    try {
      const customer = await this.customers.findOrCreate(
        input.phone,
        input.channel,
        input.customerName,
      );
      console.log('[HandleIncomingMessage] Cliente listo', { customerId: customer.id });

      const externalId = input.externalConversationId ?? `${input.channel}:${input.phone}`;
      conversation = await this.conversations.findByExternalId(externalId);

      const now = new Date();
      if (!conversation || conversation.expiresAt < now) {
        conversation = this.newConversation(customer.id, input.channel, externalId, now);
        console.log('[HandleIncomingMessage] Nueva conversación', { id: conversation.id });
      } else {
        console.log('[HandleIncomingMessage] Conversación existente', { id: conversation.id });
      }

      const inbound: Message = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'customer',
        content: input.text,
        createdAt: now,
        metadata: input.customerName ? { customerName: input.customerName } : undefined,
      };
      conversation.messages.push(inbound);

      console.log('[HandleIncomingMessage] Procesando con ConversationEngine...');
      const result = await this.engine.process(conversation, input.text);
      reply = result.reply;
      conversation.context = result.context;
      conversation.updatedAt = now;
      conversation.expiresAt = this.expiry(now);
      console.log('[HandleIncomingMessage] Respuesta generada', {
        stage: conversation.context.stage,
        category: conversation.context.category,
        replyPreview: reply.slice(0, 80),
      });

      const outbound: Message = {
        id: randomUUID(),
        conversationId: conversation.id,
        role: 'assistant',
        content: reply,
        createdAt: new Date(),
      };
      conversation.messages.push(outbound);

      await this.conversations.save(conversation);
      console.log('[HandleIncomingMessage] Conversación guardada');

      // 1) WhatsApp PRIMERO — nunca esperar a Telegram/CRM.
      if (input.sendReply !== false) {
        console.log('[HandleIncomingMessage] Enviando respuesta a WhatsApp...', {
          inboundWamid: input.inboundWamid,
          conversationId: conversation.id,
          // Único call site de envío WhatsApp en el use-case:
          // HandleIncomingMessage.ts → messaging.sendText
          callSite: 'HandleIncomingMessage.execute',
        });
        const sendResult = await this.messaging.sendText({
          to: input.phone,
          body: reply,
          channel: input.channel,
          inboundWamid: input.inboundWamid,
          auditRequestId: input.auditRequestId,
          conversationId: conversation.id,
        });
        console.log('[HandleIncomingMessage] Respuesta WhatsApp enviada', {
          ...sendResult,
          inboundWamid: input.inboundWamid,
          conversationId: conversation.id,
        });
      } else {
        console.log('[HandleIncomingMessage] sendReply=false → no se envía a WhatsApp');
      }

      // 2) CRM + Telegram en segundo plano; fallos no afectan la respuesta.
      void this.captureLeadSafe({
        conversation,
        phone: input.phone,
        customerId: customer.id,
        customerName: input.customerName ?? customer.name,
        assistantReply: reply,
      });

      const durationMs = Date.now() - started;
      await this.writeLog({
        conversation,
        customerPhone: input.phone,
        customerId: customer.id,
        inbound: input.text,
        outbound: reply,
        durationMs,
      });

      console.log('[HandleIncomingMessage] Flujo completado', { durationMs });

      if (input.inboundWamid && input.auditRequestId) {
        whatsappDeliveryAudit.recordHandleExit({
          wamid: input.inboundWamid,
          requestId: input.auditRequestId,
          durationMs,
          ok: true,
        });
      }

      return {
        conversationId: conversation.id,
        customerId: customer.id,
        reply,
        needsHumanHandoff: conversation.context.needsHumanHandoff,
        durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - started;
      console.error('[HandleIncomingMessage] Excepción en el flujo:');
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }

      if (input.inboundWamid && input.auditRequestId) {
        whatsappDeliveryAudit.recordHandleExit({
          wamid: input.inboundWamid,
          requestId: input.auditRequestId,
          durationMs,
          ok: false,
          error: err instanceof Error ? err.message : 'unknown',
        });
      }

      await this.logs.append({
        id: randomUUID(),
        date: new Date(),
        customerId: conversation?.customerId ?? 'unknown',
        customerPhone: input.phone,
        conversationId: conversation?.id ?? 'unknown',
        inboundMessage: input.text,
        outboundResponse: reply,
        durationMs,
        error: err instanceof Error ? err.message : 'Error desconocido',
      });
      throw err;
    }
  }

  private async captureLeadSafe(params: {
    conversation: Conversation;
    phone: string;
    customerId: string;
    customerName?: string;
    assistantReply: string;
  }): Promise<void> {
    try {
      console.log('[HandleIncomingMessage] CRM/Telegram en segundo plano...');
      await this.leadService.registerFromConversation(params);
      console.log('[HandleIncomingMessage] CRM/Telegram finalizó sin tumbar WhatsApp');
    } catch (err) {
      console.error('[HandleIncomingMessage] Error en CRM/Telegram (ignorado para WhatsApp):');
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }
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
        intent: params.conversation.context.intent,
        stage: params.conversation.context.stage,
        handoff: params.conversation.context.needsHumanHandoff,
      },
    };
    await this.logs.append(log);
  }
}
