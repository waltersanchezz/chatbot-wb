import type {
  ClientDetailDto,
  ClientListDto,
  ClientListQuery,
} from './clientDto';

/**
 * Puerto Client API (Dashboard). Independiente del CRM /api/customers.
 */
export interface ClientRepository {
  list(query?: ClientListQuery): ClientListDto;
  findById(id: string): ClientDetailDto | null;
}
