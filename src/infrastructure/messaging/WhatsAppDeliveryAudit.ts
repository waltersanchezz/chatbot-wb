import { randomUUID } from 'crypto';

/**
 * Auditoría temporal de entrega WhatsApp — trazabilidad por wamid.
 *
 * CICLO DE VIDA:
 * - Vive en el heap del proceso Node: singleton `whatsappDeliveryAudit`.
 * - Se inicializa UNA vez al cargar este módulo.
 * - Se destruye con el proceso (cold start / deploy / crash).
 * - reset() vacía eventos pero NO cambia AUDIT_INSTANCE.
 *
 * API principal: timeline cronológica por wamid (no contadores agregados).
 */

export type WaTraceEventName =
  | 'POST_RECEIVED'
  | 'CLAIM'
  | 'STOPPED_DUPLICATE'
  | 'HANDLE_ENTER'
  | 'HANDLE_EXIT'
  | 'HANDLE_ERROR'
  | 'SEND_TEXT';

/** Un evento en la línea de tiempo de un wamid. */
export interface WaTraceEvent {
  seq: number;
  timestamp: string;
  event: WaTraceEventName;
  wamid: string;
  requestId: string;
  pid: number;
  auditInstance: string;
  /** POSTs vistos para este wamid hasta este evento (inclusive). */
  postCountForWamid?: number;
  claimResult?: 'claim_ok' | 'duplicate_skipped';
  ok?: boolean;
  providerMessageId?: string;
  metaHttpStatus?: number;
  metaHttpBody?: string;
  callSite?: string;
  stack?: string;
  conversationId?: string;
  to?: string;
  durationMs?: number;
  error?: string;
  path?: string;
}

export interface WaWamidTrace {
  wamid: string;
  auditInstance: string;
  pid: number;
  createdAt: string;
  postCount: number;
  timeline: WaTraceEvent[];
}

/** @deprecated Prefer WaWamidTrace; se mantiene para compat de tests previos. */
export interface WhatsAppPostEvent {
  requestId: string;
  timestamp: string;
  wamids: string[];
  path: string;
}

/** @deprecated Prefer WaWamidTrace */
export interface WhatsAppClaimEvent {
  requestId: string;
  timestamp: string;
  wamid: string;
  result: 'claim_ok' | 'duplicate_skipped';
}

/** @deprecated Prefer WaWamidTrace */
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

/** @deprecated Prefer getTrace(wamid) */
export interface WhatsAppDeliverySnapshot {
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
  readonly auditInstance: string;
  readonly createdAt: string;
  readonly pid: number;
  private resetCount = 0;
  private seq = 0;

  /** Línea de tiempo global (orden de llegada). */
  private timeline: WaTraceEvent[] = [];

  // Vistas derivadas (compat snapshot).
  private posts: WhatsAppPostEvent[] = [];
  private claims: WhatsAppClaimEvent[] = [];
  private sends: WhatsAppSendEvent[] = [];

