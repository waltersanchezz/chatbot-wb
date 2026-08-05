/**
 * Developer Platform (Dashboard Sprint 22).
 * API Keys + SDKs — capa desacoplada para integraciones de terceros.
 */

export const API_KEY_PERMISSIONS = [
  'read',
  'write',
  'admin',
  'analytics',
  'knowledge',
  'automation',
  'workflow',
  'billing',
  'marketplace',
  'integrations',
  'copilot',
] as const;

export type ApiKeyPermission = (typeof API_KEY_PERMISSIONS)[number];

export const SDK_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'php',
  'java',
  'csharp',
  'go',
  'rest',
] as const;

export type SdkLanguage = (typeof SDK_LANGUAGES)[number];

export interface ApiKeyDto {
  id: string;
  tenantId: string;
  name: string;
  /** Prefijo seguro para identificación (nunca el secreto completo). */
  keyPrefix: string;
  permissions: ApiKeyPermission[];
  enabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Respuesta al crear/rotar: incluye el secreto una sola vez. */
export interface ApiKeyCreatedDto {
  key: ApiKeyDto;
  /** Secreto en claro — mostrar una sola vez. */
  secret: string;
}

export interface ApiKeyCreateInput {
  name: string;
  permissions?: string[];
  enabled?: boolean;
}

export interface ApiKeyUpdateInput {
  name?: string;
  permissions?: string[];
  enabled?: boolean;
}

export interface ApiRequestDto {
  id: string;
  tenantId: string;
  apiKeyId: string;
  endpoint: string;
  method: string;
  status: number;
  latencyMs: number;
  createdAt: string;
}

export interface ApiRequestCreateInput {
  apiKeyId: string;
  endpoint: string;
  method: string;
  status: number;
  latencyMs: number;
}

export interface SdkTokenDto {
  id: string;
  tenantId: string;
  name: string;
  language: SdkLanguage;
  version: string;
  createdAt: string;
}

export interface SdkCatalogItem {
  language: SdkLanguage;
  name: string;
  version: string;
  status: 'ready' | 'planned';
  install: string;
  docsUrl: string;
}

export interface CodeExample {
  language: string;
  title: string;
  code: string;
}

export interface DeveloperDocsDto {
  baseUrl: string;
  authHeader: string;
  sdks: SdkCatalogItem[];
  examples: CodeExample[];
  permissions: ApiKeyPermission[];
}

export interface DeveloperUsageStats {
  totalRequests: number;
  errorCount: number;
  avgLatencyMs: number;
  byEndpoint: Array<{ endpoint: string; count: number; avgLatencyMs: number }>;
  byApiKey: Array<{ apiKeyId: string; count: number; errors: number }>;
}

export function isApiKeyPermission(value: string): value is ApiKeyPermission {
  return (API_KEY_PERMISSIONS as readonly string[]).includes(value);
}

export function isSdkLanguage(value: string): value is SdkLanguage {
  return (SDK_LANGUAGES as readonly string[]).includes(value);
}

export function normalizePermissions(
  values: string[] | undefined,
): ApiKeyPermission[] {
  if (!values?.length) return ['read'];
  const out: ApiKeyPermission[] = [];
  for (const v of values) {
    const p = String(v).trim().toLowerCase();
    if (isApiKeyPermission(p) && !out.includes(p)) out.push(p);
  }
  return out.length ? out : ['read'];
}

export function keyPrefixFromSecret(secret: string): string {
  const clean = secret.trim();
  if (clean.length <= 12) return `${clean.slice(0, 4)}…`;
  return `${clean.slice(0, 8)}…${clean.slice(-4)}`;
}
