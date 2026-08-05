import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  WORKFLOW_NODE_TYPES,
  WORKFLOW_TRIGGERS,
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  fetchWorkflowRuns,
  fetchWorkflows,
  testWorkflow,
  updateWorkflow,
  type WorkflowDto,
  type WorkflowEdge,
  type WorkflowNodeType,
} from '../api/workflowsApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

type EditorStep = {
  nodeId: string
  type: WorkflowNodeType
  config: Record<string, unknown>
  positionX: number
  positionY: number
}

type EditorState = {
  id?: string
  name: string
  description: string
  enabled: boolean
  trigger: string
  steps: EditorStep[]
  edges: WorkflowEdge[]
  selectedNodeId: string | null
}

function emptyEditor(): EditorState {
  return {
    name: 'Nuevo workflow',
    description: '',
    enabled: true,
    trigger: 'conversation.updated',
    steps: [
      {
        nodeId: 'trigger-1',
        type: 'Trigger',
        config: { event: 'conversation.updated' },
        positionX: 40,
        positionY: 100,
      },
      {
        nodeId: 'end-1',
        type: 'End',
        config: {},
        positionX: 320,
        positionY: 100,
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'end-1', label: null },
    ],
    selectedNodeId: 'trigger-1',
  }
}

function fromDto(wf: WorkflowDto): EditorState {
  return {
    id: wf.id,
    name: wf.name,
    description: wf.description,
    enabled: wf.enabled,
    trigger: wf.trigger,
    steps: wf.steps.map((s) => ({
      nodeId: s.nodeId,
      type: s.type,
      config: { ...s.config },
      positionX: s.positionX,
      positionY: s.positionY,
    })),
    edges: wf.graph.edges.map((e) => ({ ...e })),
    selectedNodeId: wf.steps[0]?.nodeId ?? null,
  }
}

function nodeColor(type: WorkflowNodeType): string {
  switch (type) {
    case 'Trigger':
      return 'bg-brand text-white'
    case 'Condition':
      return 'bg-warn/20 text-ink border-warn/40'
    case 'End':
      return 'bg-ink text-white'
    case 'Automation':
      return 'bg-ok/15 text-ink border-ok/40'
    default:
      return 'bg-white text-ink border-line'
  }
}

