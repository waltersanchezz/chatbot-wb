import type {
  ConnectorExecuteInput,
  ConnectorExecuteResult,
  ConnectorHealthResult,
  ConnectorHealthStatus,
  ConnectorProvider,
} from '../../domain/integrations/ConnectorProvider';

/**
 * Base mock: simula connect/health/execute/refresh.
 * `config.forceError === true` o falta de `config.apiKey` (si requireApiKey) → ERROR.
 */
export abstract class MockConnectorBase implements ConnectorProvider {
  abstract readonly provider: string;
  protected abstract readonly displayName: string;
  protected readonly requireApiKey: boolean = true;

  async connect(
    config: Record<string, unknown>,
  ): Promise<ConnectorHealthResult> {
    return this.runHealth('connect', config, 'ONLINE');
  }

  async disconnect(
    _config: Record<string, unknown>,
  ): Promise<ConnectorHealthResult> {
    return {
      status: 'OFFLINE',
      message: `${this.displayName}: desconectado (mock)`,
      checkedAt: new Date().toISOString(),
    };
  }

  async health(
    config: Record<string, unknown>,
  ): Promise<ConnectorHealthResult> {
    return this.runHealth('health', config, 'ONLINE');
  }

  async execute(
    config: Record<string, unknown>,
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> {
    const health = await this.health(config);
    if (health.status === 'ERROR' || health.status === 'OFFLINE') {
      return {
        ok: false,
        message: `${this.displayName}: no se puede ejecutar (${health.status})`,
        data: { action: input.action },
      };
    }
    return {
      ok: true,
      message: `${this.displayName}: acción "${input.action}" simulada`,
      data: {
        action: input.action,
        payload: input.payload ?? {},
        provider: this.provider,
      },
    };
  }

  async refresh(
    config: Record<string, unknown>,
  ): Promise<ConnectorHealthResult> {
    return this.runHealth('refresh', config, 'ONLINE');
  }

  protected runHealth(
    event: string,
    config: Record<string, unknown>,
    okStatus: ConnectorHealthStatus,
  ): ConnectorHealthResult {
    if (config.forcePending === true) {
      return {
        status: 'PENDING',
        message: `${this.displayName}: pendiente de autorización (${event})`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (config.forceError === true) {
      return {
        status: 'ERROR',
        message: `${this.displayName}: error forzado (${event})`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (this.requireApiKey) {
      const key = config.apiKey ?? config.token ?? config.webhookUrl;
      if (key === undefined || key === null || String(key).trim() === '') {
        return {
          status: 'ERROR',
          message: `${this.displayName}: falta credencial (apiKey/token/webhookUrl)`,
          checkedAt: new Date().toISOString(),
        };
      }
    }
    return {
      status: okStatus,
      message: `${this.displayName}: ${event} OK (mock)`,
      checkedAt: new Date().toISOString(),
    };
  }
}

export class WhatsAppConnector extends MockConnectorBase {
  readonly provider = 'whatsapp';
  protected readonly displayName = 'WhatsApp';
}

export class TelegramConnector extends MockConnectorBase {
  readonly provider = 'telegram';
  protected readonly displayName = 'Telegram';
}

export class EmailConnector extends MockConnectorBase {
  readonly provider = 'email';
  protected readonly displayName = 'Email';
}

export class SlackConnector extends MockConnectorBase {
  readonly provider = 'slack';
  protected readonly displayName = 'Slack';
}

export class DiscordConnector extends MockConnectorBase {
  readonly provider = 'discord';
  protected readonly displayName = 'Discord';
}

export class WebhookConnector extends MockConnectorBase {
  readonly provider = 'webhook';
  protected readonly displayName = 'Webhook';
  protected readonly requireApiKey = false;

  protected runHealth(
    event: string,
    config: Record<string, unknown>,
    okStatus: ConnectorHealthStatus,
  ): ConnectorHealthResult {
    if (config.forcePending === true || config.forceError === true) {
      return super.runHealth(event, config, okStatus);
    }
    const url = config.webhookUrl ?? config.url;
    if (!url || String(url).trim() === '') {
      return {
        status: 'ERROR',
        message: 'Webhook: falta webhookUrl',
        checkedAt: new Date().toISOString(),
      };
    }
    return {
      status: okStatus,
      message: `Webhook: ${event} OK (mock)`,
      checkedAt: new Date().toISOString(),
    };
  }
}

export class GoogleSheetsConnector extends MockConnectorBase {
  readonly provider = 'google_sheets';
  protected readonly displayName = 'Google Sheets';
}

export class GoogleCalendarConnector extends MockConnectorBase {
  readonly provider = 'google_calendar';
  protected readonly displayName = 'Google Calendar';
}

const REGISTRY: Record<string, () => ConnectorProvider> = {
  whatsapp: () => new WhatsAppConnector(),
  telegram: () => new TelegramConnector(),
  email: () => new EmailConnector(),
  slack: () => new SlackConnector(),
  discord: () => new DiscordConnector(),
  webhook: () => new WebhookConnector(),
  google_sheets: () => new GoogleSheetsConnector(),
  google_calendar: () => new GoogleCalendarConnector(),
};

export function resolveConnectorProvider(
  provider: string,
): ConnectorProvider | null {
  const factory = REGISTRY[provider];
  return factory ? factory() : null;
}

export function listRegisteredConnectorProviders(): string[] {
  return Object.keys(REGISTRY);
}
