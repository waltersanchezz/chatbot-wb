import { apiFetch } from './http'

/** Forma JSON de GET/PATCH /api/leads (serializeLead existente). */
export interface LeadListItem {
  id: string
  phone: string
  name: string | null
  status: string
  customerId: string
  updatedAt: string
  recommendation: string | null
  notes?: string | null
}

export async function fetchLeads(): Promise<LeadListItem[]> {
  const res = await apiFetch('/api/leads')
  if (!res.ok) throw new Error(`Leads API ${res.status}`)
  const body = (await res.json()) as { items: LeadListItem[] }
  return body.items ?? []
}

export async function patchLeadStatus(
  leadId: string,
  status: string,
  opts?: { lostReason?: string },
): Promise<LeadListItem> {
  const res = await apiFetch(`/api/leads/${encodeURIComponent(leadId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      ...(opts?.lostReason ? { lostReason: opts.lostReason } : {}),
    }),
  })
  if (!res.ok) {
    const err = new Error(`Lead status API ${res.status}`) as Error & {
      status: number
    }
    err.status = res.status
    throw err
  }
  return (await res.json()) as LeadListItem
}

/** Nota interna del asesor — POST /api/leads/:id/notes (LeadService.addNote). */
export async function postLeadNote(
  leadId: string,
  note: string,
): Promise<LeadListItem> {
  const res = await apiFetch(`/api/leads/${encodeURIComponent(leadId)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note }),
  })
  if (!res.ok) {
    const err = new Error(`Lead notes API ${res.status}`) as Error & {
      status: number
    }
    err.status = res.status
    throw err
  }
  return (await res.json()) as LeadListItem
}
