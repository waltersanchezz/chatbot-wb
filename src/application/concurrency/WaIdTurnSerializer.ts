import type { WaIdTurnQueue } from './WaIdTurnQueue';
import { WaIdTurnQueue as DefaultQueue } from './WaIdTurnQueue';

export interface DurableWaIdLock {
  acquire(waId: string, now?: number): Promise<() => void>;
}

/**
 * Serializa turnos por wa_id:
 * 1) cola in-process (requests concurrentes en el mismo Node)
 * 2) lease SQLite opcional (overlapping deploys / 2 procesos, mismo disco)
 */
export class WaIdTurnSerializer {
  private readonly queue: WaIdTurnQueue;

  constructor(
    queue?: WaIdTurnQueue,
    private readonly durableLock?: DurableWaIdLock,
  ) {
    this.queue = queue ?? new DefaultQueue();
  }

  async run<T>(waId: string, task: () => Promise<T>): Promise<T> {
    return this.queue.run(waId, async () => {
      const release = this.durableLock
        ? await this.durableLock.acquire(waId)
        : () => undefined;
      try {
        return await task();
      } finally {
        release();
      }
    });
  }
}
