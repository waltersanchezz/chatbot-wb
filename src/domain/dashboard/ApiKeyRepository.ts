import type {
  ApiKeyCreateInput,
  ApiKeyDto,
  ApiKeyUpdateInput,
  ApiRequestCreateInput,
  ApiRequestDto,
  SdkTokenDto,
} from './developerDto';

export interface ApiKeyRepository {
  listKeys(): ApiKeyDto[];
  getKeyById(id: string): ApiKeyDto | null;
  /** Solo uso interno (auth/verify) — no exponer en HTTP. */
  getKeyHashById(id: string): string | null;
  findKeyByHash(keyHash: string): ApiKeyDto | null;
  createKey(input: {
    name: string;
    keyHash: string;
    keyPrefix: string;
    permissions: string[];
    enabled?: boolean;
  }): ApiKeyDto;
  updateKey(id: string, input: ApiKeyUpdateInput & { keyHash?: string; keyPrefix?: string }): ApiKeyDto | null;
  deleteKey(id: string): boolean;
  touchLastUsed(id: string): void;

  appendRequest(input: ApiRequestCreateInput): ApiRequestDto;
  listRequests(options?: {
    apiKeyId?: string;
    limit?: number;
  }): ApiRequestDto[];

  listSdkTokens(): SdkTokenDto[];
  ensureSdkSeeds(): void;
}

export type { ApiKeyCreateInput };
