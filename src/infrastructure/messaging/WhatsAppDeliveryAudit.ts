import { randomUUID } from 'crypto';

/**
 * Auditoría temporal de entrega WhatsApp para validar idempotencia.
 *
 * CICLO DE VIDA (evidencia de diseño):
 * - Vive en el heap del proceso Node: export singleton `whatsappDeliveryAudit`.
 * - Se inicializa UNA vez al cargar este módulo (import/require).
 * - Se destruye cuando el proceso Node termina o reinicia (cold start Render,
 *   deploy, crash, scale-down). Un proceso nuevo crea OTRO singleton con
 *   arrays vacíos y un AUDIT_INSTANCE distinto.
 * - reset() vacía arrays pero NO recrea el singleton ni cambia AUDIT_INSTANCE.
 */

export interface WhatsAppPostEvent {
  requestId: string;
  timestamp: string;
  wamids: string[];
  path: string;
}

export interface WhatsAppClaimEvent {
  requestId: string;
  timestamp: string;
  wamid: string;
  result: 'claim_ok' | 'duplicate_skipped';
}

export interface WhatsAppSendEvent {
  timestamp: string;
  wamid?: string;
  conversationId?: string;
  to: string;
  providerMessageId?: string;
  ok: boolean;
  callSite: string;
  stack: string;
}

export interface WhatsAppDeliverySnapshot {
  /** UUID del singleton en ESTE proceso Node (no cambia con reset()). */
  auditInstance: string;
  createdAt: string;
  pid: number;
  resetCount: number;
  postsReceived: number;
  claimsOk: number;
  duplicatesSkipped: number;
  sendTextCalls: number;
  metaMessagesSent: number;
  posts: WhatsAppPostEvent[];
  claims: WhatsAppClaimEvent[];
  sends: WhatsAppSendEvent[];
}

class WhatsAppDeliveryAuditStore {
  /** Identidad del store en memoria de este proceso. */
  readonly auditInstance: string;
  readonly createdAt: string;
  readonly pid: number;
  private resetCount = 0;

  private posts: WhatsAppPostEvent[] = [];
  private claims: WhatsAppClaimEvent[] = [];
  private sends: WhatsAppSendEvent[] = [];

  constructor() {
    this.auditInstance = randomUUID();
    this.createdAt = new Date().toISOString();
    this.pid = process.pid;
    // Instrumentación temporal: traza de creación del singleton.
    console.log(`AUDIT_INSTANCE=${this.auditInstance}`);
    console.log(
      '[WA_AUDIT][INIT]',
      JSON.stringify({
        auditInstance: this.auditInstance,
        createdAt: this.createdAt,
        pid: this.pid,
      }),
    );
  }

  /**
   * Único reset automático/manual del contenido (no destruye el singleton).
   * Callers: POST /api/debug/whatsapp-delivery/reset
   */
  reset(): void {
    this.resetCount += 1;
    this.posts = [];
    this.claims = [];
    this.sends = [];
    console.log(`AUDIT_INSTANCE=${this.auditInstance}`);
    console.log(
      '[WA_AUDIT][RESET]',
      JSON.stringify({
        auditInstance: this.auditInstance,
        resetCount: this.resetCount,
        pid: this.pid,
      }),
    );
  }

  recordPost(partial: Omit<WhatsAppPostEvent, 'timestamp'> & { timestamp?: string }): WhatsAppPostEvent {
    const event: WhatsAppPostEvent = {
      ...partial,
      timestamp: partial.timestamp ?? new Date().toISOString(),
    };
    this.posts.push(event);
    console.log(`AUDIT_INSTANCE=${this.auditInstance}`);
    console.log('[WA_AUDIT][POST]', JSON.stringify({
      auditInstance: this.auditInstance,
      ...event,
      postsReceived: this.posts.length,
    }));
    return event;
  }

  recordClaim(event: Omit<WhatsAppClaimEvent, 'timestamp'> & { timestamp?: string }): void {
    const full: WhatsAppClaimEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.claims.push(full);
    console.log(`AUDIT_INSTANCE=${this.auditInstance}`);
    console.log('[WA_AUDIT][CLAIM]', JSON.stringify({
      auditInstance: this.auditInstance,
      ...full,
    }));
  }

  recordSend(event: Omit<WhatsAppSendEvent, 'timestamp' | 'stack' | 'callSite'> & {
    timestamp?: string;
    stack?: string;
  }): void {
    const stack = event.stack ?? new Error().stack ?? '';
    const callSite = extractCallSite(stack);
    const full: WhatsAppSendEvent = {
      timestamp: event.timestamp ?? new Date().toISOString(),
      wamid: event.wamid,
      conversationId: event.conversationId,
      to: event.to,
      providerMessageId: event.providerMessageId,
      ok: event.ok,
      callSite,
      stack: stack.split('\n').slice(0, 12).join('\n'),
    };
    this.sends.push(full);
    console.log(`AUDIT_INSTANCE=${this.auditInstance}`);
    console.log('[WA_AUDIT][SEND_TEXT]', JSON.stringify({
      auditInstance: this.auditInstance,
      timestamp: full.timestamp,
      wamid: full.wamid,
      conversationId: full.conversationId,
      to: full.to,
      ok: full.ok,
      providerMessageId: full.providerMessageId,
      callSite: full.callSite,
      sendTextCalls: this.sends.length,
    }));
  }

  snapshot(): WhatsAppDeliverySnapshot {
    console.log(`AUDIT_INSTANCE=${this.auditInstance}`);
    console.log(
      '[WA_AUDIT][SNAPSHOT]',
      JSON.stringify({
        auditInstance: this.auditInstance,
        createdAt: this.createdAt,
        pid: this.pid,
        resetCount: this.resetCount,
        postsReceived: this.posts.length,
        sendTextCalls: this.sends.length,
      }),
    );
    return {
      auditInstance: this.auditInstance,
      createdAt: this.createdAt,
      pid: this.pid,
      resetCount: this.resetCount,
      postsReceived: this.posts.length,
      claimsOk: this.claims.filter((c) => c.result === 'claim_ok').length,
      duplicatesSkipped: this.claims.filter((c) => c.result === 'duplicate_skipped').length,
      sendTextCalls: this.sends.length,
      metaMessagesSent: this.sends.filter((s) => s.ok).length,
      posts: [...this.posts],
      claims: [...this.claims],
      sends: [...this.sends],
    };
  }

  newRequestId(): string {
    return randomUUID();
  }
}

function extractCallSite(stack: string): string {
  const lines = stack.split('\n').map((l) => l.trim());
  const preferred = lines.find(
    (line) =>
      line.startsWith('at ') &&
      (line.includes('HandleIncomingMessage') ||
        line.includes('use-cases\\HandleIncomingMessage') ||
        line.includes('use-cases/HandleIncomingMessage')),
  );
  if (preferred) return preferred.replace(/^at\s+/, '');

  for (const line of lines) {
    if (!line.startsWith('at ')) continue;
    if (line.includes('WhatsAppDeliveryAudit')) continue;
    if (line.includes('WhatsAppCloudProvider')) continue;
    if (line.includes('ConsoleMessagingProvider')) continue;
    if (line.includes('sendText_trace')) continue;
    if (line.includes('node:')) continue;
    return line.replace(/^at\s+/, '');
  }
  return lines.find((l) => l.startsWith('at '))?.replace(/^at\s+/, '') ?? 'unknown';
}

/** Singleton: una instancia por proceso Node (por carga de módulo). */
export const whatsappDeliveryAudit = new WhatsAppDeliveryAuditStore();
