/**
 * Presentación comercial para el operador.
 * Solo formatea datos existentes — no inventa información de negocio.
 */

/** Extrae dígitos de un waId / teléfono persistido (p.ej. wa:+57300…). */
export function phoneDigits(raw: string | null | undefined): string {
  if (!raw?.trim()) return ''
  return raw.replace(/^wa:/i, '').replace(/\D/g, '')
}

/**
 * Indica si el valor parece un identificador técnico (wa:prod, test, etc.)
 * y no un número WhatsApp usable.
 */
export function isTechnicalPhoneId(raw: string | null | undefined): boolean {
  const digits = phoneDigits(raw)
  if (digits.length < 8) return true
  const stripped = (raw ?? '').replace(/^wa:/i, '').trim().toLowerCase()
  if (!stripped) return true
  if (/^(prod|dev|test|local|demo|null|undefined)$/i.test(stripped)) return true
  return false
}

/**
 * Número para el asesor: formateado, sin prefijo wa:.
 * Si no es usable → mensaje profesional.
 */
export function formatPhoneDisplay(
  raw: string | null | undefined,
  options?: { masked?: boolean },
): string {
  if (isTechnicalPhoneId(raw)) return 'Número no disponible'
  const digits = phoneDigits(raw)
  const masked = options?.masked === true

  // Colombia 57 + 10 dígitos
  if (digits.startsWith('57') && digits.length >= 12) {
    const local = digits.slice(2, 12)
    const a = local.slice(0, 3)
    const b = local.slice(3, 6)
    const c = local.slice(6)
    if (masked) return `+57 ${a} *** *${c.slice(-3)}`
    return `+57 ${a} ${b} ${c}`
  }

  if (digits.length === 10) {
    const a = digits.slice(0, 3)
    const b = digits.slice(3, 6)
    const c = digits.slice(6)
    if (masked) return `${a} *** *${c.slice(-3)}`
    return `${a} ${b} ${c}`
  }

  if (masked && digits.length > 6) {
    return `${digits.slice(0, 3)} *** ${digits.slice(-3)}`
  }

  return digits.startsWith('57') ? `+${digits}` : digits
}

/**
 * Nombre comercial del cliente.
 * Prioriza nombre Meta; si no hay, fallback profesional con teléfono.
 */
export function customerDisplayName(
  name: string | null | undefined,
  phoneRaw: string | null | undefined,
): string {
  const trimmed = name?.trim()
  if (trimmed) return trimmed
  if (!isTechnicalPhoneId(phoneRaw)) {
    return `Cliente (${formatPhoneDisplay(phoneRaw, { masked: true })})`
  }
  return 'Cliente sin nombre'
}

/** Etiquetas comerciales de estado del flujo de venta. */
export function salesFlowLabel(state: string | null | undefined): string {
  const map: Record<string, string> = {
    NEW: 'Nueva',
    IDENTIFYING_VEHICLE: 'Identificando',
    RECOMMENDATION_READY: 'Recomendación',
    WAITING_CONFIRMATION: 'Esperando',
    READY_FOR_ADVISOR: 'Pendiente operador',
    CLOSED: 'Finalizado',
    UNKNOWN: 'Sin estado',
  }
  if (!state) return 'Sin estado'
  return map[state] ?? 'En curso'
}

/** Clases de badge consistentes (mismo mapa en todo el panel). */
export function salesFlowBadgeClass(state: string | null | undefined): string {
  const map: Record<string, string> = {
    NEW: 'bg-surface text-ink-muted ring-1 ring-line',
    IDENTIFYING_VEHICLE: 'bg-warn/10 text-warn ring-1 ring-warn/20',
    RECOMMENDATION_READY: 'bg-accent-soft text-accent ring-1 ring-accent/20',
    WAITING_CONFIRMATION: 'bg-warn/10 text-warn ring-1 ring-warn/20',
    READY_FOR_ADVISOR: 'bg-danger/10 text-danger ring-1 ring-danger/20',
    CLOSED: 'bg-ok/10 text-ok ring-1 ring-ok/20',
    UNKNOWN: 'bg-surface text-ink-muted ring-1 ring-line',
  }
  if (!state) return map.UNKNOWN
  return map[state] ?? map.UNKNOWN
}

