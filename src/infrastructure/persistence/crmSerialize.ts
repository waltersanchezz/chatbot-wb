import type { Conversation } from '../../domain/entities/Conversation';
import type { Interaction } from '../../domain/entities/Interaction';
import type { Lead } from '../../domain/entities/Lead';
import type { LeadEvent } from '../../domain/entities/LeadEvent';
import type { Message } from '../../domain/entities/Message';
import type { VehicleProfile } from '../../domain/entities/VehicleProfile';

function asDate(value: unknown): Date {
  if (value instanceof Date) return value;
  return new Date(String(value));
}

function asOptionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  return asDate(value);
}

export function serializeLead(lead: Lead): string {
  return JSON.stringify(lead);
}

export function deserializeLead(json: string): Lead {
  const raw = JSON.parse(json) as Lead;
  return {
    ...raw,
    createdAt: asDate(raw.createdAt),
    updatedAt: asOptionalDate(raw.updatedAt),
    priorityUpdatedAt: asOptionalDate(raw.priorityUpdatedAt),
    assignment: raw.assignment
      ? {
          ...raw.assignment,
          assignedAt: asOptionalDate(raw.assignment.assignedAt),
        }
      : undefined,
    sla: raw.sla
      ? {
          ...raw.sla,
          firstResponseDueAt: asOptionalDate(raw.sla.firstResponseDueAt),
          firstResponseAt: asOptionalDate(raw.sla.firstResponseAt),
        }
      : undefined,
    recontact: raw.recontact
      ? {
          ...raw.recontact,
          dueAt: asOptionalDate(raw.recontact.dueAt),
          lastAttemptAt: asOptionalDate(raw.recontact.lastAttemptAt),
        }
      : undefined,
  };
}

export function serializeLeadEvent(event: LeadEvent): string {
  return JSON.stringify(event);
}

export function deserializeLeadEvent(json: string): LeadEvent {
  const raw = JSON.parse(json) as LeadEvent;
  return {
    ...raw,
    at: asDate(raw.at),
    payload: raw.payload ? { ...raw.payload } : undefined,
  };
}

export function serializeInteraction(interaction: Interaction): string {
  return JSON.stringify(interaction);
}

export function deserializeInteraction(json: string): Interaction {
  const raw = JSON.parse(json) as Interaction;
  return {
    ...raw,
    at: asDate(raw.at),
    payload: raw.payload ? { ...raw.payload } : undefined,
  };
}

export function serializeVehicle(vehicle: VehicleProfile): string {
  return JSON.stringify(vehicle);
}

export function deserializeVehicle(json: string): VehicleProfile {
  const raw = JSON.parse(json) as VehicleProfile;
  return {
    ...raw,
    firstSeenAt: asDate(raw.firstSeenAt),
    lastSeenAt: asDate(raw.lastSeenAt),
    createdAt: asDate(raw.createdAt),
    updatedAt: asDate(raw.updatedAt),
  };
}

function reviveMessage(raw: Message): Message {
  return {
    ...raw,
    createdAt: asDate(raw.createdAt),
    metadata: raw.metadata ? { ...raw.metadata } : undefined,
  };
}

export function serializeConversation(conversation: Conversation): string {
  return JSON.stringify(conversation);
}

export function deserializeConversation(json: string): Conversation {
  const raw = JSON.parse(json) as Conversation;
  return {
    ...raw,
    createdAt: asDate(raw.createdAt),
    updatedAt: asDate(raw.updatedAt),
    expiresAt: asDate(raw.expiresAt),
    messages: Array.isArray(raw.messages)
      ? raw.messages.map((m) => reviveMessage(m))
      : [],
    context: structuredClone(raw.context),
  };
}