export function WorkflowsPage() {
  const queryClient = useQueryClient()
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [showRuns, setShowRuns] = useState(false)
  const [runsWorkflowId, setRunsWorkflowId] = useState<string | undefined>()
  const [flash, setFlash] = useState<string | null>(null)
  const [testOut, setTestOut] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['api', 'workflows'],
    queryFn: fetchWorkflows,
  })

  const runsQuery = useQuery({
    queryKey: ['api', 'workflows', 'runs', runsWorkflowId],
    queryFn: () => fetchWorkflowRuns({ workflowId: runsWorkflowId, limit: 40 }),
    enabled: showRuns,
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['api', 'workflows'] })

  const flashMsg = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2200)
  }

  const saveMutation = useMutation({
    mutationFn: async (state: EditorState) => {
      const payload = {
        name: state.name.trim(),
        description: state.description,
        enabled: state.enabled,
        trigger: state.trigger,
        graph: { edges: state.edges },
        steps: state.steps.map((s) => ({
          nodeId: s.nodeId,
          type: s.type,
          config:
            s.type === 'Trigger'
              ? { ...s.config, event: state.trigger }
              : s.config,
          positionX: s.positionX,
          positionY: s.positionY,
        })),
      }
      if (state.id) return updateWorkflow(state.id, payload)
      return createWorkflow(payload)
    },
    onSuccess: () => {
      setEditor(null)
      invalidate()
      flashMsg('Workflow guardado')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      invalidate()
      flashMsg('Eliminado')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateWorkflow,
    onSuccess: () => {
      invalidate()
      flashMsg('Duplicado')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateWorkflow(id, { enabled }),
    onSuccess: () => invalidate(),
  })

  const testMutation = useMutation({
    mutationFn: testWorkflow,
    onSuccess: (result) => {
      const first = result.executions[0]
      setTestOut(
        first
          ? `Run ${first.run.status} · ${first.steps.length} pasos`
          : 'Sin ejecuciones',
      )
      void queryClient.invalidateQueries({
        queryKey: ['api', 'workflows', 'runs'],
      })
      flashMsg('Prueba ejecutada')
    },
  })

  const selected = useMemo(() => {
    if (!editor?.selectedNodeId) return null
    return editor.steps.find((s) => s.nodeId === editor.selectedNodeId) ?? null
  }, [editor])

  if (listQuery.isLoading) {
    return <Loading label="Cargando workflows…" />
  }

  if (listQuery.isError || !listQuery.data) {
    return (
      <EmptyState
        title="No se pudieron cargar los workflows"
        description="Verifica que el backend esté en marcha y la sesión activa."
      />
    )
  }

  const { workflows, total, enabledCount } = listQuery.data

  const addNode = (type: WorkflowNodeType) => {
    if (!editor) return
    const nodeId = `${type.toLowerCase()}-${Date.now().toString(36)}`
    const step: EditorStep = {
      nodeId,
      type,
      config:
        type === 'Condition'
          ? { field: 'leadScore', op: '>', value: 50 }
          : type === 'Delay'
            ? { ms: 1000 }
            : type === 'Task'
              ? { label: 'Nueva tarea', priority: 'Media' }
              : type === 'Notification'
                ? { message: 'Aviso workflow' }
                : type === 'Pipeline'
                  ? { stage: 'FOLLOW_UP' }
                  : type === 'Analytics'
                    ? { metric: 'workflow.hit', value: 1 }
                    : type === 'Automation'
                      ? { ruleId: '' }
                      : {},
      positionX: 80 + editor.steps.length * 24,
      positionY: 80 + (editor.steps.length % 4) * 70,
    }
    setEditor({
      ...editor,
      steps: [...editor.steps, step],
      selectedNodeId: nodeId,
    })
  }

  const updateSelectedConfig = (key: string, value: string) => {
    if (!editor || !selected) return
    const parsed: unknown =
      key === 'value' || key === 'ms'
        ? Number(value) || 0
        : value
    setEditor({
      ...editor,
      steps: editor.steps.map((s) =>
        s.nodeId === selected.nodeId
          ? { ...s, config: { ...s.config, [key]: parsed } }
          : s,
      ),
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Workflows
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Flujos visuales compuestos sobre EventBus y automatizaciones.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-surface-muted px-3 py-1.5 text-ink">
            {total} workflows · {enabledCount} activos
          </span>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-2 hover:bg-surface-muted"
            onClick={() => {
              setShowRuns(true)
              setRunsWorkflowId(undefined)
            }}
          >
            Historial
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand px-3 py-2 font-medium text-white hover:bg-brand/90"
            onClick={() => setEditor(emptyEditor())}
          >
            Crear Workflow
          </button>
        </div>
      </header>

      {flash ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>
      ) : null}
      {testOut ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
          {testOut}
        </p>
      ) : null}

      {editor ? (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="grid min-w-[16rem] flex-1 gap-2 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-ink-muted">Nombre</span>
                <input
                  className="w-full rounded-lg border border-line px-3 py-2"
                  value={editor.name}
                  onChange={(e) =>
                    setEditor({ ...editor, name: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-ink-muted">Trigger</span>
                <select
                  className="w-full rounded-lg border border-line px-3 py-2"
                  value={editor.trigger}
                  onChange={(e) =>
                    setEditor({ ...editor, trigger: e.target.value })
                  }
                >
                  {WORKFLOW_TRIGGERS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-ink-muted">Descripción</span>
                <input
                  className="w-full rounded-lg border border-line px-3 py-2"
                  value={editor.description}
                  onChange={(e) =>
                    setEditor({ ...editor, description: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editor.enabled}
                onChange={(e) =>
                  setEditor({ ...editor, enabled: e.target.checked })
                }
              />
              Activo
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {WORKFLOW_NODE_TYPES.filter((t) => t !== 'Trigger').map((t) => (
              <button
                key={t}
                type="button"
                className="rounded border border-line px-2 py-1 text-xs hover:bg-surface-muted"
                onClick={() => addNode(t)}
              >
                + {t}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_16rem]">
            <div className="relative h-[320px] overflow-auto rounded-xl border border-line bg-[radial-gradient(circle_at_1px_1px,#d6dde6_1px,transparent_0)] bg-[length:16px_16px]">
              <svg className="pointer-events-none absolute inset-0 h-full w-full">
                {editor.edges.map((edge) => {
                  const from = editor.steps.find((s) => s.nodeId === edge.source)
                  const to = editor.steps.find((s) => s.nodeId === edge.target)
                  if (!from || !to) return null
                  const x1 = from.positionX + 70
                  const y1 = from.positionY + 22
                  const x2 = to.positionX
                  const y2 = to.positionY + 22
                  return (
                    <g key={edge.id}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#64748b"
                        strokeWidth="2"
                        markerEnd="url(#arrow)"
                      />
                      {edge.label ? (
                        <text
                          x={(x1 + x2) / 2}
                          y={(y1 + y2) / 2 - 6}
                          fill="#475569"
                          fontSize="10"
                        >
                          {edge.label}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
                <defs>
                  <marker
                    id="arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" fill="#64748b" />
                  </marker>
                </defs>
              </svg>

              {editor.steps.map((step) => (
                <button
                  key={step.nodeId}
                  type="button"
                  className={[
                    'absolute w-[140px] rounded-lg border px-2 py-2 text-left text-xs shadow-sm',
                    nodeColor(step.type),
                    editor.selectedNodeId === step.nodeId
                      ? 'ring-2 ring-brand'
                      : '',
                  ].join(' ')}
                  style={{ left: step.positionX, top: step.positionY }}
                  onClick={() => {
                    if (connectFrom && connectFrom !== step.nodeId) {
                      setEditor({
                        ...editor,
                        edges: [
                          ...editor.edges,
                          {
                            id: `e-${Date.now().toString(36)}`,
                            source: connectFrom,
                            target: step.nodeId,
                            label: null,
                          },
                        ],
                        selectedNodeId: step.nodeId,
                      })
                      setConnectFrom(null)
                      return
                    }
                    setEditor({ ...editor, selectedNodeId: step.nodeId })
                  }}
                >
                  <p className="font-semibold">{step.type}</p>
                  <p className="mt-0.5 truncate opacity-80">{step.nodeId}</p>
                </button>
              ))}
            </div>

            <div className="space-y-3 rounded-xl border border-line p-3 text-sm">
              <p className="font-medium text-ink">Nodo seleccionado</p>
              {selected ? (
                <>
                  <p className="text-ink-muted">{selected.type}</p>
                  {selected.type === 'Condition' ? (
                    <>
                      <input
                        className="w-full rounded border border-line px-2 py-1"
                        placeholder="field"
                        value={String(selected.config.field ?? '')}
                        onChange={(e) =>
                          updateSelectedConfig('field', e.target.value)
                        }
                      />
                      <input
                        className="w-full rounded border border-line px-2 py-1"
                        placeholder="op"
                        value={String(selected.config.op ?? '>')}
                        onChange={(e) =>
                          updateSelectedConfig('op', e.target.value)
                        }
                      />
                      <input
                        className="w-full rounded border border-line px-2 py-1"
                        placeholder="value"
                        value={String(selected.config.value ?? '')}
                        onChange={(e) =>
                          updateSelectedConfig('value', e.target.value)
                        }
                      />
                    </>
                  ) : null}
                  {selected.type === 'Delay' ? (
                    <input
                      className="w-full rounded border border-line px-2 py-1"
                      placeholder="ms"
                      value={String(selected.config.ms ?? 0)}
                      onChange={(e) =>
                        updateSelectedConfig('ms', e.target.value)
                      }
                    />
                  ) : null}
                  {selected.type === 'Task' ||
                  selected.type === 'Notification' ? (
                    <input
                      className="w-full rounded border border-line px-2 py-1"
                      placeholder="label/message"
                      value={String(
                        selected.config.label ??
                          selected.config.message ??
                          '',
                      )}
                      onChange={(e) =>
                        updateSelectedConfig(
                          selected.type === 'Task' ? 'label' : 'message',
                          e.target.value,
                        )
                      }
                    />
                  ) : null}
                  {selected.type === 'Automation' ? (
                    <input
                      className="w-full rounded border border-line px-2 py-1"
                      placeholder="ruleId"
                      value={String(selected.config.ruleId ?? '')}
                      onChange={(e) =>
                        updateSelectedConfig('ruleId', e.target.value)
                      }
                    />
                  ) : null}
                  {selected.type === 'Pipeline' ? (
                    <input
                      className="w-full rounded border border-line px-2 py-1"
                      placeholder="stage"
                      value={String(selected.config.stage ?? '')}
                      onChange={(e) =>
                        updateSelectedConfig('stage', e.target.value)
                      }
                    />
                  ) : null}
                  {selected.type === 'Analytics' ? (
                    <input
                      className="w-full rounded border border-line px-2 py-1"
                      placeholder="metric"
                      value={String(selected.config.metric ?? '')}
                      onChange={(e) =>
                        updateSelectedConfig('metric', e.target.value)
                      }
                    />
                  ) : null}
                  <button
                    type="button"
                    className="w-full rounded border border-line px-2 py-1.5 text-xs hover:bg-surface-muted"
                    onClick={() => setConnectFrom(selected.nodeId)}
                  >
                    {connectFrom === selected.nodeId
                      ? 'Elige destino…'
                      : 'Conectar a…'}
                  </button>
                  {selected.type !== 'Trigger' ? (
                    <button
                      type="button"
                      className="w-full rounded border border-danger/40 px-2 py-1.5 text-xs text-danger"
                      onClick={() =>
                        setEditor({
                          ...editor,
                          steps: editor.steps.filter(
                            (s) => s.nodeId !== selected.nodeId,
                          ),
                          edges: editor.edges.filter(
                            (e) =>
                              e.source !== selected.nodeId &&
                              e.target !== selected.nodeId,
                          ),
                          selectedNodeId: editor.steps[0]?.nodeId ?? null,
                        })
                      }
                    >
                      Eliminar nodo
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="text-ink-muted">Selecciona un nodo</p>
              )}
            </div>
          </div>

          {saveMutation.isError ? (
            <p className="mt-3 text-sm text-danger">
              {(saveMutation.error as Error).message}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate(editor)}
            >
              Guardar
            </button>
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-2 text-sm"
              onClick={() => setEditor(null)}
            >
              Cancelar
            </button>
          </div>
        </Card>
      ) : null}

      <Card>
        {workflows.length === 0 ? (
          <EmptyState
            title="Sin workflows"
            description="Crea un flujo visual para orquestar triggers, condiciones y acciones."
          />
        ) : (
          <ul className="divide-y divide-line">
            {workflows.map((wf) => (
              <li
                key={wf.id}
                className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{wf.name}</p>
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {wf.trigger}
                    </span>
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {wf.steps.length} nodos
                    </span>
                    {!wf.enabled ? (
                      <span className="rounded bg-warn/10 px-2 py-0.5 text-xs text-warn">
                        Inactivo
                      </span>
                    ) : null}
                  </div>
                  {wf.description ? (
                    <p className="mt-1 text-sm text-ink-muted">
                      {wf.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() => setEditor(fromDto(wf))}
                  >
                    Editor visual
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: wf.id,
                        enabled: !wf.enabled,
                      })
                    }
                  >
                    {wf.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() =>
                      testMutation.mutate({
                        trigger: wf.trigger,
                        workflowId: wf.id,
                        dryRun: true,
                        context: {
                          leadScore: 80,
                          abandoned: true,
                          brand: 'RENAULT',
                        },
                      })
                    }
                  >
                    Probar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() => {
                      setShowRuns(true)
                      setRunsWorkflowId(wf.id)
                    }}
                  >
                    Ejecuciones
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() => duplicateMutation.mutate(wf.id)}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-danger/40 px-2 py-1 text-danger"
                    onClick={() => {
                      if (window.confirm('¿Eliminar este workflow?')) {
                        deleteMutation.mutate(wf.id)
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showRuns ? (
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Ejecuciones</h2>
            <button
              type="button"
              className="text-sm text-ink-muted"
              onClick={() => setShowRuns(false)}
            >
              Cerrar
            </button>
          </div>
          {runsQuery.isLoading ? (
            <p className="mt-3 text-sm text-ink-muted">Cargando…</p>
          ) : runsQuery.data && runsQuery.data.length > 0 ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {runsQuery.data.map((run) => (
                <li key={run.id} className="py-3">
                  <p className="font-medium text-ink">
                    {run.status} · {run.startedAt}
                  </p>
                  <p className="text-ink-muted">
                    workflow {run.workflowId.slice(0, 8)}…
                    {run.durationMs != null ? ` · ${run.durationMs}ms` : ''}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">Sin ejecuciones.</p>
          )}
        </Card>
      ) : null}
    </div>
  )
}
