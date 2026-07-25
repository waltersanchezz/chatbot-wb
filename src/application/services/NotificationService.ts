import type { Lead } from '../../domain/entities/Lead';
import { logger } from '../../infrastructure/logging/logger';

/**
 * Notificaciones externas (Telegram).
 * Nunca debe tumbar el chatbot ni el CRM si falla el envío.
 */
export class NotificationService {
  async notifyNewLead(lead: Lead): Promise<boolean> {
    console.log('[Telegram] Entró a notifyNewLead', { leadId: lead.id });
    logger.info('[Telegram] Entró a notifyNewLead', { leadId: lead.id });

    try {
      // Lectura en tiempo de envío (no cachear valores vacíos del arranque).
      const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
      const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();

      const tokenPreview = token ? `${token.slice(0, 8)}***` : '(vacío)';

      console.log('[Telegram] Variables de entorno cargadas');
      console.log('[Telegram] TELEGRAM_CHAT_ID:', chatId || '(vacío)');
      console.log('[Telegram] TELEGRAM_BOT_TOKEN:', tokenPreview);
      logger.info('[Telegram] Variables de entorno cargadas', {
        chatId: chatId || '(vacío)',
        botTokenPreview: tokenPreview,
        leadId: lead.id,
      });

      if (!token || !chatId) {
        console.error(
          '[Telegram] ABORT: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID vacíos. No se envía el mensaje.',
        );
        logger.error('[Telegram] ABORT: credenciales vacías', { leadId: lead.id });
        return false;
      }

      const text = this.formatNewLeadMessage(lead);
      const url = `https://api.telegram.org/bot${token}/sendMessage`;

      console.log('Enviando notificación a Telegram...');
      console.log('[Telegram] Enviando petición HTTP POST', { url: url.replace(token, tokenPreview) });
      logger.info('[Telegram] Enviando petición HTTP', { leadId: lead.id });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            chat_id: chatId,
            text,
            disable_web_page_preview: 'true',
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const body = await response.text();

      console.log('[Telegram] Respuesta HTTP status:', response.status);
      console.log('[Telegram] Respuesta HTTP body:', body);
      logger.info('[Telegram] Respuesta HTTP', {
        status: response.status,
        body,
        leadId: lead.id,
      });

      if (!response.ok) {
        console.error('[Telegram] Envío fallido');
        return false;
      }

      console.log('[Telegram] Notificación enviada correctamente');
      return true;
    } catch (err) {
      console.error('[Telegram] Error al enviar notificación:');
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
        logger.error('[Telegram] Error completo', {
          leadId: lead.id,
          error: err.message,
          stack: err.stack,
        });
      } else {
        console.error(err);
        logger.error('[Telegram] Error desconocido', {
          leadId: lead.id,
          error: String(err),
        });
      }
      return false;
    }
  }

  private formatNewLeadMessage(lead: Lead): string {
    const vehicle = [lead.vehicleBrand, lead.vehicleModel].filter(Boolean).join(' ').trim() || '—';
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
