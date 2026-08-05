import type { EventBus } from '../../domain/realtime/EventBus';
import type { RealtimeEvent } from '../../domain/realtime/realtimeEvents';
import type { WorkflowRepository } from '../../domain/dashboard/WorkflowRepository';
import type {
  WorkflowContext,
  WorkflowCreateInput,
  WorkflowDto,
  WorkflowExecutionResult,
  WorkflowRunDto,
  WorkflowStepDto,
  WorkflowStepTrace,
  WorkflowTestInput,
  WorkflowUpdateInput,
} from '../../domain/dashboard/workflowDto';
import {
  isWorkflowConditionField,
  isWorkflowTrigger,
} from '../../domain/dashboard/workflowDto';
import type { AutomationService } from './AutomationService';
import { matchesCondition } from './AutomationService';
import type { AutomationConditionField } from '../../domain/dashboard/automationDto';
import { runWithTenant } from '../../domain/tenant/TenantContext';
import { DEFAULT_TENANT_ID } from '../../domain/tenant/tenantDto';

export class WorkflowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowValidationError';
  }
}

/**
 * Workflow Builder — orquestación visual desacoplada.
 * Escucha EventBus y puede invocar AutomationService (sin modificarlo).
 */
export class WorkflowService {
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly repository: WorkflowRepository,
    private readonly automationService?: AutomationService,
  ) {}

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

  list(): WorkflowDto[] {
    return this.repository.list();
  }

  getById(id: string): WorkflowDto | null {
    return this.repository.getById(id);
  }

  create(input: WorkflowCreateInput): WorkflowDto {
    this.assertCreate(input);
    return this.repository.create(sanitizeCreate(input));
  }

  update(id: string, input: WorkflowUpdateInput): WorkflowDto | null {
    if (!id.trim()) throw new WorkflowValidationError('id es obligatorio');
    this.assertUpdate(input);
    return this.repository.update(id, sanitizeUpdate(input));
  }

  delete(id: string): boolean {
    if (!id.trim()) throw new WorkflowValidationError('id es obligatorio');
    return this.repository.delete(id);
  }

  duplicate(id: string): WorkflowDto | null {
    if (!id.trim()) throw new WorkflowValidationError('id es obligatorio');
    return this.repository.duplicate(id);
  }

  listRuns(options?: {
    workflowId?: string;
    limit?: number;
  }): WorkflowRunDto[] {
    return this.repository.listRuns(options);
  }

  test(input: WorkflowTestInput): {
    trigger: string;
    executions: WorkflowExecutionResult[];
  } {
    const trigger = String(input.trigger ?? '').trim();
    if (!isWorkflowTrigger(trigger)) {
      throw new WorkflowValidationError(`trigger inválido: ${trigger}`);
    }
    const dryRun = input.dryRun !== false;
    const context = { ...(input.context ?? {}) };
    const workflows = input.workflowId
      ? (() => {
          const wf = this.repository.getById(input.workflowId!);
          return wf ? [wf] : [];
        })()
      : this.repository.listEnabledByTrigger(trigger);

    const executions = workflows.map((wf) =>
      this.executeWorkflow(wf, context, { dryRun, trigger }),
    );
    return { trigger, executions };
  }

  onRealtimeEvent(event: RealtimeEvent): void {
    if (!isWorkflowTrigger(event.type)) return;
    const tenantId = event.payload.tenantId?.trim() || DEFAULT_TENANT_ID;
    runWithTenant(tenantId, () => {
      const context: WorkflowContext = {
        tenantId,
        conversationId: event.payload.conversationId,
        waId: event.payload.waId,
        leadScore: event.payload.leadScore,
        salesFlow: event.payload.salesFlowState,
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
      for (const wf of this.repository.listEnabledByTrigger(event.type)) {
        this.executeWorkflow(wf, context, {
          dryRun: false,
          trigger: event.type,
        });
      }
    });
  }

  executeWorkflow(
    workflow: WorkflowDto,
    context: WorkflowContext,
    options: { dryRun: boolean; trigger: string },
  ): WorkflowExecutionResult {
    const run = this.repository.startRun(workflow.id);
    const traces: WorkflowStepTrace[] = [];
    let status: 'completed' | 'failed' | 'skipped' = 'completed';

    try {
      const byNode = new Map(workflow.steps.map((s) => [s.nodeId, s]));
      const triggerNode =
        workflow.steps.find((s) => s.type === 'Trigger') ??
        workflow.steps[0];
      if (!triggerNode) {
        traces.push({
          nodeId: '-',
          type: 'End',
          ok: false,
          message: 'Workflow sin nodos',
        });
        status = 'failed';
      } else {
        let current: WorkflowStepDto | undefined = triggerNode;
        const visited = new Set<string>();
        let guard = 0;

        while (current && guard++ < 64) {
          if (visited.has(current.nodeId)) {
            traces.push({
              nodeId: current.nodeId,
              type: current.type,
              ok: false,
              message: 'Ciclo detectado',
            });
            status = 'failed';
            break;
          }
          visited.add(current.nodeId);

          const trace = this.runNode(current, context, options);
          traces.push(trace);

          if (current.type === 'End') break;
          if (!trace.ok && current.type === 'Condition') {
            // condición falsa sigue por arista false; ok=false no aborta
          } else if (!trace.ok && current.type !== 'Condition') {
            status = 'failed';
            break;
          }

          const nextId = nextNodeId(
            workflow,
            current,
            current.type === 'Condition' ? Boolean(trace.effects?.matched) : null,
          );
          current = nextId ? byNode.get(nextId) : undefined;
          if (!current && nextId) {
            traces.push({
              nodeId: nextId,
              type: 'End',
              ok: false,
              message: `Nodo destino no encontrado: ${nextId}`,
            });
            status = 'failed';
            break;
          }
        }
      }
    } catch (err) {
      status = 'failed';
      traces.push({
        nodeId: '-',
        type: 'End',
        ok: false,
        message: err instanceof Error ? err.message : 'Error de ejecución',
      });
    }

    const finished =
      this.repository.finishRun(run.id, status) ?? {
        ...run,
        status,
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      };

    return {
      workflowId: workflow.id,
      run: finished,
      steps: traces,
      dryRun: options.dryRun,
    };
  }

  private runNode(
    step: WorkflowStepDto,
    context: WorkflowContext,
    options: { dryRun: boolean; trigger: string },
  ): WorkflowStepTrace {
    const cfg = step.config ?? {};

    switch (step.type) {
      case 'Trigger':
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: `Trigger ${String(cfg.event ?? options.trigger)}`,
        };

      case 'Condition': {
        const field = String(cfg.field ?? '');
        if (!isWorkflowConditionField(field)) {
          return {
            nodeId: step.nodeId,
            type: step.type,
            ok: false,
            message: `Campo de condición inválido: ${field}`,
          };
        }
        const automationField = mapConditionField(field);
        const matched = matchesCondition(
          {
            field: automationField,
            op: cfg.op as '>' | '>=' | '=' | '!=' | 'contains' | undefined,
            value: cfg.value as string | number | boolean,
          },
          toAutomationContext(context),
        );
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: matched ? 'Condición cumplida' : 'Condición no cumplida',
          effects: { matched, field },
        };
      }

      case 'Delay': {
        const ms = Math.max(0, Number(cfg.ms) || 0);
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: options.dryRun
            ? `Delay ${ms}ms (dry-run)`
            : `Delay registrado ${ms}ms`,
          effects: { ms, skippedSleep: true },
        };
      }

      case 'Task':
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: options.dryRun
            ? `Dry-run: crear tarea`
            : `Tarea: ${String(cfg.label ?? 'Tarea workflow')}`,
          effects: {
            task: {
              title: String(cfg.label ?? 'Tarea workflow'),
              priority: String(cfg.priority ?? 'Media'),
            },
          },
        };

      case 'Pipeline':
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: options.dryRun
            ? 'Dry-run: actualizar pipeline'
            : `Pipeline → ${String(cfg.stage ?? 'updated')}`,
          effects: { stage: String(cfg.stage ?? 'updated') },
        };

      case 'Automation': {
        const ruleId = String(cfg.ruleId ?? '').trim();
        if (!ruleId) {
          return {
            nodeId: step.nodeId,
            type: step.type,
            ok: false,
            message: 'Automation sin ruleId',
          };
        }
        if (!this.automationService) {
          return {
            nodeId: step.nodeId,
            type: step.type,
            ok: false,
            message: 'AutomationService no disponible',
          };
        }
        const rule = this.automationService.getById(ruleId);
        if (!rule) {
          return {
            nodeId: step.nodeId,
            type: step.type,
            ok: false,
            message: `Regla no encontrada: ${ruleId}`,
          };
        }
        const detail = this.automationService.evaluateRule(
          rule,
          toAutomationContext(context),
          { dryRun: options.dryRun, trigger: options.trigger },
        );
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: detail.message,
          effects: {
            ruleId,
            matched: detail.matched,
            actionType: detail.actionType,
            effects: detail.effects,
          },
        };
      }

      case 'Notification':
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: String(cfg.message ?? cfg.label ?? 'Notificación'),
          effects: {
            notification: {
              message: String(cfg.message ?? cfg.label ?? 'Notificación'),
            },
          },
        };

      case 'Analytics':
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: `Analytics ${String(cfg.metric ?? 'event')}`,
          effects: {
            metric: String(cfg.metric ?? 'workflow.event'),
            value: cfg.value ?? 1,
          },
        };

      case 'End':
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: true,
          message: 'Fin del workflow',
        };

      default:
        return {
          nodeId: step.nodeId,
          type: step.type,
          ok: false,
          message: `Tipo de nodo no soportado: ${step.type}`,
        };
    }
  }

  private assertCreate(input: WorkflowCreateInput): void {
    if (!String(input.name ?? '').trim()) {
      throw new WorkflowValidationError('name es obligatorio');
    }
    if (!isWorkflowTrigger(String(input.trigger ?? '').trim())) {
      throw new WorkflowValidationError(
        `trigger inválido: ${String(input.trigger)}`,
      );
    }
  }

  private assertUpdate(input: WorkflowUpdateInput): void {
    if (input.name !== undefined && !String(input.name).trim()) {
      throw new WorkflowValidationError('name no puede estar vacío');
    }
    if (
      input.trigger !== undefined &&
      !isWorkflowTrigger(String(input.trigger).trim())
    ) {
      throw new WorkflowValidationError(
        `trigger inválido: ${String(input.trigger)}`,
      );
    }
  }
}

