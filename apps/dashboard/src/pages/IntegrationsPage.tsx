import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  CONNECTOR_CATEGORIES,
  CONNECTOR_PROVIDERS,
  connectConnector,
  createConnector,
  deleteConnector,
  disconnectConnector,
  fetchConnectorLogs,
  fetchConnectors,
  testConnector,
  updateConnector,
  type ConnectorDto,
  type ConnectorHealthStatus,
} from '../api/integrationsApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

const STATUS_STYLE: Record<ConnectorHealthStatus, string> = {
  ONLINE: 'bg-emerald-100 text-emerald-800',
  OFFLINE: 'bg-slate-100 text-slate-700',
  ERROR: 'bg-red-100 text-red-800',
  PENDING: 'bg-amber-100 text-amber-800',
}

export function IntegrationsPage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [provider, setProvider] = useState('')
  const [status, setStatus] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newProvider, setNewProvider] = useState<string>('webhook')
  const [newConfig, setNewConfig] = useState('{"webhookUrl":"https://example.com/hook"}')

  const listQuery = useQuery({
    queryKey: ['api', 'connectors', q, category, provider, status],
    queryFn: () =>
      fetchConnectors({
        q: q.trim() || undefined,
        category: category || undefined,
        provider: provider || undefined,
        status: status || undefined,
      }),
  })

  const logsQuery = useQuery({
    queryKey: ['api', 'connectors', 'logs'],
    queryFn: () => fetchConnectorLogs({ limit: 40 }),
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['api', 'connectors'] })
  }

  const flashMsg = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2500)
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      let config: Record<string, unknown> = {}
      try {
        config = JSON.parse(newConfig || '{}') as Record<string, unknown>
      } catch {
        throw new Error('config JSON inválido')
      }
      return createConnector({
        provider: newProvider,
        name: newName.trim(),
        config,
      })
    },
    onSuccess: (c) => {
      setNewName('')
      invalidate()
      flashMsg(`Creado · ${c.name}`)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { enabled?: boolean; name?: string }
    }) => updateConnector(id, patch),
    onSuccess: () => {
      invalidate()
      flashMsg('Actualizado')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteConnector,
    onSuccess: () => {
      invalidate()
      flashMsg('Eliminado')
    },
  })

  const connectMutation = useMutation({
    mutationFn: connectConnector,
    onSuccess: (r) => {
      invalidate()
      flashMsg(`Connect · ${r.health.status}`)
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: disconnectConnector,
    onSuccess: (r) => {
      invalidate()
      flashMsg(`Disconnect · ${r.health.status}`)
    },
  })

  const testMutation = useMutation({
    mutationFn: testConnector,
    onSuccess: (r) => {
      invalidate()
      flashMsg(`Test · ${r.health.status}: ${r.health.message}`)
    },
  })

  const errorMsg =
    createMutation.error?.message ||
    updateMutation.error?.message ||
    deleteMutation.error?.message ||
    connectMutation.error?.message ||
    disconnectMutation.error?.message ||
    testMutation.error?.message ||
    null

  const connectors = useMemo(
    () => listQuery.data?.connectors ?? [],
    [listQuery.data],
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Integraciones
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Integration Hub: conectores externos simulados, listos para
          reemplazar por proveedores reales.
        </p>
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

      <Card title="Filtros">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            {CONNECTOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="">Todos los proveedores</option>
            {CONNECTOR_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {(['ONLINE', 'OFFLINE', 'ERROR', 'PENDING'] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card title="Nuevo conector">
        <div className="grid gap-3 lg:grid-cols-4">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nombre"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={newProvider}
            onChange={(e) => setNewProvider(e.target.value)}
          >
            {CONNECTOR_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs lg:col-span-2"
            placeholder='config JSON, ej. {"apiKey":"..."}'
            value={newConfig}
            onChange={(e) => setNewConfig(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={!newName.trim() || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          Crear
        </button>
      </Card>

      <Card title="Conectores">
        {listQuery.isLoading ? (
          <Loading />
        ) : connectors.length === 0 ? (
          <EmptyState
            title="Sin conectores"
            description="Crea un conector para empezar."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {connectors.map((c) => (
              <ConnectorRow
                key={c.id}
                connector={c}
                onToggle={(enabled) =>
                  updateMutation.mutate({ id: c.id, patch: { enabled } })
                }
                onConnect={() => connectMutation.mutate(c.id)}
                onDisconnect={() => disconnectMutation.mutate(c.id)}
                onTest={() => testMutation.mutate(c.id)}
                onDelete={() => deleteMutation.mutate(c.id)}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Historial">
        {logsQuery.isLoading ? (
          <Loading />
        ) : (logsQuery.data?.logs.length ?? 0) === 0 ? (
          <EmptyState
            title="Sin eventos"
            description="Connect, disconnect y test generan logs aquí."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(logsQuery.data?.logs ?? []).map((log) => (
              <li key={log.id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{log.event}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      STATUS_STYLE[
                        (log.status as ConnectorHealthStatus) in STATUS_STYLE
                          ? (log.status as ConnectorHealthStatus)
                          : 'PENDING'
                      ]
                    }`}
                  >
                    {log.status}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 text-slate-600">{log.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ConnectorRow({
  connector,
  onToggle,
  onConnect,
  onDisconnect,
  onTest,
  onDelete,
}: {
  connector: ConnectorDto
  onToggle: (enabled: boolean) => void
  onConnect: () => void
  onDisconnect: () => void
  onTest: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-900">{connector.name}</p>
          <span
            className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLE[connector.status]}`}
          >
            {connector.status}
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
            {connector.provider}
          </span>
          <span className="text-xs text-slate-500">{connector.category}</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {connector.enabled ? 'Activo' : 'Inactivo'} ·{' '}
          {new Date(connector.updatedAt).toLocaleString()}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
          onClick={() => onToggle(!connector.enabled)}
        >
          {connector.enabled ? 'Desactivar' : 'Activar'}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
          onClick={onConnect}
        >
          Conectar
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
          onClick={onDisconnect}
        >
          Desconectar
        </button>
        <button
          type="button"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800"
          onClick={onTest}
        >
          Probar
        </button>
        <button
          type="button"
          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700"
          onClick={onDelete}
        >
          Eliminar
        </button>
      </div>
    </li>
  )
}
