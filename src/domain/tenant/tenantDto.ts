/**
 * DTOs multi-tenant (Sprint 9).
 */

export const DEFAULT_TENANT_ID = 'rodacenter';

export interface TenantDto {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
}
