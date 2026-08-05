import type { Lead } from '../../domain/entities/Lead';
import { logger } from '../../infrastructure/logging/logger';

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 8_000;
const BACKOFF_MS = [0, 800, 2_000] as const;

/**
 * Notificaciones externas (Telegram) — Production Sprint 4.
 * Reintentos ante fallos transitorios; nunca tumba chatbot ni CRM.
 */
export class NotificationService {
  async notifyNewLead(lead: Lead): Promise<boolean> {
    logger.info('[Telegram] Entró a notifyNewLead', { leadId: lead.id });

    try {
      const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
      const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();
      const tokenPreview = token ? `${token.slice(0, 8)}***` : '(vacío)';

      logger.info('[Telegram] Variables de entorno cargadas', {
        chatId: chatId ? '(presente)' : '(vacío)',
        botTokenPreview: tokenPreview,
        leadId: lead.id,
      });

      if (!token || !chatId) {
        logger.error('[Telegram] ABORT: credenciales vacías', {
          leadId: lead.id,
        });
        return false;
      }

      const text = this.formatNewLeadMessage(lead);
      const url = `https://api.telegram.org/bot${token}/sendMessage`;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const delayMs = BACKOFF_MS[attempt - 1] ?? 0;
        if (delayMs > 0) {
          await sleep(delayMs);
        }

        const result = await this.sendOnce({
          url,
          chatId,
          text,
          leadId: lead.id,
          attempt,
        });

        if (result === 'ok') {
          logger.info('[Telegram] Notificación enviada correctamente', {
            leadId: lead.id,
            attempt,
          });
          return true;
        }

        if (result === 'permanent') {
          logger.error('[Telegram] Envío rechazado sin reintento', {
            leadId: lead.id,
            attempt,
          });
          return false;
        }

        logger.warn('[Telegram] Intento fallido; reintentando si aplica', {
          leadId: lead.id,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
        });
      }

      return false;
    } catch (err) {
      logger.error('[Telegram] Error completo', {
        leadId: lead.id,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      return false;
    }
  }

  private async sendOnce(input: {
    url: string;
    chatId: string;
    text: string;
    leadId: string;
    attempt: number;
  }): Promise<'ok' | 'retry' | 'permanent'> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

    try {
      logger.info('[Telegram] Enviando petición HTTP', {
        leadId: input.leadId,
        attempt: input.attempt,
      });

      const response = await fetch(input.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          chat_id: input.chatId,
          text: input.text,
          disable_web_page_preview: 'true',
        }),
        signal: controller.signal,
      });

      const body = await response.text();
      logger.info('[Telegram] Respuesta HTTP', {
        status: response.status,
        bodyPreview: body.slice(0, 200),
        leadId: input.leadId,
        attempt: input.attempt,
      });

      if (response.ok) return 'ok';
      // 4xx (salvo 429) no se recuperan con reintento.
      if (response.status === 429 || response.status >= 500) return 'retry';
      return 'permanent';
    } catch {
      return 'retry';
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatNewLeadMessage(lead: Lead): string {
    const vehicle =
      [lead.vehicleBrand, lead.vehicleModel].filter(Boolean).join(' ').trim() ||
      '—';
    const hour = lead.createdAt.toLocaleString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    return [
      '🔔 Nuevo cliente en Rodacenter AI',
      '',
      '👤 Nombre:',
      lead.name?.trim() || 'Cliente WhatsApp',
      '',
      '📞 WhatsApp:',
      lead.phone,
      '',
      '🛒 Producto:',
      lead.product,
      '',
      '🚗 Vehículo:',
      vehicle,
      '',
      '📅 Año:',
      lead.year || '—',
      '',
      '🔋 Recomendación:',
      lead.recommendation || '—',
      '',
      '🕒 Hora:',
      hour,
      '',
      'Estado:',
      '🟢 Nuevo',
    ].join('\n');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
