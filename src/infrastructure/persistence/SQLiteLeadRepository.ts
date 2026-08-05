import type { DatabaseSync } from 'node:sqlite';
import { isTerminalLeadStatus } from '../../domain/crm/leadStatuses';
import { matchesLeadFilter } from '../../domain/crm/leadListFilter';
import type { Lead, LeadStatus } from '../../domain/entities/Lead';
import type { LeadEvent } from '../../domain/entities/LeadEvent';
import type {
  LeadListFilter,
  LeadRepository,
} from '../../domain/ports/LeadRepository';
import {
  deserializeLead,
  deserializeLeadEvent,
  serializeLead,
  serializeLeadEvent,
} from './crmSerialize';
import { openCrmSqliteDb } from './crmSqlite';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * LeadRepository durable (Production Sprint 2).
 * Documento JSON + columnas de índice; filtro idéntico a InMemory (leadListFilter).
 */
export class SQLiteLeadRepository implements LeadRepository {
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

  async list(filter?: LeadListFilter): Promise<Lead[]> {
    const rows = this.db
      .prepare(
        `SELECT document_json FROM crm_leads
         WHERE tenant_id = ?
         ORDER BY created_at_ms DESC`,
      )
      .all(this.tenant()) as Array<{ document_json: string }>;

    return rows
      .map((r) => deserializeLead(r.document_json))
      .filter((lead) => matchesLeadFilter(lead, filter));
  }

  async findById(id: string): Promise<Lead | null> {
    const row = this.db
      .prepare(
        `SELECT document_json FROM crm_leads
         WHERE tenant_id = ? AND id = ?`,
      )
      .get(this.tenant(), id) as { document_json: string } | undefined;
    return row ? deserializeLead(row.document_json) : null;
  }

  async findByConversationId(conversationId: string): Promise<Lead | null> {
    const row = this.db
      .prepare(
        `SELECT document_json FROM crm_leads
         WHERE tenant_id = ? AND conversation_id = ?
         ORDER BY created_at_ms ASC
         LIMIT 1`,
      )
      .get(this.tenant(), conversationId) as
      | { document_json: string }
      | undefined;
    return row ? deserializeLead(row.document_json) : null;
  }

  async findByCustomerId(customerId: string): Promise<Lead[]> {
    const rows = this.db
      .prepare(
        `SELECT document_json FROM crm_leads
         WHERE tenant_id = ? AND customer_id = ?
         ORDER BY created_at_ms DESC`,
      )
      .all(this.tenant(), customerId) as Array<{ document_json: string }>;
    return rows.map((r) => deserializeLead(r.document_json));
  }

  async findOpenByCustomerId(customerId: string): Promise<Lead[]> {
    const all = await this.findByCustomerId(customerId);
    return all.filter((lead) => !isTerminalLeadStatus(lead.status));
  }

  async save(lead: Lead): Promise<Lead> {
    const copy = deserializeLead(serializeLead(lead));
    this.upsertLead(copy);
    return deserializeLead(serializeLead(copy));
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next: Lead = {
      ...existing,
      status,
      updatedAt: new Date(),
    };
    this.upsertLead(next);
    return deserializeLead(serializeLead(next));
  }

  async appendEvent(event: LeadEvent): Promise<void> {
    const copy = deserializeLeadEvent(serializeLeadEvent(event));
    this.db
      .prepare(
        `
        INSERT INTO crm_lead_events (
          tenant_id, id, lead_id, at_ms, document_json
        ) VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(
        this.tenant(),
        copy.id,
        copy.leadId,
        copy.at.getTime(),
        serializeLeadEvent(copy),
      );
  }

  async listEvents(leadId: string): Promise<LeadEvent[]> {
    const rows = this.db
      .prepare(
        `SELECT document_json FROM crm_lead_events
         WHERE tenant_id = ? AND lead_id = ?
         ORDER BY at_ms ASC, id ASC`,
      )
      .all(this.tenant(), leadId) as Array<{ document_json: string }>;
    return rows.map((r) => deserializeLeadEvent(r.document_json));
  }

  private upsertLead(lead: Lead): void {
    this.db
      .prepare(
        `
        INSERT INTO crm_leads (
          tenant_id, id, conversation_id, customer_id, status, priority,
          product, phone, name, vehicle_brand, created_at_ms, updated_at_ms,
          assignee_id, outcome, document_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, id) DO UPDATE SET
          conversation_id = excluded.conversation_id,
          customer_id = excluded.customer_id,
          status = excluded.status,
          priority = excluded.priority,
          product = excluded.product,
          phone = excluded.phone,
          name = excluded.name,
          vehicle_brand = excluded.vehicle_brand,
          created_at_ms = excluded.created_at_ms,
          updated_at_ms = excluded.updated_at_ms,
          assignee_id = excluded.assignee_id,
          outcome = excluded.outcome,
          document_json = excluded.document_json
        `,
      )
      .run(
        this.tenant(),
        lead.id,
        lead.conversationId,
        lead.customerId,
        lead.status,
        lead.priority ?? null,
        lead.product,
        lead.phone,
        lead.name ?? null,
        lead.vehicleBrand,
        lead.createdAt.getTime(),
        lead.updatedAt?.getTime() ?? null,
        lead.assignment?.assigneeId ?? null,
        lead.recommendationSnapshot?.outcome ?? null,
        serializeLead(lead),
      );
  }
}
