import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_CONDITION_FIELDS,
  AUTOMATION_TRIGGERS,
  createAutomation,
  deleteAutomation,
  duplicateAutomation,
  fetchAutomationLogs,
  fetchAutomations,
  testAutomation,
  updateAutomation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationCreateInput,
  type AutomationRuleDto,
} from '../api/automationsApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

type FormState = {
  id?: string
  name: string
  enabled: boolean
  priority: number
  trigger: string
  conditionField: string
  conditionOp: string
  conditionValue: string
  actionType: string
  actionLabel: string
  actionPriority: string
  actionTag: string
  actionEventName: string
}

const emptyForm = (): FormState => ({
  name: '',
  enabled: true,
  priority: 0,
  trigger: 'conversation.updated',
  conditionField: '',
  conditionOp: '>',
  conditionValue: '',
  actionType: 'create_notification',
  actionLabel: '',
  actionPriority: 'Media',
  actionTag: '',
  actionEventName: '',
})

function toForm(rule: AutomationRuleDto): FormState {
  return {
    id: rule.id,
    name: rule.name,
    enabled: rule.enabled,
    priority: rule.priority,
    trigger: rule.trigger,
    conditionField: rule.condition?.field ?? '',
    conditionOp: rule.condition?.op ?? '>',
    conditionValue:
      rule.condition?.value === undefined || rule.condition?.value === null
        ? ''
        : String(rule.condition.value),
    actionType: rule.action.type,
    actionLabel: rule.action.label ?? '',
    actionPriority: rule.action.priority ?? 'Media',
    actionTag: rule.action.tag ?? '',
    actionEventName: rule.action.eventName ?? '',
  }
}

function toPayload(form: FormState): AutomationCreateInput {
  let condition: AutomationCondition | null = null
  if (form.conditionField) {
    const numericFields = ['leadScore', 'idleMinutes', 'idleHours']
    const boolFields = ['accepted', 'abandoned']
    let value: string | number | boolean = form.conditionValue
    if (numericFields.includes(form.conditionField)) {
      value = Number(form.conditionValue)
    } else if (boolFields.includes(form.conditionField)) {
      value = ['1', 'true', 'si', 'sí', 'yes'].includes(
        form.conditionValue.trim().toLowerCase(),
      )
    }
    condition = {
      field: form.conditionField as AutomationCondition['field'],
      op: form.conditionOp as AutomationCondition['op'],
      value,
    }
  }

  const action: AutomationAction = {
    type: form.actionType as AutomationAction['type'],
    label: form.actionLabel || undefined,
    priority: (form.actionPriority as AutomationAction['priority']) || undefined,
    tag: form.actionTag || undefined,
    eventName: form.actionEventName || undefined,
  }

  return {
    name: form.name.trim(),
    enabled: form.enabled,
    priority: Number(form.priority) || 0,
    trigger: form.trigger,
    condition,
    action,
    config: {},
  }
}

