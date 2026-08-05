import type { ConnectorRepository } from '../../domain/dashboard/ConnectorRepository';
import type {
  ConnectorActionResult,
  ConnectorCreateInput,
  ConnectorDto,
  ConnectorListFilters,
  ConnectorLogDto,
  ConnectorUpdateInput,
} from '../../domain/dashboard/connectorDto';
import {
  defaultCategoryForProvider,
  isConnectorCategory,
  isConnectorHealthStatus,
  isImplementedConnectorProvider,
} from '../../domain/dashboard/connectorDto';
import { resolveConnectorProvider } from '../../infrastructure/integrations/mockConnectors';

export class IntegrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationValidationError';
  }
}

/**
 * Integration Hub — orquesta conectores mock/reales vía ConnectorProvider.
 * No modifica motores del chatbot ni módulos existentes.
 */
export class IntegrationService {
  constructor(private readonly repository: ConnectorRepository) {}

  list(filters?: ConnectorListFilters): ConnectorDto[] {
    return this.repository.list(filters);
  }

  getById(id: string): ConnectorDto | null {
    return this.repository.getById(id);
  }

  create(input: ConnectorCreateInput): ConnectorDto {
    this.assertCreate(input);
    const provider = input.provider.trim().toLowerCase();
    const category =
      input.category && isConnectorCategory(input.category)
        ? input.category
        : defaultCategoryForProvider(provider);
    return this.repository.create({
      provider,
      name: input.name.trim(),
      category,
      enabled: input.enabled !== false,
      config: input.config ?? {},
      status: 'PENDING',
    });
  }

  update(id: string, input: ConnectorUpdateInput): ConnectorDto | null {
    if (!id.trim()) {
      throw new IntegrationValidationError('id es obligatorio');
    }
    this.assertUpdate(input);
    const patch: ConnectorUpdateInput = { ...input };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.category !== undefined && !isConnectorCategory(input.category)) {
      throw new IntegrationValidationError(
        `Categoría inválida: ${input.category}`,
      );
    }
    if (input.status !== undefined && !isConnectorHealthStatus(input.status)) {
      throw new IntegrationValidationError(`Estado inválido: ${input.status}`);
    }
    return this.repository.update(id, patch);
  }

  delete(id: string): boolean {
    if (!id.trim()) {
      throw new IntegrationValidationError('id es obligatorio');
    }
    return this.repository.delete(id);
  }

  async connect(id: string): Promise<ConnectorActionResult> {
    const connector = this.requireConnector(id);
    const provider = this.requireProvider(connector.provider);
    const health = await provider.connect(connector.config);
    const updated =
      this.repository.update(id, {
        status: health.status,
        enabled: true,
      }) ?? connector;
    const log = this.repository.appendLog({
      connectorId: id,
      event: 'connect',
      status: health.status,
      message: health.message,
    });
    return { connector: updated, health, log };
  }

  async disconnect(id: string): Promise<ConnectorActionResult> {
    const connector = this.requireConnector(id);
    const provider = this.requireProvider(connector.provider);
    const health = await provider.disconnect(connector.config);
    const updated =
      this.repository.update(id, {
        status: health.status,
        enabled: false,
      }) ?? connector;
    const log = this.repository.appendLog({
      connectorId: id,
      event: 'disconnect',
      status: health.status,
      message: health.message,
    });
    return { connector: updated, health, log };
  }

  /** Prueba de salud (test connection). */
  async test(id: string): Promise<ConnectorActionResult> {
    const connector = this.requireConnector(id);
    const provider = this.requireProvider(connector.provider);
    const health = await provider.health(connector.config);
    const updated =
      this.repository.update(id, { status: health.status }) ?? connector;
    const log = this.repository.appendLog({
      connectorId: id,
      event: 'test',
      status: health.status,
      message: health.message,
    });
    return { connector: updated, health, log };
  }

  async execute(
    id: string,
    action: string,
    payload?: Record<string, unknown>,
  ): Promise<{
    connector: ConnectorDto;
    result: Awaited<
      ReturnType<
        NonNullable<ReturnType<typeof resolveConnectorProvider>>['execute']
      >
    >;
    log: ConnectorLogDto;
  }> {
    const connector = this.requireConnector(id);
    if (!connector.enabled) {
      throw new IntegrationValidationError('El conector está desactivado');
    }
    const provider = this.requireProvider(connector.provider);
    const result = await provider.execute(connector.config, {
      action: action?.trim() || 'default',
      payload,
    });
    const log = this.repository.appendLog({
      connectorId: id,
      event: 'execute',
      status: result.ok ? 'ONLINE' : 'ERROR',
      message: result.message,
    });
    return { connector, result, log };
  }

  async refresh(id: string): Promise<ConnectorActionResult> {
    const connector = this.requireConnector(id);
    const provider = this.requireProvider(connector.provider);
    const health = await provider.refresh(connector.config);
    const updated =
      this.repository.update(id, { status: health.status }) ?? connector;
    const log = this.repository.appendLog({
      connectorId: id,
      event: 'refresh',
      status: health.status,
      message: health.message,
    });
    return { connector: updated, health, log };
  }

  listLogs(options?: {
    connectorId?: string;
    limit?: number;
  }): ConnectorLogDto[] {
    return this.repository.listLogs(options);
  }

  private requireConnector(id: string): ConnectorDto {
    if (!id.trim()) {
      throw new IntegrationValidationError('id es obligatorio');
    }
    const connector = this.repository.getById(id);
    if (!connector) {
      throw new IntegrationValidationError(`Conector no encontrado: ${id}`);
    }
    return connector;
  }

  private requireProvider(providerId: string) {
    if (!isImplementedConnectorProvider(providerId)) {
      throw new IntegrationValidationError(
        `Proveedor no implementado aún: ${providerId}`,
      );
    }
    const provider = resolveConnectorProvider(providerId);
    if (!provider) {
      throw new IntegrationValidationError(
        `Proveedor no registrado: ${providerId}`,
      );
    }
    return provider;
  }

  private assertCreate(input: ConnectorCreateInput): void {
    if (!input.name?.trim()) {
      throw new IntegrationValidationError('name es obligatorio');
    }
    if (!input.provider?.trim()) {
      throw new IntegrationValidationError('provider es obligatorio');
    }
    const provider = input.provider.trim().toLowerCase();
    if (!isImplementedConnectorProvider(provider)) {
      throw new IntegrationValidationError(
        `Proveedor no disponible: ${provider}. Usa uno de: whatsapp, telegram, email, slack, discord, webhook, google_sheets, google_calendar`,
      );
    }
    if (input.category && !isConnectorCategory(input.category)) {
      throw new IntegrationValidationError(
        `Categoría inválida: ${input.category}`,
      );
    }
  }

  private assertUpdate(input: ConnectorUpdateInput): void {
    if (
      input.name === undefined &&
      input.category === undefined &&
      input.enabled === undefined &&
      input.config === undefined &&
      input.status === undefined
    ) {
      throw new IntegrationValidationError('Sin campos para actualizar');
    }
    if (input.name !== undefined && !input.name.trim()) {
      throw new IntegrationValidationError('name no puede estar vacío');
    }
  }
}
