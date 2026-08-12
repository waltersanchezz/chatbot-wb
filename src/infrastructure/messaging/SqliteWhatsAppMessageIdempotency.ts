import fs from 'fs';
import type { DatabaseSync } from 'node:sqlite';
import { openCrmSqliteDb } from '../persistence/crmSqlite';
import type { WhatsAppIdempotencyGate } from './WhatsAppMessageIdempotency';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

interface LegacyPersistedState {
  version: 1;
  entries: Record<string, number>;
}

/**
 * Claim atómico de wamid vía SQLite PRIMARY KEY.
 * Seguro entre procesos que comparten el mismo archivo (Render disk).
 *
 * Compatibilidad: si existe WHATSAPP_IDEMPOTENCY_PATH (JSON legacy),
 * importa entradas vigentes una vez al arrancar. No borra el archivo.
 */
export class SqliteWhatsAppMessageIdempotency implements WhatsAppIdempotencyGate {
  private readonly db: DatabaseSync;
  private readonly ttlMs: number;

  constructor(
    databasePath: string,
    options: { ttlMs?: number; legacyFilePath?: string } = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.db = openCrmSqliteDb(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_processed_wamids (
        wamid TEXT PRIMARY KEY NOT NULL,
        claimed_at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_whatsapp_wamids_claimed
        ON whatsapp_processed_wamids(claimed_at_ms);
    `);

    if (options.legacyFilePath) {
      this.importLegacyFile(options.legacyFilePath);
    }
  }

  claim(messageId: string, now = Date.now()): boolean {
    const id = messageId.trim();
    if (!id) return true;

    this.purge(now);

    const result = this.db
      .prepare(
        `
        INSERT OR IGNORE INTO whatsapp_processed_wamids (wamid, claimed_at_ms)
        VALUES (?, ?)
      `,
      )
      .run(id, now);

    return Number(result.changes) === 1;
  }

  /** Mismo store; clave `out:${wamid}` → 1 inboundWamid → máx. 1 sendText. */
  claimOutbound(messageId: string, now = Date.now()): boolean {
    const id = messageId.trim();
    if (!id) return true;
    return this.claim(`out:${id}`, now);
  }

  /** Mismo store; clave `tg:${wamid}` → 1 inboundWamid → máx. 1 Telegram inbound. */
  claimTelegramInbound(messageId: string, now = Date.now()): boolean {
    const id = messageId.trim();
    if (!id) return true;
    return this.claim(`tg:${id}`, now);
  }

  size(now = Date.now()): number {
    this.purge(now);
    const row = this.db
      .prepare(`SELECT COUNT(*) AS n FROM whatsapp_processed_wamids`)
      .get() as { n: number | bigint };
    return Number(row.n);
  }

  clear(): void {
    this.db.prepare(`DELETE FROM whatsapp_processed_wamids`).run();
  }

  private purge(now: number): void {
    const cutoff = now - this.ttlMs;
    this.db
      .prepare(`DELETE FROM whatsapp_processed_wamids WHERE claimed_at_ms < ?`)
      .run(cutoff);
  }

  private importLegacyFile(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw) as LegacyPersistedState;
      if (parsed?.version !== 1 || typeof parsed.entries !== 'object') return;

      const now = Date.now();
      const insert = this.db.prepare(
        `
        INSERT OR IGNORE INTO whatsapp_processed_wamids (wamid, claimed_at_ms)
        VALUES (?, ?)
      `,
      );

      this.db.exec('BEGIN');
      try {
        for (const [id, ts] of Object.entries(parsed.entries)) {
          if (typeof ts !== 'number') continue;
          if (now - ts > this.ttlMs) continue;
          insert.run(id.trim(), ts);
        }
        this.db.exec('COMMIT');
      } catch (err) {
        try {
          this.db.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
    } catch {
      // Archivo corrupto / ausente: no tumbar bootstrap.
    }
  }
}