export function AutomationsPage() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState | null>(null)
  const [showLogs, setShowLogs] = useState(false)
  const [logRuleId, setLogRuleId] = useState<string | undefined>()
  const [flash, setFlash] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['api', 'automations'],
    queryFn: fetchAutomations,
  })

  const logsQuery = useQuery({
    queryKey: ['api', 'automations', 'logs', logRuleId],
    queryFn: () => fetchAutomationLogs({ ruleId: logRuleId, limit: 50 }),
    enabled: showLogs,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['api', 'automations'] })
  }

  const flashMsg = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2200)
  }

  const saveMutation = useMutation({
    mutationFn: async (state: FormState) => {
      const payload = toPayload(state)
      if (state.id) return updateAutomation(state.id, payload)
      return createAutomation(payload)
    },
    onSuccess: () => {
      setForm(null)
      invalidate()
      flashMsg('Guardado')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAutomation,
    onSuccess: () => {
      invalidate()
      flashMsg('Eliminado')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateAutomation,
    onSuccess: () => {
      invalidate()
      flashMsg('Duplicado')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateAutomation(id, { enabled }),
    onSuccess: () => invalidate(),
  })

  const testMutation = useMutation({
    mutationFn: testAutomation,
    onSuccess: (result) => {
      setTestResult(
        `Evaluadas ${result.evaluated} · Coincidencias ${result.matched}`,
      )
      void queryClient.invalidateQueries({
        queryKey: ['api', 'automations', 'logs'],
      })
      flashMsg('Prueba ejecutada')
    },
  })

  if (listQuery.isLoading) {
    return <Loading label="Cargando automatizaciones…" />
  }

  if (listQuery.isError || !listQuery.data) {
    return (
      <EmptyState
        title="No se pudieron cargar las automatizaciones"
        description="Verifica que el backend esté en marcha y la sesión activa."
      />
    )
  }

  const { rules, total, enabledCount } = listQuery.data

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Automatizaciones
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Reglas por tenant sobre eventos del sistema (sin WhatsApp).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-surface-muted px-3 py-1.5 text-ink">
            {total} reglas · {enabledCount} activas
          </span>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-2 hover:bg-surface-muted"
            onClick={() => {
              setShowLogs(true)
              setLogRuleId(undefined)
            }}
          >
            Ver historial
          </button>
          <button
            type="button"
            className="rounded-lg bg-brand px-3 py-2 font-medium text-white hover:bg-brand/90"
            onClick={() => setForm(emptyForm())}
          >
            Crear regla
          </button>
        </div>
      </header>

      {flash ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>
      ) : null}
      {testResult ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink">
          {testResult}
        </p>
      ) : null}

      {form ? (
        <Card>
          <h2 className="text-lg font-semibold text-ink">
            {form.id ? 'Editar regla' : 'Nueva regla'}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-ink-muted">Nombre</span>
              <input
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Trigger</span>
              <select
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.trigger}
                onChange={(e) => setForm({ ...form, trigger: e.target.value })}
              >
                {AUTOMATION_TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Prioridad</span>
              <input
                type="number"
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Condición (campo)</span>
              <select
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.conditionField}
                onChange={(e) =>
                  setForm({ ...form, conditionField: e.target.value })
                }
              >
                <option value="">Sin condición</option>
                {AUTOMATION_CONDITION_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Operador / valor</span>
              <div className="flex gap-2">
                <select
                  className="rounded-lg border border-line px-2 py-2"
                  value={form.conditionOp}
                  onChange={(e) =>
                    setForm({ ...form, conditionOp: e.target.value })
                  }
                >
                  {['>', '>=', '=', '!=', 'contains'].map((op) => (
                    <option key={op} value={op}>
                      {op}
                    </option>
                  ))}
                </select>
                <input
                  className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2"
                  value={form.conditionValue}
                  onChange={(e) =>
                    setForm({ ...form, conditionValue: e.target.value })
                  }
                  placeholder="valor"
                />
              </div>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Acción</span>
              <select
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.actionType}
                onChange={(e) =>
                  setForm({ ...form, actionType: e.target.value })
                }
              >
                {AUTOMATION_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Label / nota</span>
              <input
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.actionLabel}
                onChange={(e) =>
                  setForm({ ...form, actionLabel: e.target.value })
                }
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Prioridad acción</span>
              <select
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.actionPriority}
                onChange={(e) =>
                  setForm({ ...form, actionPriority: e.target.value })
                }
              >
                {['Alta', 'Media', 'Baja'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Tag / evento</span>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2"
                  placeholder="tag"
                  value={form.actionTag}
                  onChange={(e) =>
                    setForm({ ...form, actionTag: e.target.value })
                  }
                />
                <input
                  className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2"
                  placeholder="eventName"
                  value={form.actionEventName}
                  onChange={(e) =>
                    setForm({ ...form, actionEventName: e.target.value })
                  }
                />
              </div>
            </label>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Activa
            </label>
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
              onClick={() => saveMutation.mutate(form)}
            >
              Guardar
            </button>
            <button
              type="button"
              className="rounded-lg border border-line px-3 py-2 text-sm"
              onClick={() => setForm(null)}
            >
              Cancelar
            </button>
          </div>
        </Card>
      ) : null}

      <Card>
        {rules.length === 0 ? (
          <EmptyState
            title="Sin reglas"
            description="Crea una automatización para reaccionar a eventos del dashboard."
          />
        ) : (
          <ul className="divide-y divide-line">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{rule.name}</p>
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {rule.trigger}
                    </span>
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {rule.action.type}
                    </span>
                    {!rule.enabled ? (
                      <span className="rounded bg-warn/10 px-2 py-0.5 text-xs text-warn">
                        Inactiva
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">
                    Condición:{' '}
                    {rule.condition
                      ? `${rule.condition.field} ${rule.condition.op ?? '='} ${String(rule.condition.value)}`
                      : 'ninguna'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() => setForm(toForm(rule))}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: rule.id,
                        enabled: !rule.enabled,
                      })
                    }
                  >
                    {rule.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() =>
                      testMutation.mutate({
                        trigger: rule.trigger,
                        ruleId: rule.id,
                        dryRun: true,
                        context: {
                          leadScore: 80,
                          idleMinutes: 45,
                          salesFlowState: 'WAITING_CONFIRMATION',
                          brand: 'RENAULT',
                          accepted: false,
                          abandoned: true,
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
                      setShowLogs(true)
                      setLogRuleId(rule.id)
                    }}
                  >
                    Historial
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() => duplicateMutation.mutate(rule.id)}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-danger/40 px-2 py-1 text-danger hover:bg-danger/5"
                    onClick={() => {
                      if (window.confirm('¿Eliminar esta regla?')) {
                        deleteMutation.mutate(rule.id)
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

      {showLogs ? (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Historial</h2>
            <button
              type="button"
              className="text-sm text-ink-muted hover:text-ink"
              onClick={() => setShowLogs(false)}
            >
              Cerrar
            </button>
          </div>
          {logsQuery.isLoading ? (
            <p className="mt-3 text-sm text-ink-muted">Cargando…</p>
          ) : logsQuery.data && logsQuery.data.length > 0 ? (
            <ul className="mt-3 divide-y divide-line text-sm">
              {logsQuery.data.map((log) => (
                <li key={log.id} className="py-3">
                  <p className="font-medium text-ink">
                    {log.trigger} · {log.executedAt}
                  </p>
                  <p className="mt-1 text-ink-muted">
                    {log.detail?.message || log.result}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">Sin ejecuciones aún.</p>
          )}
        </Card>
      ) : null}
    </div>
  )
}
