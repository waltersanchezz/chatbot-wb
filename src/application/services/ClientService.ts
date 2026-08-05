import type {
  ClientDetailDto,
  ClientListDto,
  ClientListQuery,
} from '../../domain/dashboard/clientDto';
import type { ClientRepository } from '../../domain/dashboard/ClientRepository';

/**
 * Client API — agregación de clientes desde SQLite para el Dashboard.
 */
export class ClientService {
  constructor(private readonly repository: ClientRepository) {}

  listClients(query?: ClientListQuery): ClientListDto {
    return this.repository.list(query);
  }

  getById(id: string): ClientDetailDto | null {
    const trimmed = id?.trim();
    if (!trimmed) return null;
    return this.repository.findById(trimmed);
  }
}
