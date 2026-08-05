import type { ApiKeyRepository } from '../../domain/dashboard/ApiKeyRepository';
import type {
  ApiKeyCreateInput,
  ApiKeyCreatedDto,
  ApiKeyDto,
  ApiKeyUpdateInput,
  ApiRequestCreateInput,
  ApiRequestDto,
  DeveloperDocsDto,
  DeveloperUsageStats,
  SdkCatalogItem,
} from '../../domain/dashboard/developerDto';
import {
  API_KEY_PERMISSIONS,
  isApiKeyPermission,
  keyPrefixFromSecret,
  normalizePermissions,
} from '../../domain/dashboard/developerDto';
import {
  generateApiKeySecret,
  hashApiKeySecret,
} from '../../infrastructure/persistence/SQLiteApiKeyRepository';

export class DeveloperValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeveloperValidationError';
  }
}

/**
 * Developer Platform — API Keys hasheadas + catálogo SDK + métricas de uso.
 * No modifica Auth ni motores existentes.
 */
export class DeveloperService {
  constructor(private readonly repository: ApiKeyRepository) {
    this.repository.ensureSdkSeeds();
  }

  listKeys(): ApiKeyDto[] {
    return this.repository.listKeys();
  }

  getKey(id: string): ApiKeyDto | null {
    return this.repository.getKeyById(id);
  }

  createKey(input: ApiKeyCreateInput): ApiKeyCreatedDto {
    if (!input.name?.trim()) {
      throw new DeveloperValidationError('name es obligatorio');
    }
    this.assertPermissions(input.permissions);
    const secret = generateApiKeySecret();
    const key = this.repository.createKey({
      name: input.name.trim(),
      keyHash: hashApiKeySecret(secret),
      keyPrefix: keyPrefixFromSecret(secret),
      permissions: normalizePermissions(input.permissions),
      enabled: input.enabled !== false,
    });
    return { key, secret };
  }

  updateKey(id: string, input: ApiKeyUpdateInput): ApiKeyDto | null {
    if (!id.trim()) {
      throw new DeveloperValidationError('id es obligatorio');
    }
    if (
      input.name === undefined &&
      input.permissions === undefined &&
      input.enabled === undefined
    ) {
      throw new DeveloperValidationError('Sin campos para actualizar');
    }
    if (input.name !== undefined && !input.name.trim()) {
      throw new DeveloperValidationError('name no puede estar vacío');
    }
    this.assertPermissions(input.permissions);
    const patch: ApiKeyUpdateInput = { ...input };
    if (input.permissions !== undefined) {
      patch.permissions = normalizePermissions(input.permissions);
    }
    if (input.name !== undefined) patch.name = input.name.trim();
    return this.repository.updateKey(id, patch);
  }

  deleteKey(id: string): boolean {
    if (!id.trim()) {
      throw new DeveloperValidationError('id es obligatorio');
    }
    return this.repository.deleteKey(id);
  }

  rotateKey(id: string): ApiKeyCreatedDto {
    if (!id.trim()) {
      throw new DeveloperValidationError('id es obligatorio');
    }
    const existing = this.repository.getKeyById(id);
    if (!existing) {
      throw new DeveloperValidationError(`API Key no encontrada: ${id}`);
    }
    const secret = generateApiKeySecret();
    const key = this.repository.updateKey(id, {
      keyHash: hashApiKeySecret(secret),
      keyPrefix: keyPrefixFromSecret(secret),
    });
    if (!key) {
      throw new DeveloperValidationError(`API Key no encontrada: ${id}`);
    }
    return { key, secret };
  }

  /**
   * Verifica secreto (hash) sin exponerlo. Actualiza lastUsedAt.
   */
  verifySecret(secret: string): ApiKeyDto | null {
    const trimmed = secret?.trim();
    if (!trimmed) return null;
    const key = this.repository.findKeyByHash(hashApiKeySecret(trimmed));
    if (!key || !key.enabled) return null;
    this.repository.touchLastUsed(key.id);
    return this.repository.getKeyById(key.id);
  }

  recordRequest(input: ApiRequestCreateInput): ApiRequestDto {
    if (!input.apiKeyId?.trim()) {
      throw new DeveloperValidationError('apiKeyId es obligatorio');
    }
    if (!input.endpoint?.trim() || !input.method?.trim()) {
      throw new DeveloperValidationError('endpoint y method son obligatorios');
    }
    if (!this.repository.getKeyById(input.apiKeyId)) {
      throw new DeveloperValidationError(
        `API Key no encontrada: ${input.apiKeyId}`,
      );
    }
    const req = this.repository.appendRequest({
      apiKeyId: input.apiKeyId,
      endpoint: input.endpoint.trim(),
      method: input.method.trim().toUpperCase(),
      status: Number(input.status) || 0,
      latencyMs: Math.max(0, Number(input.latencyMs) || 0),
    });
    this.repository.touchLastUsed(input.apiKeyId);
    return req;
  }

