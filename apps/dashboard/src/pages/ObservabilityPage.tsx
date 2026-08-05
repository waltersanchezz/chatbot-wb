import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  fetchObservabilityAudit,
  fetchObservabilityLogs,
  fetchObservabilityMetrics,
  fetchObservabilitySystem,
  runObservabilityHealthCheck,
  type ObservabilityHealthStatus,
} from '../api/observabilityApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

const STATUS_STYLE: Record<ObservabilityHealthStatus, string> = {
  ONLINE: 'bg-emerald-100 text-emerald-800',
  DEGRADED: 'bg-amber-100 text-amber-800',
  OFFLINE: 'bg-slate-100 text-slate-700',
  ERROR: 'bg-red-100 text-red-800',
}

export function ObservabilityPage() {
  const queryClient = useQueryClient()
  const [logLevel, setLogLevel] = useState('')
  const [logModule, setLogModule] = useState('')
  const [flash, setFlash] = useState<string | null>(null)

  const systemQuery = useQuery({
    queryKey: ['api', 'observability', 'system'],
    queryFn: fetchObservabilitySystem,
    refetchInterval: 15_000,
  })

  const logsQuery = useQuery({
    queryKey: ['api', 'observability', 'logs', logLevel, logModule],
    queryFn: () =>
      fetchObservabilityLogs({
        level: logLevel || undefined,
        module: logModule || undefined,
        limit: 40,
      }),
  })

  const auditQuery = useQuery({
    queryKey: ['api', 'observability', 'audit'],
    queryFn: () => fetchObservabilityAudit({ limit: 30 }),
  })

  const metricsQuery = useQuery({
    queryKey: ['api', 'observability', 'metrics'],
    queryFn: () => fetchObservabilityMetrics({ limit: 40 }),
  })

  const checkMutation = useMutation({
    mutationFn: runObservabilityHealthCheck,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['api', 'observability'] })
      setFlash(`Health check · ${result.status}`)
      window.setTimeout(() => setFlash(null), 2500)
    },
  })

  const system = systemQuery.data
  const errorMsg =
    systemQuery.error?.message ||
    logsQuery.error?.message ||
    checkMutation.error?.message ||
    null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Centro de Operaciones
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Observability desacoplada: health, logs, auditoría y métricas SaaS.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={checkMutation.isPending}
          onClick={() => checkMutation.mutate()}
        >
          {checkMutation.isPending ? 'Ejecutando…' : 'Ejecutar health check'}
        </button>
      </header>

      {flash ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </p>
      ) : null}
      {errorMsg ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </p>
      ) : null}

      {systemQuery.isLoading || !system ? (
        <Loading />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Estado general"
              value={system.status}
              badge={STATUS_STYLE[system.status]}
            />
            <Stat label="Uptime" value={system.uptimeLabel} />
            <Stat
              label="Memoria heap"
              value={`${system.memory.heapUsedMb} MB`}
            />
            <Stat
              label="CPU (proceso)"
              value={
                system.cpu.available
                  ? `${system.cpu.userMs + system.cpu.systemMs} ms`
                  : 'N/D'
              }
            />
          </div>

          <Card title="Componentes">
            {system.components.length === 0 ? (
              <EmptyState
                title="Sin health checks"
                description="Ejecuta un health check para poblar el estado."
              />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {system.components.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {c.component}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[c.status]}`}
                      >
                        {c.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {c.latencyMs} ms ·{' '}
                      {new Date(c.checkedAt).toLocaleTimeString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Consumo / métricas">
              {metricsQuery.isLoading ? (
                <Loading />
              ) : (metricsQuery.data?.metrics.length ?? 0) === 0 &&
                system.metricsSummary.length === 0 ? (
                <EmptyState
                  title="Sin métricas"
                  description="Las métricas aparecen tras el health check."
                />
              ) : (
                <ul className="space-y-2 text-sm">
                  {(system.metricsSummary.length
                    ? system.metricsSummary
                    : (metricsQuery.data?.metrics ?? []).map((m) => ({
                        metric: m.metric,
                        value: m.value,
                        unit: m.unit,
                      }))
                  ).map((m) => (
                    <li
                      key={m.metric}
                      className="flex justify-between border-b border-slate-50 py-1.5"
                    >
                      <span className="text-slate-600">{m.metric}</span>
                      <span className="font-medium text-slate-900">
                        {m.value} {m.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="Errores recientes">
              {system.recentErrors.length === 0 ? (
                <EmptyState
                  title="Sin errores"
                  description="No hay logs de nivel error."
                />
              ) : (
                <ul className="space-y-2">
                  {system.recentErrors.map((e) => (
                    <li key={e.id} className="text-sm">
                      <p className="font-medium text-red-700">{e.message}</p>
                      <p className="text-xs text-slate-500">
                        {e.module} · {e.event} ·{' '}
                        {new Date(e.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <Card title="Logs">
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
          >
            <option value="">Todos los niveles</option>
            {['debug', 'info', 'warn', 'error'].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Módulo"
            value={logModule}
            onChange={(e) => setLogModule(e.target.value)}
          />
        </div>
        {logsQuery.isLoading ? (
          <Loading />
        ) : (logsQuery.data?.logs.length ?? 0) === 0 ? (
          <EmptyState title="Sin logs" description="Aún no hay eventos." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(logsQuery.data?.logs ?? []).map((log) => (
              <li key={log.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    {log.level}
                  </span>
                  <span className="font-medium text-slate-900">
                    {log.module}
                  </span>
                  <span className="text-xs text-slate-500">{log.event}</span>
                </div>
                <p className="mt-0.5 text-slate-700">{log.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Auditoría">
        {auditQuery.isLoading ? (
          <Loading />
        ) : (auditQuery.data?.audits.length ?? 0) === 0 ? (
          <EmptyState
            title="Sin auditoría"
            description="Los health checks y acciones registran auditoría."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(auditQuery.data?.audits ?? []).map((a) => (
              <li key={a.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap gap-2">
                  <span className="font-medium text-slate-900">{a.action}</span>
                  <span className="text-slate-600">{a.resource}</span>
                  {a.userId ? (
                    <span className="text-xs text-slate-500">
                      user {a.userId}
                    </span>
                  ) : null}
                  <span className="text-xs text-slate-500">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({
  label,
  value,
  badge,
}: {
  label: string
  value: string
  badge?: string
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      {badge ? (
        <span className={`mt-2 inline-block rounded px-2 py-0.5 text-sm font-semibold ${badge}`}>
          {value}
        </span>
      ) : (
        <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      )}
    </div>
  )
}
