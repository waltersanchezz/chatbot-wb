import type { RealtimeEvent, RealtimeEventType } from './realtimeEvents';

export type EventBusListener = (event: RealtimeEvent) => void;

/**
 * Bus de eventos en proceso (sin Redis / Socket.IO / SaaS).
 */
export interface EventBus {
  publish(event: RealtimeEvent): void;
  subscribe(listener: EventBusListener): () => void;
  subscribeType(type: RealtimeEventType, listener: EventBusListener): () => void;
}
