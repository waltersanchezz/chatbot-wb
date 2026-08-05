import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import type { WorkflowRepository } from '../../domain/dashboard/WorkflowRepository';
import type {
  WorkflowCreateInput,
  WorkflowDto,
  WorkflowGraph,
  WorkflowNodeType,
  WorkflowRunDto,
  WorkflowRunStatus,
  WorkflowStepDto,
  WorkflowUpdateInput,
} from '../../domain/dashboard/workflowDto';
import {
  isWorkflowNodeType,
  isWorkflowTrigger,
} from '../../domain/dashboard/workflowDto';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * workflows + workflow_steps + workflow_runs en SQLite (por tenant).
 */
export class SQLiteWorkflowRepository implements WorkflowRepository {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly fixedTenantId?: string;
  private readonly idFactory: () => string;

  constructor(
    databasePath: string = ':memory:',
    options: {
      now?: () => number;
      idFactory?: () => string;
    } & TenantScopedOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.fixedTenantId = options.tenantId;
    this.idFactory = options.idFactory ?? (() => randomUUID());
    this.db = new DatabaseSync(databasePath);
    if (databasePath !== ':memory:') {
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
      } catch {
        /* ignore */
      }
    }
    this.ensureSchema();
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  list(): WorkflowDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM workflows
        WHERE tenant_id = ?
        ORDER BY updated_at DESC, name ASC
      `,
      )
      .all(this.tenant()) as unknown as WorkflowRow[];
    return rows.map((row) => this.hydrate(row));
  }

  getById(id: string): WorkflowDto | null {
    const row = this.db
      .prepare(`SELECT * FROM workflows WHERE tenant_id = ? AND id = ?`)
      .get(this.tenant(), id) as unknown as WorkflowRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  create(input: WorkflowCreateInput): WorkflowDto {
    const now = this.now();
    const tenantId = this.tenant();
    const id = this.idFactory();
    const graph = normalizeGraph(input.graph);
    const dto: WorkflowDto = {
      id,
      tenantId,
      name: String(input.name ?? '').trim() || 'Sin nombre',
      description: String(input.description ?? '').trim(),
      enabled: input.enabled !== false,
      trigger: normalizeTrigger(input.trigger),
      graph,
      steps: [],
      createdAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };

    this.db
      .prepare(
        `
        INSERT INTO workflows (
          id, tenant_id, name, description, enabled, trigger,
          graph_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        dto.id,
        dto.tenantId,
        dto.name,
        dto.description,
        dto.enabled ? 1 : 0,
        dto.trigger,
        JSON.stringify(dto.graph),
        now,
        now,
      );

