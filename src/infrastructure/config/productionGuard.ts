import type { env as EnvType } from './env';

const INSECURE_JWT = 'rodacenter-dev-jwt-secret-change-me';
const INSECURE_ADMIN_PASSWORD = 'admin123';
const INSECURE_VERIFY_TOKEN = 'rodacenter_verify_token';

/**
 * Fail-fast de seguridad y canal en producción.
 * Impide boot “verde” sin WhatsApp real, auth, disco o Telegram de handoff.
 */
export function assertProductionReady(
  config: typeof EnvType,
): void {
  if (config.nodeEnv !== 'production') return;

  const errors: string[] = [];

  if (
    !config.jwtSecret ||
    config.jwtSecret === INSECURE_JWT ||
    config.jwtSecret.length < 32
  ) {
    errors.push(
      'JWT_SECRET must be a strong secret (≥32 chars) and not the development default',
    );
  }

  if (
    !config.auth.adminPassword ||
    config.auth.adminPassword === INSECURE_ADMIN_PASSWORD
  ) {
    errors.push(
      'AUTH_ADMIN_PASSWORD must not be the development default (admin123)',
    );
  }

  if (!config.auth.required) {
    errors.push(
      'AUTH_REQUIRED must be true in production (CRM/APIs must not be public)',
    );
  }

  if (!config.sqlitePath || config.sqlitePath === ':memory:') {
    errors.push(
      'SQLITE_PATH must be set to a durable file path in production (e.g. /var/data/rodacenter.sqlite), not empty or :memory:',
    );
  }

  if (!config.whatsapp.appSecret?.trim()) {
    errors.push(
      'WHATSAPP_APP_SECRET is required in production (X-Hub-Signature-256 verification)',
    );
  }

  if (
    !config.whatsapp.verifyToken ||
    config.whatsapp.verifyToken === INSECURE_VERIFY_TOKEN
  ) {
    errors.push(
      'WHATSAPP_VERIFY_TOKEN must not be the development default',
    );
  }

  if (!config.whatsapp.accessToken?.trim()) {
    errors.push(
      'WHATSAPP_ACCESS_TOKEN is required in production (outbound Cloud API)',
    );
  }

  if (!config.whatsapp.phoneNumberId?.trim()) {
    errors.push(
      'WHATSAPP_PHONE_NUMBER_ID is required in production (outbound Cloud API)',
    );
  }

  if (!config.telegram.botToken?.trim() || !config.telegram.chatId?.trim()) {
    errors.push(
      'TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required in production (advisor handoff)',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `Production security check failed:\n- ${errors.join('\n- ')}`,
    );
  }
}

export const PRODUCTION_INSECURE_DEFAULTS = {
  jwtSecret: INSECURE_JWT,
  adminPassword: INSECURE_ADMIN_PASSWORD,
  verifyToken: INSECURE_VERIFY_TOKEN,
} as const;