  constructor() {
    this.auditInstance = randomUUID();
    this.createdAt = new Date().toISOString();
    this.pid = process.pid;
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

  reset(): void {
    this.resetCount += 1;
    this.seq = 0;
    this.timeline = [];
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

  newRequestId(): string {
    return randomUUID();
  }

  /** Cuenta POSTs que incluyen este wamid. */
  postCountFor(wamid: string): number {
    return this.timeline.filter(
      (e) => e.event === 'POST_RECEIVED' && e.wamid === wamid,
    ).length;
  }

  /**
   * Traza completa de un wamid, en orden cronológico (seq).
   * Esto es la evidencia E2E — no un snapshot de contadores.
   */
  getTrace(wamid: string): WaWamidTrace {
    const timeline = this.timeline.filter((e) => e.wamid === wamid);
    return {
      wamid,
      auditInstance: this.auditInstance,
      pid: this.pid,
      createdAt: this.createdAt,
      postCount: this.postCountFor(wamid),
      timeline,
    };
  }

  recordPost(partial: Omit<WhatsAppPostEvent, 'timestamp'> & { timestamp?: string }): WhatsAppPostEvent {
    const event: WhatsAppPostEvent = {
      ...partial,
      timestamp: partial.timestamp ?? new Date().toISOString(),
    };
    this.posts.push(event);

    const uniqueWamids = [...new Set(partial.wamids)];
    if (uniqueWamids.length === 0) {
      this.appendTrace({
        event: 'POST_RECEIVED',
        wamid: '(none)',
        requestId: partial.requestId,
        path: partial.path,
        postCountForWamid: 0,
        timestamp: event.timestamp,
      });
    } else {
      for (const wamid of uniqueWamids) {
        // Contar este POST antes de append (postCount incluye el actual).
        const prior = this.postCountFor(wamid);
        this.appendTrace({
          event: 'POST_RECEIVED',
          wamid,
          requestId: partial.requestId,
          path: partial.path,
          postCountForWamid: prior + 1,
          timestamp: event.timestamp,
        });
      }
    }
    return event;
  }

  recordClaim(event: Omit<WhatsAppClaimEvent, 'timestamp'> & { timestamp?: string }): void {
    const full: WhatsAppClaimEvent = {
      ...event,
      timestamp: event.timestamp ?? new Date().toISOString(),
    };
    this.claims.push(full);

    this.appendTrace({
      event: 'CLAIM',
      wamid: event.wamid,
      requestId: event.requestId,
      claimResult: event.result,
      postCountForWamid: this.postCountFor(event.wamid),
      timestamp: full.timestamp,
    });

    if (event.result === 'duplicate_skipped') {
      this.appendTrace({
        event: 'STOPPED_DUPLICATE',
        wamid: event.wamid,
        requestId: event.requestId,
        claimResult: 'duplicate_skipped',
        postCountForWamid: this.postCountFor(event.wamid),
        timestamp: full.timestamp,
      });
    }
  }

  recordHandleEnter(params: { wamid: string; requestId: string }): void {
    this.appendTrace({
      event: 'HANDLE_ENTER',
      wamid: params.wamid,
      requestId: params.requestId,
      postCountForWamid: this.postCountFor(params.wamid),
    });
  }

  recordHandleExit(params: {
    wamid: string;
    requestId: string;
    durationMs: number;
    ok: boolean;
    error?: string;
  }): void {
    if (params.ok) {
      this.appendTrace({
        event: 'HANDLE_EXIT',
        wamid: params.wamid,
        requestId: params.requestId,
        durationMs: params.durationMs,
        ok: true,
        postCountForWamid: this.postCountFor(params.wamid),
      });
    } else {
      this.appendTrace({
        event: 'HANDLE_ERROR',
        wamid: params.wamid,
        requestId: params.requestId,
        durationMs: params.durationMs,
        ok: false,
        error: params.error,
        postCountForWamid: this.postCountFor(params.wamid),
      });
    }
  }

  recordSend(
    event: Omit<WhatsAppSendEvent, 'timestamp' | 'stack' | 'callSite'> & {
      timestamp?: string;
      stack?: string;
      requestId?: string;
      metaHttpStatus?: number;
      metaHttpBody?: string;
    },
  ): void {
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

    const wamid = event.wamid ?? '(unknown)';
    this.appendTrace({
      event: 'SEND_TEXT',
      wamid,
      requestId: event.requestId ?? '(none)',
      ok: event.ok,
      providerMessageId: event.providerMessageId,
      metaHttpStatus: event.metaHttpStatus,
      metaHttpBody: event.metaHttpBody,
      callSite,
      stack: full.stack,
      conversationId: event.conversationId,
      to: event.to,
      postCountForWamid: event.wamid ? this.postCountFor(event.wamid) : undefined,
      timestamp: full.timestamp,
    });
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
        timelineEvents: this.timeline.length,
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

  private appendTrace(
    partial: Omit<WaTraceEvent, 'seq' | 'timestamp' | 'pid' | 'auditInstance'> & {
      timestamp?: string;
    },
  ): WaTraceEvent {
    this.seq += 1;
    const full: WaTraceEvent = {
      seq: this.seq,
      timestamp: partial.timestamp ?? new Date().toISOString(),
      event: partial.event,
      wamid: partial.wamid,
      requestId: partial.requestId,
      pid: this.pid,
      auditInstance: this.auditInstance,
      postCountForWamid: partial.postCountForWamid,
      claimResult: partial.claimResult,
      ok: partial.ok,
      providerMessageId: partial.providerMessageId,
      metaHttpStatus: partial.metaHttpStatus,
      metaHttpBody: partial.metaHttpBody,
      callSite: partial.callSite,
      stack: partial.stack,
      conversationId: partial.conversationId,
      to: partial.to,
      durationMs: partial.durationMs,
      error: partial.error,
      path: partial.path,
    };
    this.timeline.push(full);
    console.log(`AUDIT_INSTANCE=${this.auditInstance}`);
    console.log('[WA_TRACE]', JSON.stringify(full));
    return full;
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
