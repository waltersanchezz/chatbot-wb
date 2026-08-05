import { apiFetch } from './http'

export const WORKFLOW_TRIGGERS = [
  'conversation.created',
  'conversation.updated',
  'conversation.closed',
  'lead.updated',
  'task.created',
  'pipeline.updated',
  'analytics.updated',
] as const

export const WORKFLOW_NODE_TYPES = [
  'Trigger',
  'Condition',
  'Delay',
  'Task',
  'Pipeline',
  'Automation',
  'Notification',
  'Analytics',
  'End',
] as const

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number]

export interface WorkflowEdge {
  id: string
  source: string
  target: string
  label?: string | null
}

export interface WorkflowStepDto {
  id: string
  workflowId: string
  nodeId: string
  type: WorkflowNodeType
  config: Record<string, unknown>
  positionX: number
  positionY: number
}

export interface WorkflowDto {
  id: string
  tenantId: string
  name: string
  description: string
  enabled: boolean
  trigger: string
  graph: { edges: WorkflowEdge[] }
  steps: WorkflowStepDto[]
  createdAt: string
  updatedAt: string
}

export interface WorkflowRunDto {
  id: string
  workflowId: string
  tenantId: string
  status: string
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
}

export interface WorkflowCreateInput {
  name: string
  description?: string
  enabled?: boolean
  trigger: string
  graph?: { edges: WorkflowEdge[] }
  steps?: Array<{
    nodeId: string
    type: string
    config?: Record<string, unknown>
    positionX?: number
    positionY?: number
  }>
}

export type WorkflowUpdateInput = Partial<WorkflowCreateInput>

export async function fetchWorkflows(): Promise<{
  workflows: WorkflowDto[]
  total: number
  enabledCount: number
}> {
  const res = await apiFetch('/api/workflows')
  if (!res.ok) throw new Error(`Workflows API ${res.status}`)
  return (await res.json()) as {
    workflows: WorkflowDto[]
    total: number
    enabledCount: number
  }
}

export async function createWorkflow(
  input: WorkflowCreateInput,
): Promise<WorkflowDto> {
  const res = await apiFetch('/api/workflows', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Create ${res.status}`)
  }
  return (await res.json()) as WorkflowDto
}

export async function updateWorkflow(
  id: string,
  input: WorkflowUpdateInput,
): Promise<WorkflowDto> {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Update ${res.status}`)
  }
  return (await res.json()) as WorkflowDto
}

export async function deleteWorkflow(id: string): Promise<void> {
  const res = await apiFetch(`/api/workflows/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok && res.status !== 204) throw new Error(`Delete ${res.status}`)
}

export async function duplicateWorkflow(id: string): Promise<WorkflowDto> {
  const res = await apiFetch(
    `/api/workflows/${encodeURIComponent(id)}/duplicate`,
    { method: 'POST' },
  )
  if (!res.ok) throw new Error(`Duplicate ${res.status}`)
  return (await res.json()) as WorkflowDto
}

export async function fetchWorkflowRuns(params?: {
  workflowId?: string
  limit?: number
}): Promise<WorkflowRunDto[]> {
  const sp = new URLSearchParams()
  if (params?.workflowId) sp.set('workflowId', params.workflowId)
  if (params?.limit) sp.set('limit', String(params.limit))
  const q = sp.toString()
  const res = await apiFetch(`/api/workflows/runs${q ? `?${q}` : ''}`)
  if (!res.ok) throw new Error(`Runs ${res.status}`)
  const data = (await res.json()) as { runs: WorkflowRunDto[] }
  return data.runs
}

export async function testWorkflow(input: {
  trigger: string
  workflowId?: string
  context?: Record<string, unknown>
  dryRun?: boolean
}): Promise<{
  trigger: string
  executions: Array<{
    workflowId: string
    run: WorkflowRunDto
    steps: Array<{ nodeId: string; type: string; ok: boolean; message: string }>
    dryRun: boolean
  }>
}> {
  const res = await apiFetch('/api/workflows/test', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `Test ${res.status}`)
  }
  return (await res.json()) as {
    trigger: string
    executions: Array<{
      workflowId: string
      run: WorkflowRunDto
      steps: Array<{
        nodeId: string
        type: string
        ok: boolean
        message: string
      }>
      dryRun: boolean
    }>
  }
}
