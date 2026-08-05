import type { TenantDto } from './tenantDto';

export interface TenantRepository {
  ensureDefault(tenantId?: string, name?: string): TenantDto;
  findById(id: string): TenantDto | null;
  listActive(): TenantDto[];
}
