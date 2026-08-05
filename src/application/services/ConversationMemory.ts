import type {
  ConversationMemoryOptions,
  ConversationMemorySnapshot,
} from '../../domain/conversation/conversationMemory';

/**
 * Almacén de memoria conversacional con TTL propio.
 * Independiente del repositorio de conversaciones y del canal.
 */
export class ConversationMemory {
  private readonly store = new Map<string, ConversationMemorySnapshot>();
  private readonly defaultTtlMs: number;
  private readonly now: () => number;

  constructor(options: ConversationMemoryOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 24 * 60 * 60_000;
    this.now = options.now ?? (() => Date.now());
  }

  save(
    snapshot: ConversationMemorySnapshot,
    ttlMs: number = this.defaultTtlMs,
  ): ConversationMemorySnapshot {
    const savedAt = this.now();
    const stored: ConversationMemorySnapshot = {
      ...structuredClone(snapshot),
      savedAt,
      expiresAt: savedAt + ttlMs,
    };
    this.store.set(stored.memoryKey, stored);
    return structuredClone(stored);
  }

  /** Devuelve snapshot activo o null si no existe / expiró (y limpia). */
  get(memoryKey: string): ConversationMemorySnapshot | null {
    const hit = this.store.get(memoryKey);
    if (!hit) return null;
    if (hit.expiresAt <= this.now()) {
      this.store.delete(memoryKey);
      return null;
    }
    return structuredClone(hit);
  }

  hasActive(memoryKey: string): boolean {
    return this.get(memoryKey) !== null;
  }

  clear(memoryKey: string): void {
    this.store.delete(memoryKey);
  }

  /** Purge de expirados (mantenimiento). */
  purgeExpired(): number {
    const t = this.now();
    let n = 0;
    for (const [key, snap] of this.store) {
      if (snap.expiresAt <= t) {
        this.store.delete(key);
        n += 1;
      }
    }
    return n;
  }

  size(): number {
    return this.store.size;
  }
}
