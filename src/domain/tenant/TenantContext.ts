import { AsyncLocalStorage } from 'async_hooks';
import { DEFAULT_TENANT_ID } from './tenantDto';

export interface TenantStore {
  tenantId: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Contexto de tenant activo (AsyncLocalStorage).
 * Los motores de dominio no leen esto; solo infra / ConversationEngine borde.
 */
export const TenantContext = {
  run<T>(tenantId: string, fn: () => T): T {
    const id = normalizeTenantId(tenantId);
    return storage.run({ tenantId: id }, fn);
  },

  /**
   * Tenant del store activo, o default `rodacenter` si no hay contexto.
   * Mantiene compatibilidad con el comportamiento actual.
   */
  getTenantId(): string {
    return storage.getStore()?.tenantId ?? DEFAULT_TENANT_ID;
  },

  /** true si hay un store ALS explícito. */
  hasStore(): boolean {
    return storage.getStore() != null;
  },
};

export function normalizeTenantId(tenantId: string | null | undefined): string {
  const trimmed = (tenantId ?? '').trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_TENANT_ID;
}

export function getActiveTenantId(): string {
  return TenantContext.getTenantId();
}

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return TenantContext.run(tenantId, fn);
}
