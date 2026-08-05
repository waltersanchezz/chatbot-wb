import { apiFetch } from './http'

export const TEMPLATE_CATEGORIES = [
  'Automotriz',
  'Veterinaria',
  'Restaurante',
  'Ferretería',
  'Clínica',
  'Inmobiliaria',
  'Retail',
  'Genérico',
] as const

export interface TemplateContentSummary {
  knowledge: number
  automations: number
  workflows: number
  company: boolean
  pipeline: boolean
  tasks: number
  widgets: number
}

export interface TemplateDto {
  id: string
  category: string
  name: string
  description: string
  thumbnail: string | null
  version: string
  author: string
  enabled: boolean
  createdAt: string
  payload: Record<string, unknown>
  summary: TemplateContentSummary
}

export interface TemplateInstallDto {
  id: string
  tenantId: string
  templateId: string
  installedAt: string
  version: string
}

export async function fetchTemplates(params?: {
  q?: string
  category?: string
}): Promise<TemplateDto[]> {
  const sp = new URLSearchParams()
  if (params?.q) sp.set('q', params.q)
  if (params?.category) sp.set('category', params.category)
  const q = sp.toString()
  const res = await apiFetch(`/api/templates${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`Templates ${res.status}`)
  const data = (await res.json()) as { templates: TemplateDto[] }
  return data.templates
}

export async function fetchTemplate(id: string): Promise<TemplateDto> {
  const res = await apiFetch(`/api/templates/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error(`Template ${res.status}`)
  return (await res.json()) as TemplateDto
}

export async function installTemplate(
  id: string,
  force = false,
): Promise<{
  install: TemplateInstallDto
  created: {
    knowledge: number
    automations: number
    workflows: number
    company: boolean
  }
  updated: boolean
}> {
  const res = await apiFetch(`/api/templates/${encodeURIComponent(id)}/install`, {
    method: 'POST',
    body: JSON.stringify({ force }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Install ${res.status}`)
  }
  return (await res.json()) as {
    install: TemplateInstallDto
    created: {
      knowledge: number
      automations: number
      workflows: number
      company: boolean
    }
    updated: boolean
  }
}

export async function uninstallTemplate(id: string): Promise<void> {
  const res = await apiFetch(
    `/api/templates/${encodeURIComponent(id)}/install`,
    { method: 'DELETE' },
  )
  if (!res.ok && res.status !== 204) {
    throw new Error(`Uninstall ${res.status}`)
  }
}

export async function fetchTemplateInstalls(): Promise<TemplateInstallDto[]> {
  const res = await apiFetch('/api/template-installs')
  if (!res.ok) throw new Error(`Installs ${res.status}`)
  const data = (await res.json()) as { installs: TemplateInstallDto[] }
  return data.installs
}
