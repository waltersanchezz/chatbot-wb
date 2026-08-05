import { env } from '../config/env';
import {
  isControlledError,
  toControlledError,
  type ControlledError,
} from '../../shared/result';
import type { TurnLogFields } from './turnContext';

type Level = 'debug' | 'info' | 'warn' | 'error';

const order: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function shouldLog(level: Level): boolean {
  return order[level] >= order[env.logLevel];
}

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function serializeError(error: ControlledError): Record<string, unknown> {
  return {
    code: error.code,
    service: error.service,
    operation: error.operation,
    error: error.message,
    stack: error.stack,
    meta: error.meta,
  };
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),

  /**
   * Único log estructurado de cierre de turno (requestId, conversationId, waId, stage, intent, durationMs).
   * No duplicar con console.log ad-hoc en el mismo turno.
   */
  turn(fields: TurnLogFields, extra?: Record<string, unknown>): void {
    write('info', 'turn.completed', {
      requestId: fields.requestId,
      conversationId: fields.conversationId,
      waId: fields.waId,
      stage: fields.stage,
      intent: fields.intent,
      durationMs: fields.durationMs,
      ...extra,
    });
  },

  /** Registra error controlado o excepción con stacktrace completo. */
  exception(
    message: string,
    cause: unknown,
    meta?: Record<string, unknown>,
  ): ControlledError {
    const controlled = isControlledError(cause)
      ? cause
      : toControlledError(cause, {
          service: (meta?.service as string) ?? 'unknown',
          operation: (meta?.operation as string) ?? 'unknown',
          code: meta?.code as ControlledError['code'] | undefined,
        });

    write('error', message, {
      ...meta,
      ...serializeError(controlled),
    });

    if (controlled.stack) {
      console.error(controlled.stack);
    }

    return controlled;
  },
};
