import { randomUUID } from 'crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Customer } from '../../domain/entities/Customer';
import type { CustomerRepository } from '../../domain/ports/CustomerRepository';
import type { Channel } from '../../shared/types';
import { openCrmSqliteDb } from './crmSqlite';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  channel: string;
  created_at_ms: number;
  updated_at_ms: number;
}

/**
 * CustomerRepository durable (Production Sprint 2).
 * Mismo contrato que InMemoryCustomerRepository + aislamiento por tenant.
 */
export class SQLiteCustomerRepository implements CustomerRepository {
  private readonly db: DatabaseSync;
  private readonly fixedTenantId?: string;

  constructor(
    databasePath: string = ':memory:',
    options: TenantScopedOptions = {},
  ) {
    this.fixedTenantId = options.tenantId;
    this.db = openCrmSqliteDb(databasePath);
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const row = this.db
      .prepare(
        `SELECT id, phone, name, channel, created_at_ms, updated_at_ms
         FROM crm_customers
         WHERE tenant_id = ? AND phone = ?`,
      )
      .get(this.tenant(), phone) as CustomerRow | undefined;
    return row ? rowToCustomer(row) : null;
  }

  async findById(id: string): Promise<Customer | null> {
    const row = this.db
      .prepare(
        `SELECT id, phone, name, channel, created_at_ms, updated_at_ms
         FROM crm_customers
         WHERE tenant_id = ? AND id = ?`,
      )
      .get(this.tenant(), id) as CustomerRow | undefined;
    return row ? rowToCustomer(row) : null;
  }

  async save(customer: Customer): Promise<Customer> {
    const next: Customer = {
      ...customer,
      updatedAt: new Date(),
    };
    const tenantId = this.tenant();
    const previous = this.db
      .prepare(
        `SELECT phone FROM crm_customers WHERE tenant_id = ? AND id = ?`,
      )
      .get(tenantId, next.id) as { phone: string } | undefined;

    if (previous && previous.phone !== next.phone) {
      // Índice único (tenant, phone): liberar teléfono anterior si cambió.
      this.db
        .prepare(
          `DELETE FROM crm_customers WHERE tenant_id = ? AND id = ?`,
        )
        .run(tenantId, next.id);
    }

    this.db
      .prepare(
        `
        INSERT INTO crm_customers (
          tenant_id, id, phone, name, channel, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          phone = excluded.phone,
          name = excluded.name,
          channel = excluded.channel,
          updated_at_ms = excluded.updated_at_ms
        `,
      )
      .run(
        tenantId,
        next.id,
        next.phone,
        next.name ?? null,
        next.channel,
        next.createdAt.getTime(),
        next.updatedAt.getTime(),
      );

    return { ...next };
  }

  async findOrCreate(
    phone: string,
    channel: Channel,
    name?: string,
  ): Promise<Customer> {
    const existing = await this.findByPhone(phone);
    if (existing) {
      if (name && !existing.name) {
        return this.save({ ...existing, name });
      }
      return existing;
    }

    const now = new Date();
    return this.save({
      id: randomUUID(),
      phone,
      name,
      channel,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name ?? undefined,
    channel: row.channel as Channel,
    createdAt: new Date(row.created_at_ms),
    updatedAt: new Date(row.updated_at_ms),
  };
}
