import { apiFetch } from './http'

export const AUTOMATION_TRIGGERS = [
  'conversation.created',
  'conversation.updated',
  'conversation.closed',
  'lead.updated',
  'task.created',
  'pipeline.updated',
  'analytics.updated',
] as const

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]

export const AUTOMATION_CONDITION_FIELDS = [
  'leadScore',
  'salesFlowState',
  'idleMinutes',
  'idleHours',
  'vehicle',
  'brand',
  'reference',
  'accepted',
  'abandoned',
  'customerType',
] as const

export const AUTOMATION_ACTIONS = [
  'create_task',
  'raise_priority',
  'create_notification',
  'add_tag',
  'mark_followup',
  'record_event',
] as const

export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number]

export interface AutomationCondition {
  field: (typeof AUTOMATION_CONDITION_FIELDS)[number]
  op?: '>' | '>=' | '=' | '==' | '!=' | 'contains'
  value: string | number | boolean
}

export interface AutomationAction {
  type: AutomationActionType
  label?: string
  priority?: 'Alta' | 'Media' | 'Baja'
  tag?: string
  eventName?: string
}

export interface AutomationRuleDto {
  id: string
  tenantId: string
  name: string
  enabled: boolean
  priority: number
  trigger: AutomationTrigger
  condition: AutomationCondition | null
  action: AutomationAction
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface AutomationLogDto {
  id: string
  ruleId: string
  tenantId: string
  trigger: string
  result: string
  executedAt: string
  detail?: {
    matched: boolean
    actionType?: string
    message: string
    dryRun?: boolean
  }
}

export interface AutomationCreateInput {
  name: string
  enabled?: boolean
  priority?: number
  trigger: string
  condition?: AutomationCondition | null
  action: AutomationAction
  config?: Record<string, unknown>
}

export type AutomationUpdateInput = Partial<AutomationCreateInput>

export async function fetchAutomations(): Promise<{
  rules: AutomationRuleDto[]
  total: number
  enabledCount: number
}> {
  const res = await apiFetch('/api/automations')
  if (!res.ok) throw new Error(`Automations API ${res.status}`)
  return (await res.json()) as {
    rules: AutomationRuleDto[]
    total: number
    enabledCount: number
  }
}

export async function createAutomation(
  input: AutomationCreateInput,
): Promise<AutomationRuleDto> {
  const res = await apiFetch('/api/automations', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Create ${res.status}`)
  }
  return (await res.json()) as AutomationRuleDto
}

export async function updateAutomation(
  id: string,
  input: AutomationUpdateInput,
): Promise<AutomationRuleDto> {
  const res = await apiFetch(`/api/automations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Update ${res.status}`)
  }
  return (await res.json()) as AutomationRuleDto
}

export async function deleteAutomation(id: string): Promise<void> {
  const res = await apiFetch(`/api/automations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) {
    throw new Error(`Delete ${res.status}`)
  }
}

export async function duplicateAutomation(
  id: string,
): Promise<AutomationRuleDto> {
  const res = await apiFetch(
    `/api/automations/${encodeURIComponent(id)}/duplicate`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`Duplicate ${res.status}`)
  return (await res.json()) as AutomationRuleDto
}

export async function fetchAutomationLogs(params?: {
  ruleId?: string
  limit?: number
}): Promise<AutomationLogDto[]> {
  const sp = new URLSearchParams()
  if (params?.ruleId) sp.set('ruleId', params.ruleId)
  if (params?.limit) sp.set('limit', String(params.limit))
  const q = sp.toString()
  const res = await apiFetch(`/api/automations/logs${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`Logs ${res.status}`)
  const data = (await res.json()) as { logs: AutomationLogDto[] }
  return data.logs
}

export async function testAutomation(input: {
  trigger: string
  context?: Record<string, unknown>
  ruleId?: string
  dryRun?: boolean
}): Promise<{
  trigger: string
  evaluated: number
  matched: number
  logs: AutomationLogDto[]
}> {
  const res = await apiFetch('/api/automations/test', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Test ${res.status}`)
  }
  return (await res.json()) as {
    trigger: string
    evaluated: number
    matched: number
    logs: AutomationLogDto[]
  }
}
