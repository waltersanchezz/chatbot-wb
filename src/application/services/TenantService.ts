import type { TenantDto } from '../../domain/tenant/tenantDto';
import { DEFAULT_TENANT_ID } from '../../domain/tenant/tenantDto';
import type { TenantRepository } from '../../domain/tenant/TenantRepository';

/**
 * Catálogo de tenants. No conoce motores de conversación.
 */
export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  ensureDefault(): TenantDto {
    return this.repository.ensureDefault(DEFAULT_TENANT_ID, 'Rodacenter');
  }

  getById(id: string): TenantDto | null {
    return this.repository.findById(id);
  }

  listActive(): TenantDto[] {
    return this.repository.listActive();
  }
}
