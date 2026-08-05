import { DatabaseSync } from 'node:sqlite';

/**
 * Conexión SQLite del CRM (Production Sprint 2).
 * - Archivo: cada open es una conexión al mismo path (mismo patrón que el resto).
 * - `:memory:`: singleton compartido para que Customer/Lead/Conversation
 *   vean las mismas tablas en tests / vitest.
 */
const sharedMemoryDbs = new Map<string, DatabaseSync>();

export function openCrmSqliteDb(databasePath: string): DatabaseSync {
  if (databasePath === ':memory:') {
    const key = 'crm';
    const existing = sharedMemoryDbs.get(key);
    if (existing) return existing;
    const db = new DatabaseSync(':memory:');
    ensureCrmSchema(db);
    sharedMemoryDbs.set(key, db);
    return db;
  }

  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    /* ignore */
  }
  ensureCrmSchema(db);
  return db;
}

/** Solo tests — libera el singleton :memory:. */
export function resetCrmSqliteSharedMemory(): void {
  for (const db of sharedMemoryDbs.values()) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
  sharedMemoryDbs.clear();
}

export function ensureCrmSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_customers (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      channel TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_customers_phone
      ON crm_customers(tenant_id, phone);

    CREATE TABLE IF NOT EXISTS crm_leads (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT,
      product TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT,
      vehicle_brand TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER,
      assignee_id TEXT,
      outcome TEXT,
      document_json TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_leads_conversation
      ON crm_leads(tenant_id, conversation_id);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_customer
      ON crm_leads(tenant_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_created
      ON crm_leads(tenant_id, created_at_ms DESC);

    CREATE TABLE IF NOT EXISTS crm_lead_events (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      lead_id TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_lead_events_lead
      ON crm_lead_events(tenant_id, lead_id, at_ms, id);

    CREATE TABLE IF NOT EXISTS crm_interactions (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      at_ms INTEGER NOT NULL,
      type TEXT NOT NULL,
      document_json TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_interactions_customer
      ON crm_interactions(tenant_id, customer_id, at_ms, id);

    CREATE TABLE IF NOT EXISTS crm_vehicle_profiles (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      last_seen_at_ms INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE INDEX IF NOT EXISTS idx_crm_vehicles_customer
      ON crm_vehicle_profiles(tenant_id, customer_id, last_seen_at_ms DESC);

    CREATE TABLE IF NOT EXISTS crm_conversations (
      tenant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      expires_at_ms INTEGER NOT NULL,
      document_json TEXT NOT NULL,
      PRIMARY KEY (tenant_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_conversations_external
      ON crm_conversations(tenant_id, external_id);
    CREATE INDEX IF NOT EXISTS idx_crm_conversations_expires
      ON crm_conversations(tenant_id, expires_at_ms);
  `);
}
