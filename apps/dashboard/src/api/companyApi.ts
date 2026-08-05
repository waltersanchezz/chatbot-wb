import { apiFetch } from './http'

export interface CompanyDto {
  tenantId: string
  companyName: string
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  country: string | null
  businessType: string | null
  welcomeMessage: string | null
  workingHours: string | null
  createdAt: string
  updatedAt: string
}

export type CompanyUpdateInput = Partial<
  Omit<CompanyDto, 'tenantId' | 'createdAt' | 'updatedAt'>
>

export async function fetchCompany(): Promise<CompanyDto> {
  const res = await apiFetch('/api/company')
  if (!res.ok) throw new Error(`Company API ${res.status}`)
  return (await res.json()) as CompanyDto
}

export async function updateCompany(
  input: CompanyUpdateInput,
): Promise<CompanyDto> {
  const res = await apiFetch('/api/company', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(`Company API ${res.status}`)
  return (await res.json()) as CompanyDto
}
