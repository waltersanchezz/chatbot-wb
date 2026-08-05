import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Resuelve la raíz del proyecto (donde está package.json),
 * sin depender de process.cwd().
 */
function resolveProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    const packageJson = path.join(dir, 'package.json');
    if (fs.existsSync(packageJson)) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const projectRoot = resolveProjectRoot();
const envPath = path.resolve(projectRoot, '.env');

const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const dotenvResult = dotenv.config({
  path: envPath,
  // En test, no pisar SQLITE_PATH / flags que fija vitest.config.ts
  override: !isTest,
});

if (dotenvResult.error && !isTest && process.env.NODE_ENV === 'production') {
  console.warn('[env] dotenv.config:', dotenvResult.error.message);
}

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Rodacenter AI'),
  COMPANY_NAME: z.string().default('Rodacenter Manizales'),
  WHATSAPP_VERIFY_TOKEN: z.string().default('rodacenter_verify_token'),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),
  /** App Secret de Meta — firma X-Hub-Signature-256 (obligatorio en production). */
  WHATSAPP_APP_SECRET: z.string().optional().default(''),
  /**
   * Fuerza verificación de firma aunque no sea production (tests / staging).
   * En production siempre se exige si hay APP_SECRET (y fail-fast sin secret).
   */
  WHATSAPP_SIGNATURE_REQUIRED: z.string().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  AI_PROVIDER: z.enum(['rule-based', 'openai']).default('rule-based'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** Directorio raíz de datos persistentes (SQLite, idempotencia, logs). */
  DATA_DIR: z.string().default('data'),
  LOG_DIR: z.string().optional().default(''),
  SESSION_TTL_MINUTES: z.coerce.number().default(120),
  RECOVERY_TTL_MINUTES: z.coerce.number().default(1440),
  SQLITE_PATH: z.string().optional().default(''),
  /** Archivo de idempotencia WhatsApp (wamids). Default: DATA_DIR/whatsapp-processed-wamids.json */
  WHATSAPP_IDEMPOTENCY_PATH: z.string().optional().default(''),
  TENANT_ID: z.string().default('rodacenter'),
  JWT_SECRET: z.string().default('rodacenter-dev-jwt-secret-change-me'),
  JWT_TTL_SECONDS: z.coerce.number().default(28800),
  AUTH_ADMIN_EMAIL: z.string().default('admin@rodacenter.local'),
  AUTH_ADMIN_PASSWORD: z.string().default('admin123'),
  AUTH_ADMIN_NAME: z.string().default('Admin Rodacenter'),
  AUTH_REQUIRED: z.string().default('true'),
  PERSISTENCE_TTL_MINUTES: z.coerce.number().default(1440),
  TIMEOUT_ENGINE_MS: z.coerce.number().default(8_000),
  TIMEOUT_MESSAGING_MS: z.coerce.number().default(6_000),
  TIMEOUT_PERSISTENCE_MS: z.coerce.number().default(3_000),
  TIMEOUT_CRM_MS: z.coerce.number().default(5_000),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
  /** Si true, monta /api/debug (nunca en production). */
  WHATSAPP_DEBUG_API: z.string().default('false'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

const raw = parsed.data;
const dataDir = path.isAbsolute(raw.DATA_DIR)
  ? raw.DATA_DIR
  : path.resolve(projectRoot, raw.DATA_DIR);

const sqlitePath = raw.SQLITE_PATH.trim()
  ? raw.SQLITE_PATH.trim() === ':memory:'
    ? ':memory:'
    : path.isAbsolute(raw.SQLITE_PATH.trim())
      ? raw.SQLITE_PATH.trim()
      : path.resolve(projectRoot, raw.SQLITE_PATH.trim())
  : path.join(dataDir, 'rodacenter.sqlite');

const logDir = raw.LOG_DIR.trim()
  ? path.isAbsolute(raw.LOG_DIR.trim())
    ? raw.LOG_DIR.trim()
    : path.resolve(projectRoot, raw.LOG_DIR.trim())
  : path.join(dataDir, 'logs');

const whatsappIdempotencyPath = raw.WHATSAPP_IDEMPOTENCY_PATH.trim()
  ? path.isAbsolute(raw.WHATSAPP_IDEMPOTENCY_PATH.trim())
    ? raw.WHATSAPP_IDEMPOTENCY_PATH.trim()
    : path.resolve(projectRoot, raw.WHATSAPP_IDEMPOTENCY_PATH.trim())
  : path.join(dataDir, 'whatsapp-processed-wamids.json');

const signatureRequiredFlag = ['true', '1', 'yes'].includes(
  String(raw.WHATSAPP_SIGNATURE_REQUIRED).trim().toLowerCase(),
);

const debugApiEnabled =
  raw.NODE_ENV !== 'production' &&
  ['true', '1', 'yes'].includes(String(raw.WHATSAPP_DEBUG_API).trim().toLowerCase());

export const env = {
  port: raw.PORT,
  nodeEnv: raw.NODE_ENV,
  appName: raw.APP_NAME,
  companyName: raw.COMPANY_NAME,
  dataDir,
  whatsapp: {
    verifyToken: raw.WHATSAPP_VERIFY_TOKEN,
    accessToken: raw.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: raw.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: raw.WHATSAPP_API_VERSION,
    appSecret: (raw.WHATSAPP_APP_SECRET ?? '').trim(),
    /** En production siempre se exige firma si hay appSecret (guard lo obliga). */
    signatureRequired:
      raw.NODE_ENV === 'production' || signatureRequiredFlag,
    debugApiEnabled,
    idempotencyPath: whatsappIdempotencyPath,
  },
  openai: {
    apiKey: raw.OPENAI_API_KEY,
    model: raw.OPENAI_MODEL,
  },
  aiProvider: raw.AI_PROVIDER,
  logLevel: raw.LOG_LEVEL,
  logDir,
  sessionTtlMinutes: raw.SESSION_TTL_MINUTES,
  recoveryTtlMinutes: raw.RECOVERY_TTL_MINUTES,
  sqlitePath,
  tenantId: raw.TENANT_ID.trim() || 'rodacenter',
  jwtSecret: raw.JWT_SECRET,
  jwtTtlSeconds: raw.JWT_TTL_SECONDS,
  auth: {
    adminEmail: raw.AUTH_ADMIN_EMAIL.trim().toLowerCase(),
    adminPassword: raw.AUTH_ADMIN_PASSWORD,
    adminName: raw.AUTH_ADMIN_NAME.trim() || 'Admin Rodacenter',
    required: !['false', '0', 'no'].includes(
      String(raw.AUTH_REQUIRED).trim().toLowerCase(),
    ),
  },
  persistenceTtlMinutes: raw.PERSISTENCE_TTL_MINUTES,
  timeouts: {
    engineMs: raw.TIMEOUT_ENGINE_MS,
    messagingMs: raw.TIMEOUT_MESSAGING_MS,
    persistenceMs: raw.TIMEOUT_PERSISTENCE_MS,
    crmMs: raw.TIMEOUT_CRM_MS,
  },
  telegram: {
    botToken: (raw.TELEGRAM_BOT_TOKEN ?? '').trim(),
    chatId: (raw.TELEGRAM_CHAT_ID ?? '').trim(),
  },
  envFilePath: envPath,
  projectRoot,
} as const;
