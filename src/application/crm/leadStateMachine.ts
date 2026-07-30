import {
  assertValidLeadStatusTransition,
  canTransitionLeadStatus,
  isTerminalLeadStatus,
  LEAD_STATUS_TRANSITIONS,
  LEAD_STATUSES,
  OPEN_LEAD_STATUSES,
  TERMINAL_LEAD_STATUSES,
} from '../../domain/crm/leadStatuses';
import type { LeadStatus } from '../../domain/entities/Lead';

export {
  assertValidLeadStatusTransition,
  canTransitionLeadStatus,
  isTerminalLeadStatus,
  LEAD_STATUS_TRANSITIONS,
  LEAD_STATUSES,
  OPEN_LEAD_STATUSES,
  TERMINAL_LEAD_STATUSES,
};

/**
 * Transición ilegal de estado de lead (CRM_SPEC §6 → HTTP 409 en PR4).
 */
export class IllegalLeadTransitionError extends Error {
  readonly code = 'ILLEGAL_LEAD_TRANSITION' as const;

  constructor(
    public readonly from: LeadStatus,
    public readonly to: LeadStatus,
  ) {
    super(`Transición de lead inválida: ${from} → ${to}`);
    this.name = 'IllegalLeadTransitionError';
  }
}

/** Destinos permitidos desde `from` (excluye same-status no-op). */
export function getAllowedTransitions(from: LeadStatus): readonly LeadStatus[] {
  return LEAD_STATUS_TRANSITIONS[from];
}

/**
 * Valida transición. Same-status es no-op válido.
 * Lanza {@link IllegalLeadTransitionError} si es ilegal.
 */
export function assertLeadTransition(from: LeadStatus, to: LeadStatus): void {
  if (canTransitionLeadStatus(from, to)) return;
  throw new IllegalLeadTransitionError(from, to);
}

/**
 * Resuelve el status destino tras validar (same-status → same).
 */
export function applyLeadTransition(
  from: LeadStatus,
  to: LeadStatus,
): LeadStatus {
  assertLeadTransition(from, to);
  return to;
}
