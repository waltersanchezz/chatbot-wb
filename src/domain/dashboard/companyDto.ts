/**
 * Configuración de empresa / white-label (Sprint 11).
 */

export interface CompanyDto {
  tenantId: string;
  companyName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  businessType: string | null;
  welcomeMessage: string | null;
  workingHours: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Campos editables vía PUT /api/company (sin tenantId ni timestamps). */
export type CompanyUpdateInput = Partial<
  Omit<CompanyDto, 'tenantId' | 'createdAt' | 'updatedAt'>
>;

export function defaultCompanyDto(
  tenantId: string,
  nowIso: string = new Date().toISOString(),
): CompanyDto {
  return {
    tenantId,
    companyName: 'Rodacenter',
    logoUrl: null,
    primaryColor: '#c45c26',
    secondaryColor: '#121a22',
    phone: null,
    email: null,
    website: null,
    address: null,
    city: null,
    country: 'Colombia',
    businessType: null,
    welcomeMessage: null,
    workingHours: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
