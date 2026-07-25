import { appendFile, mkdir, readFile } from 'fs/promises';
import path from 'path';
import type { ConversationLog } from '../../domain/entities/ConversationLog';
import type { LogRepository } from '../../domain/ports/LogRepository';

export class FileLogRepository implements LogRepository {
  private readonly memory: ConversationLog[] = [];

  constructor(private readonly logDir: string) {}

  async append(log: ConversationLog): Promise<void> {
    this.memory.unshift(log);
    if (this.memory.length > 500) this.memory.pop();

    await mkdir(this.logDir, { recursive: true });
    const file = path.join(this.logDir, `conversations-${this.dayKey(log.date)}.jsonl`);
    const line = JSON.stringify({
      id: log.id,
      date: log.date.toISOString(),
      customerId: log.customerId,
      customerPhone: log.customerPhone,
      conversationId: log.conversationId,
      message: log.inboundMessage,
      response: log.outboundResponse,
      durationMs: log.durationMs,
      error: log.error,
      metadata: log.metadata,
    });
    await appendFile(file, `${line}\n`, 'utf8');
  }

  async listRecent(limit = 50): Promise<ConversationLog[]> {
    if (this.memory.length) return this.memory.slice(0, limit);

    try {
      const file = path.join(this.logDir, `conversations-${this.dayKey(new Date())}.jsonl`);
      const raw = await readFile(file, 'utf8');
      const lines = raw.trim().split('\n').filter(Boolean).slice(-limit).reverse();
      return lines.map((line) => {
        const row = JSON.parse(line) as Record<string, unknown>;
        return {
          id: String(row.id),
          date: new Date(String(row.date)),
          customerId: String(row.customerId),
          customerPhone: String(row.customerPhone),
          conversationId: String(row.conversationId),
          inboundMessage: String(row.message),
          outboundResponse: String(row.response),
          durationMs: Number(row.durationMs),
          error: row.error ? String(row.error) : undefined,
          metadata: row.metadata as Record<string, unknown> | undefined,
        };
      });
    } catch {
      return [];
    }
  }

  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
