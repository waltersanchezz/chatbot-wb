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

console.log('[env] process.cwd():', process.cwd());
console.log('[env] __dirname:', __dirname);
console.log('[env] Raíz del proyecto:', projectRoot);
console.log('[env] Archivo cargado:', envPath);
console.log('[env] ¿Existe el archivo?:', fs.existsSync(envPath));

const dotenvResult = dotenv.config({
  path: envPath,
  // El .env de la raíz del proyecto manda sobre variables vacías previas.
  override: true,
});

if (dotenvResult.error) {
  console.warn('[env] dotenv.config error:', dotenvResult.error.message);
} else {
  console.log('[env] Archivo cargado:', envPath);
}

const telegramToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
const telegramChatId = (process.env.TELEGRAM_CHAT_ID ?? '').trim();

console.log('[env] TELEGRAM_CHAT_ID presente:', Boolean(telegramChatId));
console.log(
  '[env] TELEGRAM_BOT_TOKEN presente:',
  Boolean(telegramToken),
  telegramToken ? `(${telegramToken.slice(0, 8)}***)` : '',
);

if (!telegramToken || !telegramChatId) {
  try {
    const rawEnv = fs.readFileSync(envPath, 'utf8');
    const tokenLine = rawEnv.split(/\r?\n/).find((l) => l.startsWith('TELEGRAM_BOT_TOKEN='));
    const chatLine = rawEnv.split(/\r?\n/).find((l) => l.startsWith('TELEGRAM_CHAT_ID='));
    const tokenLen = tokenLine ? tokenLine.slice('TELEGRAM_BOT_TOKEN='.length).trim().length : -1;
    const chatLen = chatLine ? chatLine.slice('TELEGRAM_CHAT_ID='.length).trim().length : -1;
    console.warn('[env] Diagnóstico .env en disco:', {
      tokenLineFound: Boolean(tokenLine),
      tokenValueLength: tokenLen,
      chatLineFound: Boolean(chatLine),
      chatValueLength: chatLen,
    });
  } catch (err) {
    console.warn(
      '[env] No se pudo leer el .env para diagnóstico:',
      err instanceof Error ? err.message : err,
    );
  }
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
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  AI_PROVIDER: z.enum(['rule-based', 'openai']).default('rule-based'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_DIR: z.string().default('logs'),
  SESSION_TTL_MINUTES: z.coerce.number().default(120),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_CHAT_ID: z.string().optional().default(''),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration');
}

const raw = parsed.data;

export const env = {
  port: raw.PORT,
  nodeEnv: raw.NODE_ENV,
  appName: raw.APP_NAME,
  companyName: raw.COMPANY_NAME,
  whatsapp: {
    verifyToken: raw.WHATSAPP_VERIFY_TOKEN,
    accessToken: raw.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: raw.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: raw.WHATSAPP_API_VERSION,
  },
  openai: {
    apiKey: raw.OPENAI_API_KEY,
    model: raw.OPENAI_MODEL,
  },
  aiProvider: raw.AI_PROVIDER,
  logLevel: raw.LOG_LEVEL,
  logDir: raw.LOG_DIR,
  sessionTtlMinutes: raw.SESSION_TTL_MINUTES,
  telegram: {
    botToken: (raw.TELEGRAM_BOT_TOKEN ?? '').trim(),
    chatId: (raw.TELEGRAM_CHAT_ID ?? '').trim(),
  },
  envFilePath: envPath,
} as const;
