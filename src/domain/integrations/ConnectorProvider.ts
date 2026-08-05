/**
 * Puerto de conector externo (Integration Hub).
 * Intercambiable: mocks → Meta/Google/Microsoft/Twilio/etc. sin tocar IntegrationService.
 */
export type ConnectorHealthStatus =
  | 'ONLINE'
  | 'OFFLINE'
  | 'ERROR'
  | 'PENDING';

export interface ConnectorHealthResult {
  status: ConnectorHealthStatus;
  message: string;
  checkedAt: string;
}

export interface ConnectorExecuteInput {
  action: string;
  payload?: Record<string, unknown>;
}

export interface ConnectorExecuteResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export interface ConnectorProvider {
  readonly provider: string;
  connect(config: Record<string, unknown>): Promise<ConnectorHealthResult>;
  disconnect(config: Record<string, unknown>): Promise<ConnectorHealthResult>;
  health(config: Record<string, unknown>): Promise<ConnectorHealthResult>;
  execute(
    config: Record<string, unknown>,
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult>;
  refresh(config: Record<string, unknown>): Promise<ConnectorHealthResult>;
}
