import type { EventBus } from '../../domain/realtime/EventBus';
import type { RealtimeEvent } from '../../domain/realtime/realtimeEvents';
import type { AutomationRepository } from '../../domain/dashboard/AutomationRepository';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationContext,
  AutomationCreateInput,
  AutomationExecutionDetail,
  AutomationLogDto,
  AutomationRuleDto,
  AutomationTestInput,
  AutomationTestResult,
  AutomationUpdateInput,
} from '../../domain/dashboard/automationDto';
import {
  isAutomationActionType,
  isAutomationConditionField,
  isAutomationTrigger,
} from '../../domain/dashboard/automationDto';
import { runWithTenant } from '../../domain/tenant/TenantContext';
import { DEFAULT_TENANT_ID } from '../../domain/tenant/tenantDto';

export class AutomationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AutomationValidationError';
  }
}

/**
 * Automation Manager — reglas desacopladas escuchando el EventBus.
 * No conoce ConversationEngine ni envía WhatsApp.
 */
export class AutomationService {
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly repository: AutomationRepository) {}

  /** Suscribe al EventBus existente (Realtime / SSE). */
  start(eventBus: EventBus): () => void {
    this.stop();
    this.unsubscribe = eventBus.subscribe((event) => {
      this.onRealtimeEvent(event);
    });
    return () => this.stop();
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  list(): AutomationRuleDto[] {
    return this.repository.listRules();
  }

  getById(id: string): AutomationRuleDto | null {
    return this.repository.getRule(id);
  }

  create(input: AutomationCreateInput): AutomationRuleDto {
    this.assertCreate(input);
    return this.repository.createRule(sanitizeCreate(input));
  }

  update(id: string, input: AutomationUpdateInput): AutomationRuleDto | null {
    if (!id.trim()) throw new AutomationValidationError('id es obligatorio');
    this.assertUpdate(input);
    return this.repository.updateRule(id, sanitizeUpdate(input));
  }

  delete(id: string): boolean {
    if (!id.trim()) throw new AutomationValidationError('id es obligatorio');
    return this.repository.deleteRule(id);
  }

  duplicate(id: string): AutomationRuleDto | null {
    if (!id.trim()) throw new AutomationValidationError('id es obligatorio');
    return this.repository.duplicateRule(id);
  }

  listLogs(options?: { ruleId?: string; limit?: number }): AutomationLogDto[] {
    return this.repository.listLogs(options);
  }

  /**
   * Prueba reglas contra un contexto simulado (Dashboard).
   * dryRun=true no escribe efectos reales (sí puede registrar log de prueba).
   */
  test(input: AutomationTestInput): AutomationTestResult {
    const trigger = String(input.trigger ?? '').trim();
    if (!isAutomationTrigger(trigger)) {
      throw new AutomationValidationError(`trigger inválido: ${trigger}`);
    }
    const context = { ...(input.context ?? {}) };
    const dryRun = input.dryRun !== false;
    const rules = input.ruleId
      ? (() => {
          const rule = this.repository.getRule(input.ruleId!);
          return rule ? [rule] : [];
        })()
      : this.repository.listEnabledByTrigger(trigger);

    const logs: AutomationLogDto[] = [];
    let matched = 0;
    for (const rule of rules) {
      const detail = this.evaluateRule(rule, context, { dryRun, trigger });
      if (detail.matched) matched += 1;
      logs.push(
        this.repository.appendLog({
          ruleId: rule.id,
          trigger,
          result: JSON.stringify({ ...detail, dryRun }),
        }),
      );
    }
    return { trigger, evaluated: rules.length, matched, logs };
  }

  /** Entrada desde EventBus (ConversationEngine no cambia). */
  onRealtimeEvent(event: RealtimeEvent): void {
    const trigger = event.type;
    if (!isAutomationTrigger(trigger)) return;

    const tenantId =
      event.payload.tenantId?.trim() || DEFAULT_TENANT_ID;

    runWithTenant(tenantId, () => {
      const context: AutomationContext = {
        tenantId,
        conversationId: event.payload.conversationId,
        waId: event.payload.waId,
        leadScore: event.payload.leadScore,
        salesFlowState: event.payload.salesFlowState,
        idleMinutes: event.payload.idleMinutes,
        idleHours: event.payload.idleHours,
        vehicle: event.payload.vehicle,
        brand: event.payload.brand,
        reference: event.payload.reference,
        accepted: event.payload.accepted,
        abandoned: event.payload.abandoned,
        customerType: event.payload.customerType,
      };
      this.executeTrigger(trigger, context, false);
    });
  }

  executeTrigger(
    trigger: string,
    context: AutomationContext,
    dryRun: boolean,
  ): AutomationLogDto[] {
    const rules = this.repository.listEnabledByTrigger(trigger);
    const logs: AutomationLogDto[] = [];
    for (const rule of rules) {
      const detail = this.evaluateRule(rule, context, { dryRun, trigger });
      logs.push(
        this.repository.appendLog({
          ruleId: rule.id,
          trigger,
          result: JSON.stringify(detail),
        }),
      );
    }
    return logs;
  }

  evaluateRule(
    rule: AutomationRuleDto,
    context: AutomationContext,
    options: { dryRun: boolean; trigger: string },
  ): AutomationExecutionDetail {
    const matched = matchesCondition(rule.condition, context);
    if (!matched) {
      return {
        matched: false,
        message: `Condición no cumplida para regla "${rule.name}"`,
        dryRun: options.dryRun,
      };
    }
    const effects = options.dryRun
      ? { preview: describeAction(rule.action), config: rule.config }
      : applyAction(rule.action, context, rule.config);

    return {
      matched: true,
      actionType: rule.action.type,
      message: options.dryRun
        ? `Dry-run: ${describeAction(rule.action)}`
        : `Ejecutado: ${describeAction(rule.action)}`,
      effects,
      dryRun: options.dryRun,
    };
  }

  private assertCreate(input: AutomationCreateInput): void {
    if (!String(input.name ?? '').trim()) {
      throw new AutomationValidationError('name es obligatorio');
    }
    if (!isAutomationTrigger(String(input.trigger ?? '').trim())) {
      throw new AutomationValidationError(
        `trigger inválido: ${String(input.trigger)}`,
      );
    }
    this.assertAction(input.action);
    this.assertCondition(input.condition ?? null);
  }

  private assertUpdate(input: AutomationUpdateInput): void {
    if (
      input.trigger !== undefined &&
      !isAutomationTrigger(String(input.trigger).trim())
    ) {
      throw new AutomationValidationError(
        `trigger inválido: ${String(input.trigger)}`,
      );
    }
    if (input.action !== undefined) this.assertAction(input.action);
    if (input.condition !== undefined) this.assertCondition(input.condition);
    if (input.name !== undefined && !String(input.name).trim()) {
      throw new AutomationValidationError('name no puede estar vacío');
    }
  }

  private assertAction(action: AutomationAction | undefined): void {
    if (!action || !isAutomationActionType(String(action.type ?? ''))) {
      throw new AutomationValidationError('action.type inválido');
    }
  }

  private assertCondition(condition: AutomationCondition | null): void {
    if (condition == null) return;
    if (!isAutomationConditionField(String(condition.field ?? ''))) {
      throw new AutomationValidationError(
        `condition.field inválido: ${String(condition.field)}`,
      );
    }
  }
}

