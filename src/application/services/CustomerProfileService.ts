import { isTerminalLeadStatus } from '../../domain/crm/leadStatuses';
import type {
  CustomerProfile,
  CustomerProfileDetail,
  LeadSummary,
} from '../../domain/entities/CustomerProfile';
import type { Lead, LeadPriority } from '../../domain/entities/Lead';
import type { CustomerRepository } from '../../domain/ports/CustomerRepository';
import type {
  InteractionListOpts,
  InteractionRepository,
} from '../../domain/ports/InteractionRepository';
import type { LeadRepository } from '../../domain/ports/LeadRepository';
import type { VehicleProfileRepository } from '../../domain/ports/VehicleProfileRepository';

export interface CustomerProfileDetailParams {
  customerId?: string;
  phone?: string;
  interactionLimit?: number;
  interactionBefore?: Date;
  interactionTypes?: InteractionListOpts['types'];
}

/**
 * Ensambla el agregado CRM CustomerProfile desde repos (CRM_SPEC §5.2).
 * No implementa CustomerProfilePort como interfaz separada aún — misma forma.
 */
export class CustomerProfileService {
  constructor(
    private readonly customers: CustomerRepository,
    private readonly leads: LeadRepository,
    private readonly vehicles: VehicleProfileRepository,
    private readonly interactions: InteractionRepository,
  ) {}

  async getByCustomerId(customerId: string): Promise<CustomerProfile | null> {
    const customer = await this.customers.findById(customerId);
    if (!customer) return null;

    const [allLeads, vehicles, interactions] = await Promise.all([
      this.leads.findByCustomerId(customerId),
      this.vehicles.listByCustomerId(customerId),
      this.interactions.listByCustomerId(customerId),
    ]);

    const openLeads = allLeads.filter((l) => !isTerminalLeadStatus(l.status));
    const lastInteractionAt =
      interactions.length > 0
        ? interactions.reduce(
            (max, i) => (i.at.getTime() > max.getTime() ? i.at : max),
            interactions[0]!.at,
          )
        : undefined;

    return {
      customerId: customer.id,
      phone: customer.phone,
      name: customer.name,
      channel: customer.channel,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      openLeadCount: openLeads.length,
      lastInteractionAt,
      tags: [],
      leads: allLeads.map(toLeadSummary),
      vehicles,
      interactions,
    };
  }

  async getByPhone(phone: string): Promise<CustomerProfile | null> {
    const customer = await this.customers.findByPhone(phone);
    if (!customer) return null;
    return this.getByCustomerId(customer.id);
  }

  async getDetail(
    params: CustomerProfileDetailParams,
  ): Promise<CustomerProfileDetail | null> {
    const customer = params.customerId
      ? await this.customers.findById(params.customerId)
      : params.phone
        ? await this.customers.findByPhone(params.phone)
        : null;

    if (!customer) return null;

    const limit = params.interactionLimit;
    const fetchLimit =
      limit !== undefined && limit >= 0 ? limit + 1 : undefined;

    const [allLeads, vehicles, interactionsPage] = await Promise.all([
      this.leads.findByCustomerId(customer.id),
      this.vehicles.listByCustomerId(customer.id),
      this.interactions.listByCustomerId(customer.id, {
        limit: fetchLimit,
        before: params.interactionBefore,
        types: params.interactionTypes,
      }),
    ]);

    const openLeads = allLeads.filter((l) => !isTerminalLeadStatus(l.status));

    let interactions = interactionsPage;
    let interactionsHasMore = false;
    if (limit !== undefined && limit >= 0 && interactionsPage.length > limit) {
      interactionsHasMore = true;
      interactions = interactionsPage.slice(0, limit);
    }

    const lastInteractionAt =
      interactions.length > 0
        ? interactions.reduce(
            (max, i) => (i.at.getTime() > max.getTime() ? i.at : max),
            interactions[0]!.at,
          )
        : undefined;

    return {
      customerId: customer.id,
      phone: customer.phone,
      name: customer.name,
      channel: customer.channel,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
      openLeadCount: openLeads.length,
      lastInteractionAt,
      tags: [],
      leads: allLeads,
      vehicles,
      interactions,
      interactionsHasMore,
    };
  }
}

function toLeadSummary(lead: Lead): LeadSummary {
  const priority: LeadPriority = lead.priority ?? 'Baja';
  return {
    id: lead.id,
    status: lead.status,
    priority,
    product: lead.product,
    createdAt: lead.createdAt,
    needsHumanHandoff: lead.needsHumanHandoff === true,
  };
}
