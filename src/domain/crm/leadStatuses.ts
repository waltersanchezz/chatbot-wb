import type { LeadStatus } from '../entities/Lead';

export const LEAD_STATUSES = [
  'nuevo',
  'asignado',
  'en_gestion',
  'cotizado',
  'recontacto',
  'vendido',
  'perdido',
  'cerrado',
] as const satisfies readonly LeadStatus[];

export const TERMINAL_LEAD_STATUSES = [
  'vendido',
  'perdido',
  'cerrado',
] as const satisfies readonly LeadStatus[];

export const OPEN_LEAD_STATUSES = [
  'nuevo',
  'asignado',
  'en_gestion',
  'cotizado',
  'recontacto',
] as const satisfies readonly LeadStatus[];

/**
 * Transiciones válidas (CRM_SPEC §6).
 * Incluye atajos legacy: `nuevo → cotizado | vendido | perdido`.
 */
export const LEAD_STATUS_TRANSITIONS: Readonly<
  Record<LeadStatus, readonly LeadStatus[]>
> = {
  nuevo: ['asignado', 'en_gestion', 'cotizado', 'vendido', 'perdido', 'cerrado'],
  asignado: ['en_gestion', 'recontacto', 'perdido', 'cerrado'],
  en_gestion: ['cotizado', 'recontacto', 'vendido', 'perdido', 'cerrado'],
  cotizado: ['recontacto', 'vendido', 'perdido', 'en_gestion'],
  recontacto: ['en_gestion', 'cotizado', 'vendido', 'perdido', 'cerrado'],
  vendido: [],
  perdido: [],
  cerrado: [],
};

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}

export function isTerminalLeadStatus(status: LeadStatus): boolean {
  return (TERMINAL_LEAD_STATUSES as readonly LeadStatus[]).includes(status);
}

export function canTransitionLeadStatus(
  from: LeadStatus,
  to: LeadStatus,
): boolean {
  if (from === to) return true;
  return LEAD_STATUS_TRANSITIONS[from].includes(to);
}

export function assertValidLeadStatusTransition(
  from: LeadStatus,
  to: LeadStatus,
): void {
  if (!canTransitionLeadStatus(from, to)) {
    throw new Error(`Transición de lead inválida: ${from} → ${to}`);
  }
}
