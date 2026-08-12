import type { Lead } from '../../domain/entities/Lead';
import { logger } from '../../infrastructure/logging/logger';

const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 8_000;
const BACKOFF_MS = [0, 800, 2_000] as const;
/** Margen bajo el límite 4096 de Telegram (plantilla + botón). */
const MAX_INBOUND_MESSAGE_CHARS = 1_200;
const MIN_WA_DIGITS = 8;

export interface InboundCustomerTelegramInput {
  phone: string;
  customerName?: string | null;
  messageText: string;
  /** Marca / modelo ya conocidos (omitir si vacío). */
  vehicleLabel?: string | null;
  /** Año del vehículo si ya existe. */
  yearLabel?: string | null;
  /**
   * Planta de sonido / amplificador (`context.battery.soundSystem`).
   * undefined = aún no se preguntó → omitir línea.
   */
  soundSystem?: boolean;
  /** Referencia Willard ya recomendada (omitir si vacío). */
  batteryLabel?: string | null;
  /** Instantánea del mensaje (default: ahora). */
  at?: Date;
  /** Correlación logs (wamid / message id). */
  correlationId?: string | null;
}

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
          correlationId: lead.id,
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

  /**
   * Alerta inmediata: mensaje entrante de cliente (no lead/handoff).
   * No reemplaza ni altera notifyNewLead.
   */
  async notifyInboundCustomerMessage(
    input: InboundCustomerTelegramInput,
  ): Promise<boolean> {
    const correlationId =
      input.correlationId?.trim() || input.phone.trim() || 'inbound';

    logger.info('[Telegram] Entró a notifyInboundCustomerMessage', {
      correlationId,
    });

    try {
      const token = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
      const chatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();

      if (!token || !chatId) {
        logger.error('[Telegram] ABORT inbound: credenciales vacías', {
          correlationId,
        });
        return false;
      }

      const text = formatInboundCustomerTelegramText(input);
      const waUrl = buildWhatsAppMeUrl(input.phone);
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
          correlationId,
          attempt,
          replyMarkup: waUrl
            ? {
                inline_keyboard: [
                  [{ text: '👉 Abrir WhatsApp', url: waUrl }],
                ],
              }
            : undefined,
        });

        if (result === 'ok') {
          logger.info('[Telegram] Inbound notificado correctamente', {
            correlationId,
            attempt,
            hasWaButton: Boolean(waUrl),
          });
          return true;
        }

        if (result === 'permanent') {
          logger.error('[Telegram] Inbound rechazado sin reintento', {
            correlationId,
            attempt,
          });
          return false;
        }

        logger.warn('[Telegram] Inbound intento fallido; reintentando si aplica', {
          correlationId,
          attempt,
          maxAttempts: MAX_ATTEMPTS,
        });
      }

      return false;
    } catch (err) {
      logger.error('[Telegram] Error inbound completo', {
        correlationId,
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
    correlationId: string;
    attempt: number;
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
  }): Promise<'ok' | 'retry' | 'permanent'> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);

    try {
      logger.info('[Telegram] Enviando petición HTTP', {
        leadId: input.correlationId,
        attempt: input.attempt,
      });

      const body = new URLSearchParams({
        chat_id: input.chatId,
        text: input.text,
        disable_web_page_preview: 'true',
      });
      if (input.replyMarkup) {
        body.set('reply_markup', JSON.stringify(input.replyMarkup));
      }

      const response = await fetch(input.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });

      const responseBody = await response.text();
      logger.info('[Telegram] Respuesta HTTP', {
        status: response.status,
        bodyPreview: responseBody.slice(0, 200),
        leadId: input.correlationId,
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

/** Solo dígitos; vacío si no hay número usable. */
export function phoneDigitsForWhatsApp(raw: string | null | undefined): string {
  if (!raw?.trim()) return '';
  return raw
    .replace(/^(whatsapp:|wa:)/i, '')
    .replace(/\D/g, '');
}

/** `https://wa.me/<digits>` o null si el número no es válido. */
export function buildWhatsAppMeUrl(phone: string | null | undefined): string | null {
  const digits = phoneDigitsForWhatsApp(phone);
  if (digits.length < MIN_WA_DIGITS) return null;
  return `https://wa.me/${digits}`;
}

export function formatColombiaDateTime(at: Date): string {
  return at.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatInboundCustomerTelegramText(
  input: InboundCustomerTelegramInput,
): string {
  const phone = input.phone.trim();
  const name = input.customerName?.trim() || phone || 'Cliente WhatsApp';
  const message = truncateInboundMessage(input.messageText);
  const at = input.at ?? new Date();
  const hour = formatColombiaDateTime(at);

  const lines: string[] = [
    '🔔 NUEVO MENSAJE DE WHATSAPP',
    '',
    `👤 Cliente: ${name}`,
    `📞 WhatsApp: ${phone || '—'}`,
    '',
    '💬 Mensaje:',
    `"${message}"`,
  ];

  const vehicle = input.vehicleLabel?.trim();
  if (vehicle) {
    lines.push('', `🚗 Vehículo: ${vehicle}`);
  }

  const year = input.yearLabel?.trim();
  if (year) {
    lines.push(`📅 Año: ${year}`);
  }

  if (typeof input.soundSystem === 'boolean') {
    lines.push(
      `🔊 Planta de sonido: ${input.soundSystem ? '✅ Sí' : '❌ No'}`,
    );
  }

  const battery = input.batteryLabel?.trim();
  if (battery) {
    lines.push('', '🔋 Recomendación:', battery);
  }

  lines.push('', `🕒 Hora: ${hour}`);
  return lines.join('\n');
}

export function truncateInboundMessage(
  text: string,
  maxChars: number = MAX_INBOUND_MESSAGE_CHARS,
): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
}

/** Marca + modelo; el año va en línea aparte. */
export function buildVehicleLabelForTelegram(vehicle: {
  brand?: string | null;
  model?: string | null;
  year?: string | null;
}): string | null {
  const parts = [vehicle.brand, vehicle.model]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

export function buildYearLabelForTelegram(vehicle: {
  year?: string | null;
}): string | null {
  const year = vehicle.year?.trim();
  return year ? year : null;
}

/**
 * Valor real de planta de sonido (`boolean`).
 * undefined si todavía no se preguntó / no hay dato.
 */
export function readSoundSystemFromContext(context: {
  battery?: { soundSystem?: boolean };
  salesFlow?: { vehicle?: { soundSystem?: boolean } };
}): boolean | undefined {
  if (typeof context.battery?.soundSystem === 'boolean') {
    return context.battery.soundSystem;
  }
  if (typeof context.salesFlow?.vehicle?.soundSystem === 'boolean') {
    return context.salesFlow.vehicle.soundSystem;
  }
  return undefined;
}

function stripWillardPrefix(raw: string): string {
  return raw.replace(/^willard:/i, '').trim();
}

/** Referencias reales conocidas; null si no hay. */
export function buildBatteryLabelForTelegram(context: {
  lastRecommendedReference?: string | null;
  lastRecommendedReferences?: string[] | null;
  recommendedProductIds?: string[] | null;
}): string | null {
  const fromList = (context.lastRecommendedReferences ?? [])
    .map((r) => stripWillardPrefix(r ?? ''))
    .filter(Boolean);
  if (fromList.length > 0) return fromList.join('\n');
  const single = stripWillardPrefix(context.lastRecommendedReference ?? '');
  if (single) return single;
  const fromIds = (context.recommendedProductIds ?? [])
    .map((r) => stripWillardPrefix(r ?? ''))
    .filter(Boolean);
  if (fromIds.length > 0) return fromIds.join('\n');
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
