import fs from 'fs';
import path from 'path';

/**
 * Causa raíz del doble mensaje:
 * Meta entrega webhooks at-least-once. Si el 200 tarda (cold start Render) o hay
 * reintento de red, el mismo `messages[].id` (wamid) llega 2+ veces. Sin
 * idempotencia por wamid, cada entrega ejecuta HandleIncomingMessage y envía
 * otra respuesta por WhatsApp.
 *
 * Esta puerta es la corrección estructural: claim(wamid) antes de procesar.
 * Persistencia en disco para sobrevivir reinicios del proceso dentro del TTL
 * (el caso típico de retry de Meta tras cold start en la misma instancia).
 */

export interface WhatsAppIdempotencyGate {
  /**
   * @returns true → procesar; false → duplicado, no procesar ni responder.
   */
  claim(messageId: string, now?: number): boolean;

  /**
   * Garantía de envío: 1 inboundWamid → máximo 1 sendText.
   * Reusa el mismo store con clave namespaced `out:${wamid}` (no segundo sistema).
   * @returns true → enviar; false → ya se reclamó el envío para este wamid.
   */
  claimOutbound(messageId: string, now?: number): boolean;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h — retries de Meta pueden espaciarse

interface PersistedState {
  version: 1;
  entries: Record<string, number>;
}

export class MemoryWhatsAppMessageIdempotency implements WhatsAppIdempotencyGate {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs: number = DEFAULT_TTL_MS) {}

  claim(messageId: string, now = Date.now()): boolean {
    const id = messageId.trim();
    if (!id) return true;

    this.purge(now);
    if (this.seen.has(id)) return false;
    this.seen.set(id, now);
    return true;
  }

  claimOutbound(messageId: string, now = Date.now()): boolean {
    const id = messageId.trim();
    if (!id) return true;
    return this.claim(`out:${id}`, now);
  }

  size(): number {
    return this.seen.size;
  }

  clear(): void {
    this.seen.clear();
  }

  private purge(now: number): void {
    for (const [id, ts] of this.seen) {
      if (now - ts > this.ttlMs) this.seen.delete(id);
    }
  }
}

/**
 * Idempotencia durable: memoria + archivo JSON (write atómico).
 * Un solo proceso Node: claim() es síncrono → seguro frente a retries concurrentes.
 */
export class FileWhatsAppMessageIdempotency implements WhatsAppIdempotencyGate {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly filePath: string,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  claim(messageId: string, now = Date.now()): boolean {
    // Releer disco en cada claim: reduce carrera entre reinicios / instancias
    // que comparten el mismo archivo de wamids.
    this.mergeFromDisk(now);
    const id = messageId.trim();
    if (!id) return true;

    this.purge(now);
    if (this.seen.has(id)) return false;

    this.seen.set(id, now);
    this.persist();
    return true;
  }

  claimOutbound(messageId: string, now = Date.now()): boolean {
    const id = messageId.trim();
    if (!id) return true;
    return this.claim(`out:${id}`, now);
  }

  /** Recarga forzada desde disco (tests de “reinicio”). */
  reloadFromDisk(now = Date.now()): void {
    this.seen.clear();
    this.mergeFromDisk(now);
  }

  size(): number {
    this.mergeFromDisk();
    return this.seen.size;
  }

  clear(): void {
    this.seen.clear();
    this.persist();
  }

  private mergeFromDisk(now = Date.now()): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed?.version !== 1 || typeof parsed.entries !== 'object') return;
      for (const [id, ts] of Object.entries(parsed.entries)) {
        if (typeof ts === 'number' && now - ts <= this.ttlMs) {
          const prev = this.seen.get(id);
          if (prev === undefined || ts < prev) this.seen.set(id, ts);
        }
      }
    } catch {
      // Archivo corrupto: conservar memoria; no tumbar el webhook.
    }
  }

  private purge(now: number): void {
    for (const [id, ts] of this.seen) {
      if (now - ts > this.ttlMs) this.seen.delete(id);
    }
  }

  private persist(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });

    const entries: Record<string, number> = {};
    for (const [id, ts] of this.seen) entries[id] = ts;

    const payload: PersistedState = { version: 1, entries };
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }
}

/** @deprecated alias — prefer MemoryWhatsAppMessageIdempotency o File* */
export class WhatsAppMessageIdempotency extends MemoryWhatsAppMessageIdempotency {}
