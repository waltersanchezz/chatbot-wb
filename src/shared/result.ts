/**
 * Resultado controlado para hardening: evita que excepciones crudas
 * atraviesen el canal de conversación.
 */
export type Result<T, E = ControlledError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type ErrorCode =
  | 'UNEXPECTED'
  | 'ORCHESTRATOR'
  | 'CATALOG'
  | 'MESSAGING'
  | 'PERSISTENCE'
  | 'CRM'
  | 'VALIDATION'
  | 'TIMEOUT';

export interface ControlledError {
  code: ErrorCode;
  /** Mensaje técnico (logs). */
  message: string;
  service: string;
  operation: string;
  stack?: string;
  cause?: unknown;
  meta?: Record<string, unknown>;
}

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(error: ControlledError): Result<never> {
  return { ok: false, error };
}

export function toControlledError(
  cause: unknown,
  context: {
    service: string;
    operation: string;
    code?: ErrorCode;
    meta?: Record<string, unknown>;
  },
): ControlledError {
  if (isControlledError(cause)) {
    return {
      ...cause,
      service: cause.service || context.service,
      operation: cause.operation || context.operation,
      meta: { ...cause.meta, ...context.meta },
    };
  }

  if (cause instanceof Error) {
    return {
      code: context.code ?? 'UNEXPECTED',
      message: cause.message || 'Error desconocido',
      service: context.service,
      operation: context.operation,
      stack: cause.stack,
      cause,
      meta: context.meta,
    };
  }

  return {
    code: context.code ?? 'UNEXPECTED',
    message: typeof cause === 'string' ? cause : 'Error desconocido',
    service: context.service,
    operation: context.operation,
    stack: new Error(String(cause)).stack,
    cause,
    meta: context.meta,
  };
}

export function isControlledError(value: unknown): value is ControlledError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'service' in value &&
    'operation' in value
  );
}

/** Ejecuta sync y captura cualquier throw como Result. */
export function tryCall<T>(
  fn: () => T,
  context: {
    service: string;
    operation: string;
    code?: ErrorCode;
    meta?: Record<string, unknown>;
  },
): Result<T> {
  try {
    return ok(fn());
  } catch (cause) {
    return err(toControlledError(cause, context));
  }
}

/** Ejecuta async y captura cualquier throw como Result. */
export async function tryCallAsync<T>(
  fn: () => Promise<T>,
  context: {
    service: string;
    operation: string;
    code?: ErrorCode;
    meta?: Record<string, unknown>;
  },
): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (cause) {
    return err(toControlledError(cause, context));
  }
}

/** Mensaje amable al usuario final (sin detalles técnicos). */
export const FRIENDLY_ERROR_REPLY = [
  'Disculpa, tuve un inconveniente técnico al procesar tu mensaje.',
  '',
  '¿Me lo puedes repetir en un momento?',
  'Si prefieres, escribe *asesor* y te conecto con alguien de Rodacenter Manizales.',
].join('\n');
