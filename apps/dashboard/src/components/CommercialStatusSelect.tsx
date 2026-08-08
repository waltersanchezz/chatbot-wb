import {
  COMMERCIAL_STATUSES,
  isTerminalLeadStatus,
  leadStatusToCommercial,
  type CommercialStatus,
} from '../lib/commercialLeadStatus'
import type { LeadListItem } from '../api/leadsApi'

/**
 * Select de estado comercial — mismo control que Clientes (LeadService / PATCH status).
 */
export function CommercialStatusSelect({
  lead,
  disabled,
  onChange,
}: {
  lead: LeadListItem | null
  disabled?: boolean
  onChange: (label: CommercialStatus, lead: LeadListItem) => void
}) {
  if (!lead) {
    return <span className="text-xs text-ink-muted">Sin oportunidad</span>
  }

  const value = leadStatusToCommercial(lead.status)
  const locked = isTerminalLeadStatus(lead.status)

  return (
    <select
      value={value}
      disabled={disabled || locked}
      aria-label="Estado comercial"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation()
        const next = e.target.value as CommercialStatus
        if (next === value) return
        onChange(next, lead)
      }}
      className="max-w-[9.5rem] rounded-lg border border-line bg-panel px-2 py-1.5 text-xs text-ink outline-none ring-accent focus:ring-2 disabled:opacity-50"
    >
      {COMMERCIAL_STATUSES.map((label) => (
        <option key={label} value={label}>
          {label}
        </option>
      ))}
    </select>
  )
}
