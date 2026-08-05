import { createHash, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { ApiKeyRepository } from '../../domain/dashboard/ApiKeyRepository';
import type {
  ApiKeyDto,
  ApiKeyPermission,
  ApiKeyUpdateInput,
  ApiRequestCreateInput,
  ApiRequestDto,
  SdkLanguage,
  SdkTokenDto,
} from '../../domain/dashboard/developerDto';
import {
  isApiKeyPermission,
  isSdkLanguage,
  keyPrefixFromSecret,
} from '../../domain/dashboard/developerDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

interface KeyRow {
  id: string;
  tenant_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  permissions_json: string;
  enabled: number;
  last_used_at: number | null;
  created_at: number;
}

interface RequestRow {
  id: string;
  tenant_id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status: number;
  latency_ms: number;
  created_at: number;
}

interface SdkRow {
  id: string;
  tenant_id: string;
  name: string;
  language: string;
  version: string;
  created_at: number;
}

const SDK_SEEDS: Array<{
  language: SdkLanguage;
  name: string;
  version: string;
}> = [
  { language: 'javascript', name: 'Rodacenter JS SDK', version: '0.1.0' },
  { language: 'typescript', name: 'Rodacenter TS SDK', version: '0.1.0' },
  { language: 'python', name: 'Rodacenter Python SDK', version: '0.1.0' },
  { language: 'php', name: 'Rodacenter PHP SDK', version: '0.1.0' },
  { language: 'java', name: 'Rodacenter Java SDK', version: '0.1.0' },
  { language: 'csharp', name: 'Rodacenter C# SDK', version: '0.1.0' },
  { language: 'go', name: 'Rodacenter Go SDK', version: '0.1.0' },
  { language: 'rest', name: 'Rodacenter REST', version: '1.0.0' },
];

export function hashApiKeySecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function generateApiKeySecret(): string {
  return `rc_live_${randomBytes(24).toString('base64url')}`;
}

/**
 * Persistencia Developer Platform — API keys (hash), requests y SDK tokens.
 */
export class SQLiteApiKeyRepository implements ApiKeyRepository {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly fixedTenantId?: string;
  private readonly idFactory: () => string;

  constructor(
    databasePath: string = ':memory:',
    options: {
      now?: () => number;
      idFactory?: () => string;
    } & TenantScopedOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.fixedTenantId = options.tenantId;
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.db = new DatabaseSync(databasePath);
    if (databasePath !== ':memory:') {
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
      } catch {
        /* ignore */
      }
    }
    this.ensureSchema();
    this.ensureSdkSeeds();
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        permissions_json TEXT NOT NULL DEFAULT '["read"]',
        enabled INTEGER NOT NULL DEFAULT 1,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash
        ON api_keys(tenant_id, key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_keys_tenant
        ON api_keys(tenant_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS api_requests (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        api_key_id TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        method TEXT NOT NULL,
        status INTEGER NOT NULL,
        latency_ms INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_api_requests_tenant
        ON api_requests(tenant_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_api_requests_key
        ON api_requests(tenant_id, api_key_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS sdk_tokens (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        language TEXT NOT NULL,
        version TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sdk_tokens_tenant
        ON sdk_tokens(tenant_id, language);
    `);
  }

  ensureSdkSeeds(): void {
    const tenantId = this.tenant();
    const now = this.now();
    const insert = this.db.prepare(
      `
      INSERT INTO sdk_tokens (id, tenant_id, name, language, version, created_at)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM sdk_tokens
        WHERE tenant_id = ? AND language = ?
      )
    `,
    );
    for (const seed of SDK_SEEDS) {
      insert.run(
        this.idFactory(),
        tenantId,
        seed.name,
        seed.language,
        seed.version,
        now,
        tenantId,
        seed.language,
      );
    }
  }

  listKeys(): ApiKeyDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM api_keys
        WHERE tenant_id = ?
        ORDER BY created_at DESC
      `,
      )
      .all(this.tenant()) as unknown as KeyRow[];
    return rows.map(rowToKey);
  }

  getKeyById(id: string): ApiKeyDto | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM api_keys
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .get(id, this.tenant()) as KeyRow | undefined;
    return row ? rowToKey(row) : null;
  }

  getKeyHashById(id: string): string | null {
    const row = this.db
      .prepare(
        `
        SELECT key_hash FROM api_keys
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .get(id, this.tenant()) as { key_hash: string } | undefined;
    return row?.key_hash ?? null;
  }

  findKeyByHash(keyHash: string): ApiKeyDto | null {
    const row = this.db
      .prepare(
        `
        SELECT * FROM api_keys
        WHERE key_hash = ? AND tenant_id = ?
      `,
      )
      .get(keyHash, this.tenant()) as KeyRow | undefined;
    return row ? rowToKey(row) : null;
  }

  createKey(input: {
    name: string;
    keyHash: string;
    keyPrefix: string;
    permissions: string[];
    enabled?: boolean;
  }): ApiKeyDto {
    const id = this.idFactory();
    const now = this.now();
    const tenantId = this.tenant();
    this.db
      .prepare(
        `
        INSERT INTO api_keys (
          id, tenant_id, name, key_hash, key_prefix, permissions_json,
          enabled, last_used_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
      `,
      )
      .run(
        id,
        tenantId,
        input.name.trim(),
        input.keyHash,
        input.keyPrefix,
        JSON.stringify(input.permissions),
        input.enabled === false ? 0 : 1,
        now,
      );
    return this.getKeyById(id)!;
  }

  updateKey(
    id: string,
    input: ApiKeyUpdateInput & { keyHash?: string; keyPrefix?: string },
  ): ApiKeyDto | null {
    const existing = this.getKeyById(id);
    if (!existing) return null;
    const hash = this.getKeyHashById(id)!;
    const name = input.name !== undefined ? input.name.trim() : existing.name;
    const permissions =
      input.permissions !== undefined
        ? input.permissions
        : existing.permissions;
    const enabled =
      input.enabled !== undefined ? input.enabled : existing.enabled;
    const keyHash = input.keyHash ?? hash;
    const keyPrefix = input.keyPrefix ?? existing.keyPrefix;

    this.db
      .prepare(
        `
        UPDATE api_keys
        SET name = ?, key_hash = ?, key_prefix = ?, permissions_json = ?, enabled = ?
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(
        name,
        keyHash,
        keyPrefix,
        JSON.stringify(permissions),
        enabled ? 1 : 0,
        id,
        this.tenant(),
      );
    return this.getKeyById(id);
  }

  deleteKey(id: string): boolean {
    this.db
      .prepare(
        `
        DELETE FROM api_requests
        WHERE api_key_id = ? AND tenant_id = ?
      `,
      )
      .run(id, this.tenant());
    const result = this.db
      .prepare(
        `
        DELETE FROM api_keys
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(id, this.tenant());
    return Number(result.changes) > 0;
  }

  touchLastUsed(id: string): void {
    this.db
      .prepare(
        `
        UPDATE api_keys
        SET last_used_at = ?
        WHERE id = ? AND tenant_id = ?
      `,
      )
      .run(this.now(), id, this.tenant());
  }

  appendRequest(input: ApiRequestCreateInput): ApiRequestDto {
    const id = this.idFactory();
    const now = this.now();
    const tenantId = this.tenant();
    this.db
      .prepare(
        `
        INSERT INTO api_requests (
          id, tenant_id, api_key_id, endpoint, method, status, latency_ms, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        id,
        tenantId,
        input.apiKeyId,
        input.endpoint,
        input.method,
        input.status,
        input.latencyMs,
        now,
      );
    return {
      id,
      tenantId,
      apiKeyId: input.apiKeyId,
      endpoint: input.endpoint,
      method: input.method,
      status: input.status,
      latencyMs: input.latencyMs,
      createdAt: new Date(now).toISOString(),
    };
  }

  listRequests(options: { apiKeyId?: string; limit?: number } = {}): ApiRequestDto[] {
    const limit = Math.min(Math.max(1, options.limit ?? 50), 200);
    if (options.apiKeyId?.trim()) {
      const rows = this.db
        .prepare(
          `
          SELECT * FROM api_requests
          WHERE tenant_id = ? AND api_key_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `,
        )
        .all(
          this.tenant(),
          options.apiKeyId.trim(),
          limit,
        ) as unknown as RequestRow[];
      return rows.map(rowToRequest);
    }
    const rows = this.db
      .prepare(
        `
        SELECT * FROM api_requests
        WHERE tenant_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `,
      )
      .all(this.tenant(), limit) as unknown as RequestRow[];
    return rows.map(rowToRequest);
  }

  listSdkTokens(): SdkTokenDto[] {
    this.ensureSdkSeeds();
    const rows = this.db
      .prepare(
        `
        SELECT * FROM sdk_tokens
        WHERE tenant_id = ?
        ORDER BY language ASC
      `,
      )
      .all(this.tenant()) as unknown as SdkRow[];
    return rows.map(rowToSdk);
  }
}

function rowToKey(row: KeyRow): ApiKeyDto {
  let permissions: ApiKeyPermission[] = [];
  try {
    const parsed = JSON.parse(row.permissions_json) as string[];
    permissions = parsed.filter(isApiKeyPermission);
  } catch {
    permissions = ['read'];
  }
  if (!permissions.length) permissions = ['read'];
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keyPrefix: row.key_prefix || keyPrefixFromSecret('unknown'),
    permissions,
    enabled: row.enabled === 1,
    lastUsedAt:
      row.last_used_at != null
        ? new Date(row.last_used_at).toISOString()
        : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToRequest(row: RequestRow): ApiRequestDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    apiKeyId: row.api_key_id,
    endpoint: row.endpoint,
    method: row.method,
    status: row.status,
    latencyMs: row.latency_ms,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function rowToSdk(row: SdkRow): SdkTokenDto {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    language: (isSdkLanguage(row.language)
      ? row.language
      : 'rest') as SdkLanguage,
    version: row.version,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
