import { randomUUID } from 'crypto';
import type { Conversation } from '../../domain/entities/Conversation';
import type { Lead, LeadProduct, LeadStatus } from '../../domain/entities/Lead';
import type { LeadRepository } from '../../domain/ports/LeadRepository';
import type { NotificationService } from './NotificationService';

export interface RegisterLeadFromConversationInput {
  conversation: Conversation;
  phone: string;
  customerId: string;
  customerName?: string;
  assistantReply: string;
}

/**
 * Servicio interno del CRM.
 * Chatbot → LeadService → LeadRepository → Dashboard API
 *                ↘ NotificationService (Telegram)
 */
export class LeadService {
  constructor(
    private readonly repository: LeadRepository,
    private readonly notifications: NotificationService,
  ) {
    console.log('[LeadService] Instanciado', {
      hasNotifications: Boolean(notifications),
      notificationsType: notifications?.constructor?.name ?? 'undefined',
    });
  }

  async listLeads(): Promise<Lead[]> {
    return this.repository.list();
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    return this.repository.updateStatus(id, status);
  }

  /**
   * Registra (o actualiza) un lead cuando el flujo termina correctamente.
   * No altera el diálogo del chatbot.
   */
  async registerFromConversation(
    input: RegisterLeadFromConversationInput,
  ): Promise<Lead | null> {
    console.log('[LeadService] Entró a registerFromConversation', {
      conversationId: input.conversation.id,
      stage: input.conversation.context.stage,
      category: input.conversation.context.category,
      phone: input.phone,
    });

    const { conversation, phone, customerId, customerName, assistantReply } = input;
    const { context } = conversation;

    if (!this.isSuccessfulFlowEnd(context)) {
      console.log('[LeadService] return anticipado: flujo aún no terminado', {
        stage: context.stage,
        category: context.category,
      });
      return null;
    }

    const product = this.resolveProduct(context.category);
    if (!product) {
      console.log('[LeadService] return anticipado: producto no resuelto', {
        category: context.category,
      });
      return null;
    }

    const option = this.resolveOption(context, product);
    const recommendation = this.buildRecommendation(context, assistantReply, product);
    const vehicleBrand = context.vehicle.brand?.trim() || '';
    const vehicleModel = context.vehicle.model?.trim() || '';
    const year = context.vehicle.year?.trim() || '';

    const existing = await this.repository.findByConversationId(conversation.id);
    if (existing) {
      console.log('[LeadService] Lead existente encontrado → actualizando', {
        leadId: existing.id,
        telegramNotified: existing.telegramNotified ?? false,
      });

      const updated: Lead = {
        ...existing,
        name: customerName || existing.name,
        phone,
        product,
        vehicleBrand: vehicleBrand || existing.vehicleBrand,
        vehicleModel: vehicleModel || existing.vehicleModel,
        year: year || existing.year,
        optionLabel: option.label,
        optionValue: option.value,
        recommendation,
      };

      const saved = await this.repository.save(updated);
      console.log('[LeadService] Lead actualizado/guardado', { leadId: saved.id });

      // Si nunca se notificó (credenciales vacías, fallo previo, etc.), reintentar.
      if (!saved.telegramNotified) {
        console.log('[LeadService] Lead existente sin Telegram → notify en background');
        this.dispatchTelegramBackground(saved);
      } else {
        console.log('[LeadService] Lead ya tenía telegramNotified=true → no reenvía');
      }

      return saved;
    }

    const lead: Lead = {
      id: randomUUID(),
      createdAt: new Date(),
      phone,
      product,
      vehicleBrand: vehicleBrand || 'Sin marca',
      vehicleModel: vehicleModel || 'Sin modelo',
      year,
      optionLabel: option.label,
      optionValue: option.value,
      recommendation,
      status: 'nuevo',
      conversationId: conversation.id,
      customerId,
      name: customerName,
      telegramNotified: false,
    };

    const saved = await this.repository.save(lead);
    console.log('[LeadService] Lead NUEVO guardado en CRM', { leadId: saved.id });

    console.log('[LeadService] notifyNewLead en background (no bloquea)');
    this.dispatchTelegramBackground(saved);

    return saved;
  }

  /** Fire-and-forget: Telegram nunca debe bloquear el hilo principal. */
  private dispatchTelegramBackground(lead: Lead): void {
    void this.dispatchTelegram(lead);
  }

  private async dispatchTelegram(lead: Lead): Promise<void> {
    if (!this.notifications) {
      console.error('[LeadService] NotificationService es undefined — no se puede notificar');
      return;
    }

    try {
      const ok = await this.notifications.notifyNewLead(lead);
      console.log('[LeadService] notifyNewLead terminó', { ok, leadId: lead.id });

      if (ok) {
        lead.telegramNotified = true;
        await this.repository.save(lead);
        console.log('[LeadService] telegramNotified=true persistido', { leadId: lead.id });
      }
    } catch (err) {
      console.error('[LeadService] Error al invocar notifyNewLead:');
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }
    }
  }

  private isSuccessfulFlowEnd(context: Conversation['context']): boolean {
    if (context.category !== 'baterias' && context.category !== 'rodamientos') {
      return false;
    }
    return context.stage === 'closing' || context.stage === 'handoff';
  }

  private resolveProduct(
    category: Conversation['context']['category'],
  ): LeadProduct | null {
    if (category === 'baterias') return 'Batería';
    if (category === 'rodamientos') return 'Rodamiento';
    return null;
  }

  private resolveOption(
    context: Conversation['context'],
    product: LeadProduct,
  ): { label: string; value: boolean | null } {
    if (product === 'Batería') {
      return {
        label: 'Planta de sonido',
        value: context.battery.soundSystem ?? null,
      };
    }
    return {
      label: 'ABS',
      value: context.bearing.hasAbs ?? null,
    };
  }

  private buildRecommendation(
    context: Conversation['context'],
    reply: string,
    product: LeadProduct,
  ): string {
    if (product === 'Batería') {
      const fromIds = context.recommendedProductIds
        .map((id) => id.replace(/^willard:/i, 'Willard '))
        .filter(Boolean);
      if (fromIds.length) return fromIds.join(' · ');
    }

    if (product === 'Rodamiento' && context.recommendedProductIds.length) {
      return context.recommendedProductIds.join(' · ');
    }

    const lines = reply
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[🔋⚡📦⚙️]/.test(line));

    if (lines.length) return lines.join(' · ');

    return 'Pendiente de confirmación con asesor';
  }
}