  listRequests(options?: {
    apiKeyId?: string;
    limit?: number;
  }): ApiRequestDto[] {
    return this.repository.listRequests(options);
  }

  getUsageStats(limit: number = 200): DeveloperUsageStats {
    const requests = this.repository.listRequests({ limit });
    const byEndpointMap = new Map<
      string,
      { count: number; latencySum: number }
    >();
    const byKeyMap = new Map<string, { count: number; errors: number }>();
    let errorCount = 0;
    let latencySum = 0;

    for (const r of requests) {
      latencySum += r.latencyMs;
      if (r.status >= 400) errorCount += 1;

      const ep = byEndpointMap.get(r.endpoint) ?? {
        count: 0,
        latencySum: 0,
      };
      ep.count += 1;
      ep.latencySum += r.latencyMs;
      byEndpointMap.set(r.endpoint, ep);

      const k = byKeyMap.get(r.apiKeyId) ?? { count: 0, errors: 0 };
      k.count += 1;
      if (r.status >= 400) k.errors += 1;
      byKeyMap.set(r.apiKeyId, k);
    }

    return {
      totalRequests: requests.length,
      errorCount,
      avgLatencyMs:
        requests.length === 0
          ? 0
          : Number((latencySum / requests.length).toFixed(2)),
      byEndpoint: [...byEndpointMap.entries()].map(([endpoint, v]) => ({
        endpoint,
        count: v.count,
        avgLatencyMs: Number((v.latencySum / v.count).toFixed(2)),
      })),
      byApiKey: [...byKeyMap.entries()].map(([apiKeyId, v]) => ({
        apiKeyId,
        count: v.count,
        errors: v.errors,
      })),
    };
  }

  getSdkCatalog(): DeveloperDocsDto {
    const tokens = this.repository.listSdkTokens();
    const sdks: SdkCatalogItem[] = tokens.map((t) => ({
      language: t.language,
      name: t.name,
      version: t.version,
      status: ['javascript', 'typescript', 'python', 'php', 'rest'].includes(
        t.language,
      )
        ? 'ready'
        : 'planned',
      install: installHint(t.language),
      docsUrl: `/developer/sdk/${t.language}`,
    }));

    return {
      baseUrl: '/api',
      authHeader: 'Authorization: Bearer <API_KEY>',
      sdks,
      examples: buildExamples(),
      permissions: [...API_KEY_PERMISSIONS],
    };
  }

  private assertPermissions(values?: string[]): void {
    if (!values) return;
    for (const v of values) {
      if (!isApiKeyPermission(String(v).trim().toLowerCase())) {
        throw new DeveloperValidationError(`Permiso inválido: ${v}`);
      }
    }
  }
}

function installHint(language: string): string {
  switch (language) {
    case 'javascript':
      return 'npm install @rodacenter/sdk';
    case 'typescript':
      return 'npm install @rodacenter/sdk';
    case 'python':
      return 'pip install rodacenter';
    case 'php':
      return 'composer require rodacenter/sdk';
    case 'java':
      return 'implementation "com.rodacenter:sdk:0.1.0"';
    case 'csharp':
      return 'dotnet add package Rodacenter.Sdk';
    case 'go':
      return 'go get github.com/rodacenter/sdk-go';
    default:
      return 'curl + Bearer token';
  }
}

function buildExamples() {
  const sample = 'rc_live_YOUR_KEY';
  return [
    {
      language: 'curl',
      title: 'Listar conocimiento',
      code: `curl -H "Authorization: Bearer ${sample}" \\\n  https://api.example.com/api/knowledge`,
    },
    {
      language: 'javascript',
      title: 'Fetch API',
      code: `const res = await fetch('/api/knowledge', {\n  headers: { Authorization: 'Bearer ${sample}' }\n});\nconst data = await res.json();`,
    },
    {
      language: 'typescript',
      title: 'Typed client',
      code: `import { RodacenterClient } from '@rodacenter/sdk';\nconst client = new RodacenterClient({ apiKey: '${sample}' });\nconst items = await client.knowledge.list();`,
    },
    {
      language: 'python',
      title: 'requests',
      code: `import requests\nr = requests.get(\n  'https://api.example.com/api/knowledge',\n  headers={'Authorization': f'Bearer ${sample}'}\n)\nprint(r.json())`,
    },
    {
      language: 'php',
      title: 'cURL',
      code: `$ch = curl_init('https://api.example.com/api/knowledge');\ncurl_setopt($ch, CURLOPT_HTTPHEADER, ['Authorization: Bearer ${sample}']);\ncurl_setopt($ch, CURLOPT_RETURNTRANSFER, true);\necho curl_exec($ch);`,
    },
  ];
}
