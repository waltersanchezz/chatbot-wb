import type { Interaction } from '../../../domain/entities/Interaction';
import type {
  Lead,
  LeadRecommendationSnapshot,
} from '../../../domain/entities/Lead';
import type { LeadEvent } from '../../../domain/entities/LeadEvent';
import type { VehicleProfile } from '../../../domain/entities/VehicleProfile';
import type { CustomerProfileDetail } from '../../../domain/entities/CustomerProfile';

/** Forma JSON compatible con dashboard + CRM_SPEC §11.3. */
export function serializeLead(lead: Lead) {
  return {
    id: lead.id,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: (lead.updatedAt ?? lead.createdAt).toISOString(),
    phone: lead.phone,
    name: lead.name ?? null,
    product: lead.product,
    vehicleBrand: lead.vehicleBrand,
    vehicleModel: lead.vehicleModel,
    year: lead.year,
    optionLabel: lead.optionLabel,
    optionValue: lead.optionValue,
    recommendation: lead.recommendation,
    status: lead.status,
    priority: lead.priority ?? null,
    conversationId: lead.conversationId,
    customerId: lead.customerId,
    vehicleProfileId: lead.vehicleProfileId ?? null,
    needsHumanHandoff: lead.needsHumanHandoff === true,
    handoffReason: lead.handoffReason ?? null,
    recommendationSnapshot: lead.recommendationSnapshot
      ? serializeSnapshot(lead.recommendationSnapshot)
      : null,
    assignment: lead.assignment
      ? {
          assigneeId: lead.assignment.assigneeId ?? null,
          assigneeName: lead.assignment.assigneeName ?? null,
          assignedAt: lead.assignment.assignedAt?.toISOString() ?? null,
        }
      : null,
    sla: lead.sla
      ? {
          firstResponseDueAt: lead.sla.firstResponseDueAt?.toISOString() ?? null,
          firstResponseAt: lead.sla.firstResponseAt?.toISOString() ?? null,
          breached: lead.sla.breached === true,
        }
      : null,
    recontact: lead.recontact
      ? {
          dueAt: lead.recontact.dueAt?.toISOString() ?? null,
          attempts: lead.recontact.attempts,
          lastAttemptAt: lead.recontact.lastAttemptAt?.toISOString() ?? null,
          note: lead.recontact.note ?? null,
        }
      : null,
    notes: lead.notes ?? null,
    lostReason: lead.lostReason ?? null,
    channel: lead.channel ?? null,
    source: lead.source ?? null,
  };
}

function serializeSnapshot(snapshot: LeadRecommendationSnapshot) {
  return {
    outcome: snapshot.outcome,
    reasonCode: snapshot.reasonCode ?? null,
    query: snapshot.query,
    options: snapshot.options,
    summary: snapshot.summary,
  };
}

export function serializeLeadEvent(event: LeadEvent) {
  return {
    id: event.id,
    leadId: event.leadId,
    type: event.type,
    at: event.at.toISOString(),
    actor: event.actor,
    actorId: event.actorId ?? null,
    payload: event.payload ?? null,
  };
}

export function serializeInteraction(interaction: Interaction) {
  return {
    id: interaction.id,
    customerId: interaction.customerId,
    at: interaction.at.toISOString(),
    type: interaction.type,
    channel: interaction.channel,
    conversationId: interaction.conversationId ?? null,
    messageId: interaction.messageId ?? null,
    leadId: interaction.leadId ?? null,
    summary: interaction.summary,
    payload: interaction.payload ?? null,
    actor: interaction.actor,
    actorId: interaction.actorId ?? null,
  };
}

export function serializeVehicle(vehicle: VehicleProfile) {
  return {
    id: vehicle.id,
    customerId: vehicle.customerId,
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year ?? null,
    version: vehicle.version ?? null,
    notes: vehicle.notes ?? null,
    source: vehicle.source,
    firstSeenAt: vehicle.firstSeenAt.toISOString(),
    lastSeenAt: vehicle.lastSeenAt.toISOString(),
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  };
}

export function serializeCustomerProfile(detail: CustomerProfileDetail) {
  return {
    customerId: detail.customerId,
    phone: detail.phone,
    name: detail.name ?? null,
    channel: detail.channel,
    createdAt: detail.createdAt.toISOString(),
    updatedAt: detail.updatedAt.toISOString(),
    openLeadCount: detail.openLeadCount,
    lastInteractionAt: detail.lastInteractionAt?.toISOString() ?? null,
    tags: detail.tags ?? [],
    leads: detail.leads.map(serializeLead),
    vehicles: detail.vehicles.map(serializeVehicle),
    interactions: detail.interactions.map(serializeInteraction),
    interactionsHasMore: detail.interactionsHasMore,
  };
}