function sanitizeCreate(input: AutomationCreateInput): AutomationCreateInput {
  return {
    name: String(input.name).trim(),
    enabled: input.enabled,
    priority: input.priority,
    trigger: String(input.trigger).trim(),
    condition: input.condition ?? null,
    action: input.action,
    config: input.config,
  };
}

function sanitizeUpdate(input: AutomationUpdateInput): AutomationUpdateInput {
  const out: AutomationUpdateInput = {};
  if (input.name !== undefined) out.name = String(input.name).trim();
  if (input.enabled !== undefined) out.enabled = input.enabled;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.trigger !== undefined) out.trigger = String(input.trigger).trim();
  if (input.condition !== undefined) out.condition = input.condition;
  if (input.action !== undefined) out.action = input.action;
  if (input.config !== undefined) out.config = input.config;
  return out;
}

export function matchesCondition(
  condition: AutomationCondition | null,
  context: AutomationContext,
): boolean {
  if (!condition) return true;
  const field = condition.field;
  const raw = context[field];
  const op =
    condition.op ??
    (field === 'leadScore' ||
    field === 'idleMinutes' ||
    field === 'idleHours'
      ? '>'
      : '=');

  if (field === 'leadScore' || field === 'idleMinutes' || field === 'idleHours') {
    const left = Number(raw);
    const right = Number(condition.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (op === '>') return left > right;
    if (op === '>=') return left >= right;
    if (op === '!=') return left !== right;
    return left === right;
  }

  if (field === 'accepted' || field === 'abandoned') {
    const left = Boolean(raw);
    const right = Boolean(condition.value);
    if (op === '!=') return left !== right;
    return left === right;
  }

  const left = String(raw ?? '')
    .trim()
    .toLowerCase();
  const right = String(condition.value ?? '')
    .trim()
    .toLowerCase();
  if (op === 'contains') return left.includes(right);
  if (op === '!=') return left !== right;
  return left === right;
}

function describeAction(action: AutomationAction): string {
  switch (action.type) {
    case 'create_task':
      return `Crear tarea${action.label ? `: ${action.label}` : ''}`;
    case 'raise_priority':
      return `Subir prioridad${action.priority ? ` → ${action.priority}` : ''}`;
    case 'create_notification':
      return `Crear notificación${action.label ? `: ${action.label}` : ''}`;
    case 'add_tag':
      return `Agregar etiqueta${action.tag ? `: ${action.tag}` : ''}`;
    case 'mark_followup':
      return `Marcar seguimiento${action.label ? `: ${action.label}` : ''}`;
    case 'record_event':
      return `Registrar evento${action.eventName ? `: ${action.eventName}` : ''}`;
    default:
      return String(action.type);
  }
}

/**
 * Aplica acciones locales (sin WhatsApp).
 * Persiste el efecto en el detalle del log; no altera motores.
 */
function applyAction(
  action: AutomationAction,
  context: AutomationContext,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const base = {
    action: action.type,
    at: new Date().toISOString(),
    conversationId: context.conversationId ?? null,
    waId: context.waId ?? null,
    config,
  };

  switch (action.type) {
    case 'create_task':
      return {
        ...base,
        task: {
          title: action.label || 'Tarea automática',
          priority: action.priority || 'Media',
        },
      };
    case 'raise_priority':
      return {
        ...base,
        priority: action.priority || 'Alta',
      };
    case 'create_notification':
      return {
        ...base,
        notification: {
          message: action.label || 'Notificación automática',
        },
      };
    case 'add_tag':
      return {
        ...base,
        tag: action.tag || action.label || 'auto',
      };
    case 'mark_followup':
      return {
        ...base,
        followup: true,
        note: action.label || 'Seguimiento automático',
      };
    case 'record_event':
      return {
        ...base,
        eventName: action.eventName || 'automation.executed',
        metadata: action.metadata ?? {},
      };
    default:
      return base;
  }
}
