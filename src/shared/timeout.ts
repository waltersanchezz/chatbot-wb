import {
  err,
  ok,
  toControlledError,
  type ErrorCode,
  type Result,
} from './result';

export class TimeoutError extends Error {
  readonly code = 'TIMEOUT' as const;

  constructor(
    readonly service: string,
    readonly operation: string,
    readonly timeoutMs: number,
  ) {
    super(`Timeout after ${timeoutMs}ms (${service}.${operation})`);
    this.name = 'TimeoutError';
  }
}

/**
 * Ejecuta una promesa con límite de tiempo.
 * Si vence: cancela la espera (no bloquea el canal), registra vía Result y permite continuar.
 * La operación en background puede seguir; el caller no la espera.
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  context: {
    service: string;
    operation: string;
    code?: ErrorCode;
    meta?: Record<string, unknown>;
  },
): Promise<Result<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<Result<T>>((resolve) => {
    timer = setTimeout(() => {
      const timeoutErr = new TimeoutError(
        context.service,
        context.operation,
        timeoutMs,
      );
      resolve(
        err({
          code: context.code ?? 'TIMEOUT',
          message: timeoutErr.message,
          service: context.service,
          operation: context.operation,
          stack: timeoutErr.stack,
          cause: timeoutErr,
          meta: { ...context.meta, timeoutMs },
        }),
      );
    }, timeoutMs);
  });

  const workPromise = (async (): Promise<Result<T>> => {
    try {
      return ok(await operation());
    } catch (cause) {
      return err(
        toControlledError(cause, {
          service: context.service,
          operation: context.operation,
          code: context.code,
          meta: context.meta,
        }),
      );
    }
  })();

  try {
    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