/** Resultado de coincidencia de batería — lenguaje comercial. */
export function matchKindLabel(matchKind: string | null | undefined): string | null {
  if (!matchKind?.trim()) return null
  const key = matchKind.trim().toLowerCase()
  const map: Record<string, string> = {
    exact: 'Coincidencia exacta',
    full: 'Coincidencia exacta',
    range: 'Coincidencia por rango',
    partial: 'Coincidencia parcial',
    none: 'Sin coincidencia',
    no_match: 'Sin coincidencia',
  }
  return map[key] ?? null
}

export function matchKindBadgeClass(matchKind: string | null | undefined): string {
  const key = (matchKind ?? '').trim().toLowerCase()
  if (key === 'none' || key === 'no_match') {
    return 'bg-danger/10 text-danger ring-1 ring-danger/20'
  }
  if (key === 'exact' || key === 'full') {
    return 'bg-ok/10 text-ok ring-1 ring-ok/20'
  }
  if (key === 'range' || key === 'partial') {
    return 'bg-warn/10 text-warn ring-1 ring-warn/20'
  }
  return 'bg-surface text-ink-muted ring-1 ring-line'
}

/** Interés comercial a partir del lead score numérico. */
export function interestLabel(score: number | null | undefined): string {
  if (score == null) return '—'
  if (score >= 80) return 'Alto'
  if (score >= 50) return 'Medio'
  return 'Bajo'
}

export function interestBadgeClass(score: number | null | undefined): string {
  if (score == null) return 'bg-surface text-ink-muted ring-1 ring-line'
  if (score >= 80) return 'bg-ok/10 text-ok ring-1 ring-ok/20'
  if (score >= 50) return 'bg-warn/10 text-warn ring-1 ring-warn/20'
  return 'bg-surface text-ink-muted ring-1 ring-line'
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function formatWillardReference(ref: string | null | undefined): string {
  if (!ref?.trim()) return '—'
  return ref.replace(/^willard:/i, '').trim() || '—'
}

export interface CommercialMilestone {
  id: string
  label: string
  detail?: string
  tone: 'ok' | 'warn' | 'danger' | 'muted'
}

/**
 * Hitos comerciales derivados de campos ya presentes en el detalle.
 * No inventa Telegram si no hay señal; handoff implica alerta al equipo.
 */
export function buildCommercialMilestones(input: {
  recommendedReference?: string | null
  leadScore?: number | null
  salesFlowState?: string | null
  matchKind?: string | null
}): CommercialMilestone[] {
  const items: CommercialMilestone[] = []

  const matchLabel = matchKindLabel(input.matchKind)
  if (matchLabel === 'Sin coincidencia') {
    items.push({
      id: 'no-match',
      label: 'Sin coincidencia de batería',
      detail: 'Requiere revisión del asesor',
      tone: 'danger',
    })
  }

  if (input.recommendedReference?.trim()) {
    items.push({
      id: 'recommendation',
      label: 'Recomendación enviada',
      detail: formatWillardReference(input.recommendedReference),
      tone: 'ok',
    })
  }

  if (
    input.leadScore != null ||
    input.salesFlowState === 'READY_FOR_ADVISOR' ||
    input.salesFlowState === 'CLOSED'
  ) {
    items.push({
      id: 'lead',
      label: 'Lead registrado',
      detail:
        input.leadScore != null
          ? `Interés ${interestLabel(input.leadScore).toLowerCase()}`
          : undefined,
      tone: 'ok',
    })
  }

  if (input.salesFlowState === 'READY_FOR_ADVISOR') {
    items.push({
      id: 'handoff',
      label: 'Handoff al operador',
      detail: 'Cliente espera contacto humano',
      tone: 'danger',
    })
    items.push({
      id: 'telegram',
      label: 'Alerta al equipo',
      detail: 'Notificación Telegram (si está configurada)',
      tone: 'warn',
    })
  }

  if (input.salesFlowState === 'CLOSED') {
    items.push({
      id: 'closed',
      label: 'Conversación finalizada',
      tone: 'muted',
    })
  }

  return items
}
