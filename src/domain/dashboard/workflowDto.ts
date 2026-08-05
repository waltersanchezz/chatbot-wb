/**
 * Workflow Builder por tenant (Dashboard Sprint 15).
 * Orquestación visual sobre EventBus + AutomationService (sin modificar motores).
 */

export const WORKFLOW_TRIGGERS = [
  'conversation.created',
  'conversation.updated',
  'conversation.closed',
  'lead.updated',
  'task.created',
  'pipeline.updated',
  'analytics.updated',
] as const;

export type WorkflowTrigger = (typeof WORKFLOW_TRIGGERS)[number];

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
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

export const WORKFLOW_CONDITION_FIELDS = [
  'leadScore',
  'salesFlow',
  'idleMinutes',
  'idleHours',
  'accepted',
  'abandoned',
  'vehicle',
  'brand',
  'reference',
  'customerType',
] as const;

export type WorkflowConditionField =
  (typeof WORKFLOW_CONDITION_FIELDS)[number];

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** Para nodos Condition: 'true' | 'false'. */
  label?: string | null;
}

export interface WorkflowGraph {
  edges: WorkflowEdge[];
}

export interface WorkflowStepDto {
  id: string;
  workflowId: string;
  nodeId: string;
  type: WorkflowNodeType;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

export interface WorkflowDto {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  graph: WorkflowGraph;
  steps: WorkflowStepDto[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowCreateInput {
  name: string;
  description?: string;
  enabled?: boolean;
  trigger: string;
  graph?: WorkflowGraph;
  steps?: Array<{
    nodeId: string;
    type: string;
    config?: Record<string, unknown>;
    positionX?: number;
    positionY?: number;
  }>;
}

export interface WorkflowUpdateInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  trigger?: string;
  graph?: WorkflowGraph;
  steps?: Array<{
    nodeId: string;
    type: string;
    config?: Record<string, unknown>;
    positionX?: number;
    positionY?: number;
  }>;
}

export interface WorkflowRunDto {
  id: string;
  workflowId: string;
  tenantId: string;
  status: WorkflowRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface WorkflowContext {
  tenantId?: string;
  conversationId?: string;
  waId?: string;
  leadScore?: number | null;
  salesFlow?: string | null;
  salesFlowState?: string | null;
  idleMinutes?: number | null;
  idleHours?: number | null;
  vehicle?: string | null;
  brand?: string | null;
  reference?: string | null;
  accepted?: boolean | null;
  abandoned?: boolean | null;
  customerType?: string | null;
  [key: string]: unknown;
}

export interface WorkflowTestInput {
  trigger: string;
  workflowId?: string;
  context?: WorkflowContext;
  dryRun?: boolean;
}

export interface WorkflowStepTrace {
  nodeId: string;
  type: WorkflowNodeType;
  ok: boolean;
  message: string;
  effects?: Record<string, unknown>;
}

export interface WorkflowExecutionResult {
  workflowId: string;
  run: WorkflowRunDto;
  steps: WorkflowStepTrace[];
  dryRun: boolean;
}

export function isWorkflowTrigger(value: string): value is WorkflowTrigger {
  return (WORKFLOW_TRIGGERS as readonly string[]).includes(value);
}

export function isWorkflowNodeType(value: string): value is WorkflowNodeType {
  return (WORKFLOW_NODE_TYPES as readonly string[]).includes(value);
}

export function isWorkflowConditionField(
  value: string,
): value is WorkflowConditionField {
  return (WORKFLOW_CONDITION_FIELDS as readonly string[]).includes(value);
}
