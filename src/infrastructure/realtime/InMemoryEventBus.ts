import type { EventBus, EventBusListener } from '../../domain/realtime/EventBus';
import type {
  RealtimeEvent,
  RealtimeEventType,
} from '../../domain/realtime/realtimeEvents';

/**
 * EventBus en memoria (single process).
 * Suficiente para SSE local sin infra externa.
 */
export class InMemoryEventBus implements EventBus {
  private readonly listeners = new Set<EventBusListener>();
  private readonly typed = new Map<RealtimeEventType, Set<EventBusListener>>();

  publish(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* no tumbar el bus por un listener */
      }
    }
    const typedListeners = this.typed.get(event.type);
    if (!typedListeners) return;
    for (const listener of typedListeners) {
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
  }

  subscribe(listener: EventBusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeType(
    type: RealtimeEventType,
    listener: EventBusListener,
  ): () => void {
    let set = this.typed.get(type);
    if (!set) {
      set = new Set();
      this.typed.set(type, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }
}
