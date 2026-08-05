import type { Request, Response } from 'express';
import type { EventBus } from '../../../domain/realtime/EventBus';
import type { RealtimeEvent } from '../../../domain/realtime/realtimeEvents';
import { logger } from '../../../infrastructure/logging/logger';

const HEARTBEAT_MS = 25_000;

/**
 * Controlador SSE — GET /events (text/event-stream).
 * Una suscripción al EventBus por conexión.
 */
export class SseController {
  constructor(private readonly bus: EventBus) {}

  handle(req: Request, res: Response): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const onEvent = (event: RealtimeEvent): void => {
      try {
        writeSse(res, event.type, event.payload);
      } catch (err) {
        logger.exception('SSE write failed', err, {
          service: 'SseController',
          operation: 'write',
        });
      }
    };

    const unsubscribe = this.bus.subscribe(onEvent);

    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        cleanup();
      }
    }, HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  }
}

export function writeSse(
  res: Response,
  event: string,
  data: unknown,
): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}
