import type { LeadPriority, LeadSource } from '../entities/Lead';
import { isLeadStatus } from './leadStatuses';

export const LEAD_PRIORITIES = ['Alta', 'Media', 'Baja'] as const satisfies readonly LeadPriority[];

export const LEAD_SOURCES = [
  'whatsapp_flow',
  'whatsapp_handoff',
  'api_test',
] as const satisfies readonly LeadSource[];

/** Prioridad comercial: solo Alta | Media | Baja. */
export function validateLeadPriority(value: unknown): value is LeadPriority {
  return (
    typeof value === 'string' &&
    (LEAD_PRIORITIES as readonly string[]).includes(value)
  );
}

export function assertValidLeadPriority(
  value: unknown,
): asserts value is LeadPriority {
  if (!validateLeadPriority(value)) {
    throw new Error(
      `LeadPriority inválida: ${String(value)} (esperado Alta|Media|Baja)`,
    );
  }
}

/** Teléfono canónico: no vacío tras trim. */
export function validatePhone(phone: unknown): phone is string {
  return typeof phone === 'string' && phone.trim().length > 0;
}

export function assertValidPhone(phone: unknown): asserts phone is string {
  if (!validatePhone(phone)) {
    throw new Error('phone no puede estar vacío');
  }
}

export function validateLeadSource(value: unknown): value is LeadSource {
  return (
    typeof value === 'string' &&
    (LEAD_SOURCES as readonly string[]).includes(value)
  );
}

export { isLeadStatus };