    this.replaceSteps(id, input.steps ?? defaultStepsForTrigger(dto.trigger));
    if (!input.graph?.edges?.length && !(input.steps?.length)) {
      // grafo por defecto: Trigger → End
      this.db
        .prepare(
          `
          UPDATE workflows SET graph_json = ?
          WHERE tenant_id = ? AND id = ?
        `,
        )
        .run(
          JSON.stringify({
            edges: [
              {
                id: 'e1',
                source: 'trigger-1',
                target: 'end-1',
                label: null,
              },
            ],
          }),
          this.tenant(),
          id,
        );
    }
    return this.getById(id)!;
  }

  update(id: string, input: WorkflowUpdateInput): WorkflowDto | null {
    const current = this.getById(id);
    if (!current) return null;
    const now = this.now();
    const next: WorkflowDto = {
      ...current,
      name:
        input.name !== undefined
          ? String(input.name).trim() || current.name
          : current.name,
      description:
        input.description !== undefined
          ? String(input.description).trim()
          : current.description,
      enabled:
        input.enabled !== undefined ? Boolean(input.enabled) : current.enabled,
      trigger:
        input.trigger !== undefined
          ? normalizeTrigger(input.trigger)
          : current.trigger,
      graph:
        input.graph !== undefined ? normalizeGraph(input.graph) : current.graph,
      updatedAt: new Date(now).toISOString(),
    };

    this.db
      .prepare(
        `
        UPDATE workflows SET
          name = ?, description = ?, enabled = ?, trigger = ?,
          graph_json = ?, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `,
      )
      .run(
        next.name,
        next.description,
        next.enabled ? 1 : 0,
        next.trigger,
        JSON.stringify(next.graph),
        now,
        this.tenant(),
        id,
      );

    if (input.steps !== undefined) {
      this.replaceSteps(id, input.steps);
    }
    return this.getById(id);
  }

  delete(id: string): boolean {
    const tenantId = this.tenant();
    this.db
      .prepare(`DELETE FROM workflow_steps WHERE tenant_id = ? AND workflow_id = ?`)
      .run(tenantId, id);
    this.db
      .prepare(`DELETE FROM workflow_runs WHERE tenant_id = ? AND workflow_id = ?`)
      .run(tenantId, id);
    const result = this.db
      .prepare(`DELETE FROM workflows WHERE tenant_id = ? AND id = ?`)
      .run(tenantId, id);
    return Number(result.changes) > 0;
  }

  duplicate(id: string): WorkflowDto | null {
    const current = this.getById(id);
    if (!current) return null;
    return this.create({
      name: `${current.name} (copia)`,
      description: current.description,
      enabled: current.enabled,
      trigger: current.trigger,
      graph: current.graph,
      steps: current.steps.map((s) => ({
        nodeId: s.nodeId,
        type: s.type,
        config: { ...s.config },
        positionX: s.positionX,
        positionY: s.positionY,
      })),
    });
  }

  listEnabledByTrigger(trigger: string): WorkflowDto[] {
    const rows = this.db
      .prepare(
        `
        SELECT * FROM workflows
        WHERE tenant_id = ? AND enabled = 1 AND trigger = ?
        ORDER BY updated_at DESC
      `,
      )
      .all(this.tenant(), trigger) as unknown as WorkflowRow[];
    return rows.map((row) => this.hydrate(row));
  }

  startRun(workflowId: string): WorkflowRunDto {
    const now = this.now();
    const dto: WorkflowRunDto = {
      id: this.idFactory(),
      workflowId,
      tenantId: this.tenant(),
      status: 'running',
      startedAt: new Date(now).toISOString(),
      finishedAt: null,
      durationMs: null,
    };
    this.db
      .prepare(
        `
        INSERT INTO workflow_runs (
          id, workflow_id, tenant_id, status, started_at, finished_at, duration_ms
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL)
      `,
      )
      .run(dto.id, dto.workflowId, dto.tenantId, dto.status, now);
    return dto;
  }

  finishRun(
    runId: string,
    status: WorkflowRunStatus,
  ): WorkflowRunDto | null {
    const tenantId = this.tenant();
    const row = this.db
      .prepare(
        `SELECT * FROM workflow_runs WHERE tenant_id = ? AND id = ?`,
      )
      .get(tenantId, runId) as unknown as RunRow | undefined;
    if (!row) return null;
    const finishedAt = this.now();
    const durationMs = Math.max(0, finishedAt - Number(row.started_at));
    this.db
      .prepare(
        `
        UPDATE workflow_runs SET
          status = ?, finished_at = ?, duration_ms = ?
        WHERE tenant_id = ? AND id = ?
      `,
      )
      .run(status, finishedAt, durationMs, tenantId, runId);
    return {
      id: row.id,
      workflowId: row.workflow_id,
      tenantId: row.tenant_id,
      status,
      startedAt: new Date(row.started_at).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs,
    };
  }

  listRuns(
    options: { workflowId?: string; limit?: number } = {},
  ): WorkflowRunDto[] {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    const tenantId = this.tenant();
    const rows = options.workflowId
      ? (this.db
          .prepare(
            `
            SELECT * FROM workflow_runs
            WHERE tenant_id = ? AND workflow_id = ?
            ORDER BY started_at DESC
            LIMIT ?
          `,
          )
          .all(tenantId, options.workflowId, limit) as unknown as RunRow[])
      : (this.db
          .prepare(
            `
            SELECT * FROM workflow_runs
            WHERE tenant_id = ?
            ORDER BY started_at DESC
            LIMIT ?
          `,
          )
          .all(tenantId, limit) as unknown as RunRow[]);
    return rows.map(rowToRun);
  }

  close(): void {
    this.db.close();
  }

  private hydrate(row: WorkflowRow): WorkflowDto {
    const steps = this.db
      .prepare(
        `
        SELECT * FROM workflow_steps
        WHERE tenant_id = ? AND workflow_id = ?
        ORDER BY position_y ASC, position_x ASC
      `,
      )
      .all(row.tenant_id, row.id) as unknown as StepRow[];

    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description ?? '',
      enabled: Number(row.enabled) === 1,
      trigger: normalizeTrigger(row.trigger),
      graph: parseGraph(row.graph_json),
      steps: steps.map(rowToStep),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private replaceSteps(
    workflowId: string,
    steps: Array<{
      nodeId: string;
      type: string;
      config?: Record<string, unknown>;
      positionX?: number;
      positionY?: number;
    }>,
  ): void {
    const tenantId = this.tenant();
    this.db
      .prepare(
        `DELETE FROM workflow_steps WHERE tenant_id = ? AND workflow_id = ?`,
      )
      .run(tenantId, workflowId);

    const insert = this.db.prepare(
      `
      INSERT INTO workflow_steps (
        id, workflow_id, tenant_id, node_id, type, config_json, position_x, position_y
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );

    for (const step of steps) {
      const type = isWorkflowNodeType(String(step.type))
        ? (step.type as WorkflowNodeType)
        : 'End';
      insert.run(
        this.idFactory(),
        workflowId,
        tenantId,
        String(step.nodeId || this.idFactory()),
        type,
        JSON.stringify(step.config ?? {}),
        Number(step.positionX) || 0,
        Number(step.positionY) || 0,
      );
    }
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        trigger TEXT NOT NULL,
        graph_json TEXT NOT NULL DEFAULT '{"edges":[]}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_workflows_tenant
        ON workflows(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_trigger
        ON workflows(tenant_id, trigger, enabled);

      CREATE TABLE IF NOT EXISTS workflow_steps (
        id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        type TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        position_x REAL NOT NULL DEFAULT 0,
        position_y REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_wf
        ON workflow_steps(tenant_id, workflow_id);

      CREATE TABLE IF NOT EXISTS workflow_runs (
        id TEXT NOT NULL,
        workflow_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        finished_at INTEGER,
        duration_ms INTEGER,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_wf
        ON workflow_runs(tenant_id, workflow_id, started_at DESC);
    `);
  }
}

