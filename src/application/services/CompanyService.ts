import type {
  CompanyDto,
  CompanyUpdateInput,
} from '../../domain/dashboard/companyDto';
import type { CompanyRepository } from '../../domain/dashboard/CompanyRepository';

/**
 * Configuración de empresa (white-label) por tenant.
 * No conoce ConversationEngine ni motores de venta.
 */
export class CompanyService {
  constructor(private readonly repository: CompanyRepository) {}

  getCompany(): CompanyDto {
    return this.repository.getCompany();
  }

  updateCompany(input: CompanyUpdateInput): CompanyDto {
    return this.repository.updateCompany(input);
  }
}