function sanitizeCreate(input: WorkflowCreateInput): WorkflowCreateInput {
  return {
    name: String(input.name).trim(),
    description: input.description,
    enabled: input.enabled,
    trigger: String(input.trigger).trim(),
    graph: input.graph,
    steps: input.steps,
  };
}

function sanitizeUpdate(input: WorkflowUpdateInput): WorkflowUpdateInput {
  const out: WorkflowUpdateInput = {};
  if (input.name !== undefined) out.name = String(input.name).trim();
  if (input.description !== undefined) out.description = input.description;
  if (input.enabled !== undefined) out.enabled = input.enabled;
  if (input.trigger !== undefined) out.trigger = String(input.trigger).trim();
  if (input.graph !== undefined) out.graph = input.graph;
  if (input.steps !== undefined) out.steps = input.steps;
  return out;
}

function mapConditionField(field: string): AutomationConditionField {
  if (field === 'salesFlow') return 'salesFlowState';
  return field as AutomationConditionField;
}

function toAutomationContext(context: WorkflowContext) {
  return {
    ...context,
    salesFlowState:
      context.salesFlowState ??
      (typeof context.salesFlow === 'string' ? context.salesFlow : null),
  };
}

function nextNodeId(
  workflow: WorkflowDto,
  current: WorkflowStepDto,
  conditionMatched: boolean | null,
): string | undefined {
  const edges = workflow.graph.edges.filter((e) => e.source === current.nodeId);
  if (!edges.length) return undefined;

  if (conditionMatched === null) {
    return edges[0]?.target;
  }

  const label = conditionMatched ? 'true' : 'false';
  const labeled = edges.find(
    (e) => String(e.label ?? '').toLowerCase() === label,
  );
  if (labeled) return labeled.target;
  // fallback: primera arista si no hay etiquetas
  return edges[0]?.target;
}