interface WorkflowRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  enabled: number;
  trigger: string;
  graph_json: string;
  created_at: number;
  updated_at: number;
}

interface StepRow {
  id: string;
  workflow_id: string;
  tenant_id: string;
  node_id: string;
  type: string;
  config_json: string;
  position_x: number;
  position_y: number;
}

interface RunRow {
  id: string;
  workflow_id: string;
  tenant_id: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  duration_ms: number | null;
}

function rowToStep(row: StepRow): WorkflowStepDto {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    nodeId: row.node_id,
    type: isWorkflowNodeType(row.type) ? row.type : 'End',
    config: parseJson(row.config_json, {}),
    positionX: Number(row.position_x) || 0,
    positionY: Number(row.position_y) || 0,
  };
}

function rowToRun(row: RunRow): WorkflowRunDto {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    tenantId: row.tenant_id,
    status: normalizeRunStatus(row.status),
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt:
      row.finished_at == null ? null : new Date(row.finished_at).toISOString(),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
  };
}

function normalizeTrigger(value: string): WorkflowDto['trigger'] {
  const t = String(value ?? '').trim();
  if (isWorkflowTrigger(t)) return t;
  return 'conversation.updated';
}

function normalizeGraph(graph: WorkflowGraph | undefined): WorkflowGraph {
  const edges = Array.isArray(graph?.edges) ? graph!.edges : [];
  return {
    edges: edges
      .filter((e) => e && e.source && e.target)
      .map((e, i) => ({
        id: String(e.id || `e${i + 1}`),
        source: String(e.source),
        target: String(e.target),
        label: e.label ?? null,
      })),
  };
}

function parseGraph(raw: string): WorkflowGraph {
  try {
    return normalizeGraph(JSON.parse(raw) as WorkflowGraph);
  } catch {
    return { edges: [] };
  }
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeRunStatus(value: string): WorkflowRunStatus {
  if (
    value === 'pending' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'skipped'
  ) {
    return value;
  }
  return 'failed';
}

function defaultStepsForTrigger(trigger: string) {
  return [
    {
      nodeId: 'trigger-1',
      type: 'Trigger',
      config: { event: trigger },
      positionX: 80,
      positionY: 120,
    },
    {
      nodeId: 'end-1',
      type: 'End',
      config: {},
      positionX: 360,
      positionY: 120,
    },
  ];
}
