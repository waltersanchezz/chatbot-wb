/**
 * Integration Hub (Dashboard Sprint 20).
 * Conectores externos por tenant — desacoplados del chatbot.
 */

export const CONNECTOR_HEALTH_STATUSES = [
  'ONLINE',
  'OFFLINE',
  'ERROR',
  'PENDING',
] as const;

export type ConnectorHealthStatus = (typeof CONNECTOR_HEALTH_STATUSES)[number];

export const CONNECTOR_CATEGORIES = [
  'Messaging',
  'Email',
  'Chat',
  'Webhook',
  'Productivity',
  'Calendar',
  'Payments',
  'Commerce',
  'AI',
  'Automation',
  'Other',
] as const;

export type ConnectorCategory = (typeof CONNECTOR_CATEGORIES)[number];

/** Proveedores iniciales (mock) + roadmap de futuros. */
export const CONNECTOR_PROVIDERS = [
  'whatsapp',
  'telegram',
  'email',
  'slack',
  'discord',
  'webhook',
  'google_sheets',
  'google_calendar',
  // Futuros (arquitectura lista; sin implementación real aún)
  'meta',
  'google',
  'microsoft',
  'openai',
  'anthropic',
  'twilio',
  'stripe',
  'mercadopago',
  'shopify',
  'zapier',
  'n8n',
  'make',
  'rest',
] as const;

export type ConnectorProviderId = (typeof CONNECTOR_PROVIDERS)[number];

/** Proveedores con implementación mock lista para usar. */
export const IMPLEMENTED_CONNECTOR_PROVIDERS = [
  'whatsapp',
  'telegram',
  'email',
  'slack',
  'discord',
  'webhook',
  'google_sheets',
  'google_calendar',
] as const;

export type ImplementedConnectorProvider =
  (typeof IMPLEMENTED_CONNECTOR_PROVIDERS)[number];

export interface ConnectorDto {
  id: string;
  tenantId: string;
  provider: ConnectorProviderId;
  name: string;
  category: ConnectorCategory;
  enabled: boolean;
  config: Record<string, unknown>;
  status: ConnectorHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorCreateInput {
  provider: string;
  name: string;
  category?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  status?: string;
}

export interface ConnectorUpdateInput {
  name?: string;
  category?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  status?: string;
}

export interface ConnectorListFilters {
  q?: string;
  category?: string;
  provider?: string;
  enabled?: boolean;
  status?: string;
}

export interface ConnectorLogDto {
  id: string;
  tenantId: string;
  connectorId: string;
  event: string;
  status: string;
  message: string;
  createdAt: string;
}

export interface ConnectorLogCreateInput {
  connectorId: string;
  event: string;
  status: string;
  message: string;
}

export interface ConnectorActionResult {
  connector: ConnectorDto;
  health: {
    status: ConnectorHealthStatus;
    message: string;
    checkedAt: string;
  };
  log: ConnectorLogDto;
}

export function isConnectorHealthStatus(
  value: string,
): value is ConnectorHealthStatus {
  return (CONNECTOR_HEALTH_STATUSES as readonly string[]).includes(value);
}

export function isConnectorCategory(value: string): value is ConnectorCategory {
  return (CONNECTOR_CATEGORIES as readonly string[]).includes(value);
}

export function isConnectorProviderId(
  value: string,
): value is ConnectorProviderId {
  return (CONNECTOR_PROVIDERS as readonly string[]).includes(value);
}

export function isImplementedConnectorProvider(
  value: string,
): value is ImplementedConnectorProvider {
  return (IMPLEMENTED_CONNECTOR_PROVIDERS as readonly string[]).includes(value);
}

export function defaultCategoryForProvider(
  provider: string,
): ConnectorCategory {
  switch (provider) {
    case 'whatsapp':
    case 'telegram':
    case 'twilio':
      return 'Messaging';
    case 'email':
      return 'Email';
    case 'slack':
    case 'discord':
      return 'Chat';
    case 'webhook':
    case 'rest':
      return 'Webhook';
    case 'google_sheets':
      return 'Productivity';
    case 'google_calendar':
    case 'microsoft':
      return 'Calendar';
    case 'stripe':
    case 'mercadopago':
      return 'Payments';
    case 'shopify':
      return 'Commerce';
    case 'openai':
    case 'anthropic':
      return 'AI';
    case 'zapier':
    case 'n8n':
    case 'make':
      return 'Automation';
    default:
      return 'Other';
  }
}
