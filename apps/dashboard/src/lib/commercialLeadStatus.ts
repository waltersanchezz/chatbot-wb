/**
 * Estados comerciales del operador → LeadStatus de LeadService (sin nueva máquina).
 *
 * Visible → API:
 *   Nuevo → nuevo
 *   Contactado → en_gestion
 *   Cotizado → cotizado
 *   Vendido → vendido
 *   No interesado → perdido
 */

export const COMMERCIAL_STATUSES = [
  'Nuevo',
  'Contactado',
  'Cotizado',
  'Vendido',
  'No interesado',
] as const

export type CommercialStatus = (typeof COMMERCIAL_STATUSES)[number]

const LABEL_TO_LEAD: Record<CommercialStatus, string> = {
  Nuevo: 'nuevo',
  Contactado: 'en_gestion',
  Cotizado: 'cotizado',
  Vendido: 'vendido',
  'No interesado': 'perdido',
}

export function commercialStatusToLeadStatus(label: CommercialStatus): string {
  return LABEL_TO_LEAD[label]
}

export function leadStatusToCommercial(status: string): CommercialStatus {
  switch (status) {
    case 'nuevo':
      return 'Nuevo'
    case 'asignado':
    case 'en_gestion':
    case 'recontacto':
      return 'Contactado'
    case 'cotizado':
      return 'Cotizado'
    case 'vendido':
      return 'Vendido'
    case 'perdido':
    case 'cerrado':
      return 'No interesado'
    default:
      return 'Nuevo'
  }
}

export function isTerminalLeadStatus(status: string): boolean {
  return status === 'vendido' || status === 'perdido' || status === 'cerrado'
}

/**
 * Secuencia de PATCH hacia el status API, respetando transiciones de LeadService.
 * p.ej. asignado → cotizado/vendido no es directo: pasa por en_gestion.
 */
export function leadStatusPatchPath(
  from: string,
  targetLabel: CommercialStatus,
): string[] {
  const to = commercialStatusToLeadStatus(targetLabel)
  if (from === to) return []

  if (from === 'asignado' && (to === 'cotizado' || to === 'vendido')) {
    return ['en_gestion', to]
  }

  return [to]
}

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function phonesMatch(a: string, b: string): boolean {
  const da = phoneDigits(a)
  const db = phoneDigits(b)
  if (!da || !db) return false
  return da === db || da.endsWith(db) || db.endsWith(da)
}

/** Lead abierto más reciente del teléfono; si no hay abiertos, el más reciente. */
export function pickLeadForPhone<
  T extends { phone: string; status: string; updatedAt: string },
>(leads: T[], waIdOrPhone: string): T | null {
  const matches = leads.filter((l) => phonesMatch(l.phone, waIdOrPhone))
  if (matches.length === 0) return null
  const open = matches.filter((l) => !isTerminalLeadStatus(l.status))
  const pool = open.length > 0 ? open : matches
  return [...pool].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  )[0]!
}
