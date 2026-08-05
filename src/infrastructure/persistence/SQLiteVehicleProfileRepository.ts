import type { DatabaseSync } from 'node:sqlite';
import type { VehicleProfile } from '../../domain/entities/VehicleProfile';
import type { VehicleProfileRepository } from '../../domain/ports/VehicleProfileRepository';
import {
  deserializeVehicle,
  serializeVehicle,
} from './crmSerialize';
import { openCrmSqliteDb } from './crmSqlite';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * VehicleProfileRepository durable (Production Sprint 2).
 */
export class SQLiteVehicleProfileRepository implements VehicleProfileRepository {
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

  async listByCustomerId(customerId: string): Promise<VehicleProfile[]> {
    const rows = this.db
      .prepare(
        `SELECT document_json FROM crm_vehicle_profiles
         WHERE tenant_id = ? AND customer_id = ?
         ORDER BY last_seen_at_ms DESC`,
      )
      .all(this.tenant(), customerId) as Array<{ document_json: string }>;
    return rows.map((r) => deserializeVehicle(r.document_json));
  }

  async upsert(vehicle: VehicleProfile): Promise<VehicleProfile> {
    const copy = deserializeVehicle(serializeVehicle(vehicle));
    this.db
      .prepare(
        `
        INSERT INTO crm_vehicle_profiles (
          tenant_id, id, customer_id, last_seen_at_ms, document_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          customer_id = excluded.customer_id,
          last_seen_at_ms = excluded.last_seen_at_ms,
          document_json = excluded.document_json
        `,
      )
      .run(
        this.tenant(),
        copy.id,
        copy.customerId,
        copy.lastSeenAt.getTime(),
        serializeVehicle(copy),
      );
    return deserializeVehicle(serializeVehicle(copy));
  }

  async findById(id: string): Promise<VehicleProfile | null> {
    const row = this.db
      .prepare(
        `SELECT document_json FROM crm_vehicle_profiles
         WHERE tenant_id = ? AND id = ?`,
      )
      .get(this.tenant(), id) as { document_json: string } | undefined;
    return row ? deserializeVehicle(row.document_json) : null;
  }
}
