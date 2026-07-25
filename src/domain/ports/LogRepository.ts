import type { ConversationLog } from '../entities/ConversationLog';

export interface LogRepository {
  append(log: ConversationLog): Promise<void>;
  listRecent(limit?: number): Promise<ConversationLog[]>;
}
