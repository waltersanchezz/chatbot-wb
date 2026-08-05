import type {
  ConnectorCreateInput,
  ConnectorDto,
  ConnectorListFilters,
  ConnectorLogCreateInput,
  ConnectorLogDto,
  ConnectorUpdateInput,
} from './connectorDto';

export interface ConnectorRepository {
  list(filters?: ConnectorListFilters): ConnectorDto[];
  getById(id: string): ConnectorDto | null;
  create(input: ConnectorCreateInput): ConnectorDto;
  update(id: string, input: ConnectorUpdateInput): ConnectorDto | null;
  delete(id: string): boolean;
  appendLog(input: ConnectorLogCreateInput): ConnectorLogDto;
  listLogs(options?: {
    connectorId?: string;
    limit?: number;
  }): ConnectorLogDto[];
}
