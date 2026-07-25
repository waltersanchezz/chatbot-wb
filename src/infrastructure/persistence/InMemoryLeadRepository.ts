import type { Lead, LeadStatus } from '../../domain/entities/Lead';
import type { LeadRepository } from '../../domain/ports/LeadRepository';

/**
 * Almacenamiento en memoria durante la ejecución del servidor.
 * Sustituible por SQLite implementando el mismo LeadRepository.
 */
export class InMemoryLeadRepository implements LeadRepository {
  private readonly byId = new Map<string, Lead>();

  async list(): Promise<Lead[]> {
    return [...this.byId.values()]
      .map((lead) => ({ ...lead }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async findById(id: string): Promise<Lead | null> {
    const lead = this.byId.get(id);
    return lead ? { ...lead } : null;
  }

  async findByConversationId(conversationId: string): Promise<Lead | null> {
    for (const lead of this.byId.values()) {
      if (lead.conversationId === conversationId) return { ...lead };
    }
    return null;
  }

  async save(lead: Lead): Promise<Lead> {
    const copy = { ...lead };
    this.byId.set(copy.id, copy);
    return { ...copy };
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    const lead = this.byId.get(id);
    if (!lead) return null;
    lead.status = status;
    return { ...lead };
  }
}
