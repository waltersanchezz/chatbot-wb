import { matchesLeadFilter } from '../../domain/crm/leadListFilter';
import { isTerminalLeadStatus } from '../../domain/crm/leadStatuses';
import type { Lead, LeadStatus } from '../../domain/entities/Lead';
import type { LeadEvent } from '../../domain/entities/LeadEvent';
import type {
  LeadListFilter,
  LeadRepository,
} from '../../domain/ports/LeadRepository';

/**
 * Almacenamiento en memoria (tests / legacy).
 * Producción: SQLiteLeadRepository (mismo LeadRepository).
 */
export class InMemoryLeadRepository implements LeadRepository {
  private readonly byId = new Map<string, Lead>();
  private readonly eventsByLeadId = new Map<string, LeadEvent[]>();

  async list(filter?: LeadListFilter): Promise<Lead[]> {
    return [...this.byId.values()]
      .filter((lead) => matchesLeadFilter(lead, filter))
      .map(cloneLead)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<Lead | null> {
    const lead = this.byId.get(id);
    return lead ? cloneLead(lead) : null;
  }

  async findByConversationId(conversationId: string): Promise<Lead | null> {
    for (const lead of this.byId.values()) {
      if (lead.conversationId === conversationId) return cloneLead(lead);
    }
    return null;
  }

  async findByCustomerId(customerId: string): Promise<Lead[]> {
    return [...this.byId.values()]
      .filter((lead) => lead.customerId === customerId)
      .map(cloneLead)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findOpenByCustomerId(customerId: string): Promise<Lead[]> {
    return [...this.byId.values()]
      .filter(
        (lead) =>
          lead.customerId === customerId && !isTerminalLeadStatus(lead.status),
      )
      .map(cloneLead)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async save(lead: Lead): Promise<Lead> {
    const copy = cloneLead(lead);
    this.byId.set(copy.id, copy);
    return cloneLead(copy);
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    const lead = this.byId.get(id);
    if (!lead) return null;
    lead.status = status;
    lead.updatedAt = new Date();
    return cloneLead(lead);
  }

  async appendEvent(event: LeadEvent): Promise<void> {
    const list = this.eventsByLeadId.get(event.leadId) ?? [];
    list.push(cloneLeadEvent(event));
    this.eventsByLeadId.set(event.leadId, list);
  }

  async listEvents(leadId: string): Promise<LeadEvent[]> {
    const list = this.eventsByLeadId.get(leadId) ?? [];
    return list
      .map(cloneLeadEvent)
      .sort((a, b) => {
        const byAt = a.at.getTime() - b.at.getTime();
        if (byAt !== 0) return byAt;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
  }
}

function cloneLead(lead: Lead): Lead {
  return {
    ...lead,
    recommendationSnapshot: lead.recommendationSnapshot
      ? {
          ...lead.recommendationSnapshot,
          query: { ...lead.recommendationSnapshot.query },
          options: lead.recommendationSnapshot.options.map((o) => ({ ...o })),
        }
      : undefined,
    assignment: lead.assignment ? { ...lead.assignment } : undefined,
    sla: lead.sla ? { ...lead.sla } : undefined,
    recontact: lead.recontact ? { ...lead.recontact } : undefined,
  };
}

function cloneLeadEvent(event: LeadEvent): LeadEvent {
  return {
    ...event,
    payload: event.payload ? { ...event.payload } : undefined,
  };
}
