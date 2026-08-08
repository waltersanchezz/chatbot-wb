import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'crypto';
import { openCrmSqliteDb } from '../persistence/crmSqlite';

/**
 * Lease durable por wa_id en SQLite (mismo disco Render /var/data).
 * Cubre overlapping deploys: dos procesos no procesan el mismo wa_id a la vez.
 * No es un sistema distribuido externo — reutiliza el SQLite del producto.
 */
export class SqliteWaIdTurnLock {
  private readonly db: DatabaseSync;
  private readonly ttlMs: number;
  private readonly pollMs: number;
  private readonly maxWaitMs: number;

  constructor(
    databasePath: string,
    options: { ttlMs?: number; pollMs?: number; maxWaitMs?: number } = {},
  ) {
    this.ttlMs = options.ttlMs ?? 45_000;
    this.pollMs = options.pollMs ?? 25;
    this.maxWaitMs = options.maxWaitMs ?? 60_000;
    this.db = openCrmSqliteDb(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS whatsapp_wa_id_leases (
        wa_id TEXT PRIMARY KEY NOT NULL,
        owner TEXT NOT NULL,
        expires_at_ms INTEGER NOT NULL
      );
    `);
  }

  /**
   * Adquiere el lease. Devuelve release() (idempotente).
   * Roba leases expirados (proceso muerto / deploy).
   */
  async acquire(waId: string, now = Date.now()): Promise<() => void> {
    const key = waId.trim();
    if (!key) return () => undefined;

    const owner = `${process.pid}:${randomUUID()}`;
    const deadline = now + this.maxWaitMs;

    while (Date.now() <= deadline) {
      const expiresAt = Date.now() + this.ttlMs;
      const stolen = this.db
        .prepare(
          `
          INSERT INTO whatsapp_wa_id_leases (wa_id, owner, expires_at_ms)
          VALUES (?, ?, ?)
          ON CONFLICT(wa_id) DO UPDATE SET
            owner = excluded.owner,
            expires_at_ms = excluded.expires_at_ms
          WHERE whatsapp_wa_id_leases.expires_at_ms <= ?
             OR whatsapp_wa_id_leases.owner = excluded.owner
        `,
        )
        .run(key, owner, expiresAt, Date.now());

      if (Number(stolen.changes) > 0) {
        let released = false;
        return () => {
          if (released) return;
          released = true;
          try {
            this.db
              .prepare(
                `DELETE FROM whatsapp_wa_id_leases WHERE wa_id = ? AND owner = ?`,
              )
              .run(key, owner);
          } catch {
            /* best-effort */
          }
        };
      }

      await sleep(this.pollMs);
    }

    throw new Error(`SqliteWaIdTurnLock: timeout acquiring lease for ${key}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
