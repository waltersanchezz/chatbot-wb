/**
 * Reglas de automatización por tenant (Dashboard Sprint 14).
 * Desacopladas de ConversationEngine y motores de venta.
 */

export const AUTOMATION_TRIGGERS = [
  'conversation.created',
  'conversation.updated',
  'conversation.closed',
  'lead.updated',
  'task.created',
  'pipeline.updated',
  'analytics.updated',
] as const;

export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

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
] as const;

export type AutomationConditionField =
  (typeof AUTOMATION_CONDITION_FIELDS)[number];

export const AUTOMATION_ACTIONS = [
  'create_task',
  'raise_priority',
  'create_notification',
  'add_tag',
  'mark_followup',
  'record_event',
] as const;

export type AutomationActionType = (typeof AUTOMATION_ACTIONS)[number];

/** Condición: campo del contexto vs valor (leadScore > usa op ">"). */
export interface AutomationCondition {
  field: AutomationConditionField;
  /** Por defecto: igualdad; leadScore/idle* usan ">" si se omite. */
  op?: '>' | '>=' | '=' | '==' | '!=' | 'contains';
  value: string | number | boolean;
}

export interface AutomationAction {
  type: AutomationActionType;
  /** Texto / etiqueta / título según la acción. */
  label?: string;
  priority?: 'Alta' | 'Media' | 'Baja';
  tag?: string;
  eventName?: string;
  metadata?: Record<string, unknown>;
}

export interface AutomationRuleDto {
  id: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  priority: number;
  trigger: AutomationTrigger;
  condition: AutomationCondition | null;
  action: AutomationAction;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationCreateInput {
  name: string;
  enabled?: boolean;
  priority?: number;
  trigger: string;
  condition?: AutomationCondition | null;
  action: AutomationAction;
  config?: Record<string, unknown>;
}

export interface AutomationUpdateInput {
  name?: string;
  enabled?: boolean;
  priority?: number;
  trigger?: string;
  condition?: AutomationCondition | null;
  action?: AutomationAction;
  config?: Record<string, unknown>;
}

export interface AutomationLogDto {
  id: string;
  ruleId: string;
  tenantId: string;
  trigger: string;
  result: string;
  executedAt: string;
  /** Detalle parseado (opcional en listados). */
  detail?: AutomationExecutionDetail;
}

export interface AutomationExecutionDetail {
  matched: boolean;
  actionType?: AutomationActionType;
  message: string;
  effects?: Record<string, unknown>;
  dryRun?: boolean;
}

/** Contexto de evaluación (datos existentes del sistema / prueba). */
export interface AutomationContext {
  tenantId?: string;
  conversationId?: string;
  waId?: string;
  leadScore?: number | null;
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

export interface AutomationTestInput {
  trigger: string;
  context?: AutomationContext;
  /** Si se indica, solo evalúa esa regla (aunque esté deshabilitada). */
  ruleId?: string;
  dryRun?: boolean;
}

export interface AutomationTestResult {
  trigger: string;
  evaluated: number;
  matched: number;
  logs: AutomationLogDto[];
}

export function isAutomationTrigger(value: string): value is AutomationTrigger {
  return (AUTOMATION_TRIGGERS as readonly string[]).includes(value);
}

export function isAutomationActionType(
  value: string,
): value is AutomationActionType {
  return (AUTOMATION_ACTIONS as readonly string[]).includes(value);
}

export function isAutomationConditionField(
  value: string,
): value is AutomationConditionField {
  return (AUTOMATION_CONDITION_FIELDS as readonly string[]).includes(value);
}
