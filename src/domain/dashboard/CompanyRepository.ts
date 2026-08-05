import type { CompanyDto, CompanyUpdateInput } from './companyDto';

export interface CompanyRepository {
  getCompany(): CompanyDto;
  updateCompany(input: CompanyUpdateInput): CompanyDto;
}
