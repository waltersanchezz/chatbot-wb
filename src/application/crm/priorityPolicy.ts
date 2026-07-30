import {
  isTerminalLeadStatus,
  OPEN_LEAD_STATUSES,
} from '../../domain/crm/leadStatuses';
import type { Lead, LeadPriority, LeadStatus } from '../../domain/entities/Lead';

export interface ComputeLeadPriorityInput {
  lead: Lead;
  /** Leads no terminales del mismo customerId (incluye el actual si está abierto). */
  openLeadCount: number;
  now: Date;
}

const PRIORITY_RANK: Record<LeadPriority, number> = {
  Baja: 0,
  Media: 1,
  Alta: 2,
};

const OPEN_STATUS_SET = new Set<LeadStatus>(OPEN_LEAD_STATUSES);

function isOpenStatus(status: LeadStatus): boolean {
  return OPEN_STATUS_SET.has(status);
}

function maxPriority(a: LeadPriority, b: LeadPriority): LeadPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

/**
 * Prioridad comercial solo con señales CRM (CRM_SPEC §8).
 * Nunca llama a RecommendationService / Willard.
 * Evaluación en orden; gana el máximo nivel alcanzado.
 */
export function computeLeadPriority(
  input: ComputeLeadPriorityInput,
): LeadPriority {
  const { lead, openLeadCount, now } = input;

  // R9 — terminales fuera de cola activa
  if (isTerminalLeadStatus(lead.status)) {
    return 'Baja';
  }

  let result: LeadPriority = 'Baja'; // R8 default para abiertos

  const handoff = lead.needsHumanHandoff === true;
  const firstResponseAt = lead.sla?.firstResponseAt;
  const firstResponseDueAt = lead.sla?.firstResponseDueAt;

  // R1
  if (
    handoff &&
    (lead.status === 'nuevo' || lead.status === 'asignado') &&
    !firstResponseAt
  ) {
    result = maxPriority(result, 'Alta');
  }

  // R2
  const slaOverdueWithoutTouch =
    firstResponseDueAt !== undefined &&
    firstResponseDueAt.getTime() < now.getTime() &&
    !firstResponseAt;
  if (lead.sla?.breached === true || slaOverdueWithoutTouch) {
    result = maxPriority(result, 'Alta');
  }

  // R3
  const recontactDueAt = lead.recontact?.dueAt;
  if (
    lead.status === 'recontacto' &&
    recontactDueAt !== undefined &&
    recontactDueAt.getTime() < now.getTime()
  ) {
    result = maxPriority(result, 'Alta');
  }

  // R4
  if (openLeadCount >= 2 && isOpenStatus(lead.status)) {
    result = maxPriority(result, 'Alta');
  }

  const hitAlta = result === 'Alta';

  // R5 — handoff abierto no cubierto por R1 (sin R1–R4 Alta)
  if (!hitAlta && handoff && isOpenStatus(lead.status)) {
    result = maxPriority(result, 'Media');
  }

  // R6
  if (
    !hitAlta &&
    lead.product === 'Batería' &&
    (lead.status === 'nuevo' ||
      lead.status === 'asignado' ||
      lead.status === 'en_gestion')
  ) {
    result = maxPriority(result, 'Media');
  }

  // R7 — snapshot opcional ya persistido
  if (
    !hitAlta &&
    lead.recommendationSnapshot?.outcome === 'empty' &&
    (handoff || isOpenStatus(lead.status))
  ) {
    result = maxPriority(result, 'Media');
  }

  return result;
}
