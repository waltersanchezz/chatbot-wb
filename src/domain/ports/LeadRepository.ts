import type {
  Lead,
  LeadPriority,
  LeadProduct,
  LeadStatus,
  RecommendationOutcomeSnapshot,
} from '../entities/Lead';
import type { LeadEvent } from '../entities/LeadEvent';

export interface LeadListFilter {
  status?: LeadStatus | LeadStatus[];
  priority?: LeadPriority | LeadPriority[];
  product?: LeadProduct;
  from?: Date;
  to?: Date;
  assigneeId?: string;
  customerId?: string;
  outcome?: RecommendationOutcomeSnapshot;
  /** Búsqueda libre sobre phone / name / vehicleBrand. */
  q?: string;
}

/**
 * Puerto de persistencia de leads (CRM_SPEC §10.1).
 * Hoy: InMemoryLeadRepository
 * Futuro: PostgresLeadRepository (mismo contrato).
 */
export interface LeadRepository {
  list(filter?: LeadListFilter): Promise<Lead[]>;
  findById(id: string): Promise<Lead | null>;
  findByConversationId(conversationId: string): Promise<Lead | null>;
  findByCustomerId(customerId: string): Promise<Lead[]>;
  findOpenByCustomerId(customerId: string): Promise<Lead[]>;
  save(lead: Lead): Promise<Lead>;
  updateStatus(id: string, status: LeadStatus): Promise<Lead | null>;
  appendEvent(event: LeadEvent): Promise<void>;
  listEvents(leadId: string): Promise<LeadEvent[]>;
}
