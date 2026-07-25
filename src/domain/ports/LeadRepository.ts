import type { Lead, LeadStatus } from '../entities/Lead';

/**
 * Puerto de persistencia de leads.
 * Hoy: InMemoryLeadRepository
 * Futuro: SqliteLeadRepository (mismo contrato, sin tocar LeadService ni el chatbot).
 */
export interface LeadRepository {
  list(): Promise<Lead[]>;
  findById(id: string): Promise<Lead | null>;
  findByConversationId(conversationId: string): Promise<Lead | null>;
  save(lead: Lead): Promise<Lead>;
  updateStatus(id: string, status: LeadStatus): Promise<Lead | null>;
}
