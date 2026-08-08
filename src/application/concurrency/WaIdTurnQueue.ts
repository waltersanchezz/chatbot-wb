/**
 * Cola in-process por clave (wa_id / externalConversationId).
 * Garantiza un turno a la vez por cliente sin bloquear otros wa_id.
 */
export class WaIdTurnQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(waId: string, task: () => Promise<T>): Promise<T> {
    const key = waId.trim() || 'unknown';
    const previous = this.tails.get(key) ?? Promise.resolve();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const chained = previous.catch(() => undefined).then(() => gate);
    this.tails.set(key, chained);

    await previous.catch(() => undefined);

    try {
      return await task();
    } finally {
      release();
      if (this.tails.get(key) === chained) {
        this.tails.delete(key);
      }
    }
  }

  /** Cuántas colas activas (tests / métricas). */
  size(): number {
    return this.tails.size;
  }
}
