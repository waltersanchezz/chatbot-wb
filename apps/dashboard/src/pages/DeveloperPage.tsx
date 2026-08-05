import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  API_KEY_PERMISSIONS,
  createDeveloperKey,
  deleteDeveloperKey,
  fetchDeveloperKeys,
  fetchDeveloperRequests,
  fetchDeveloperSdk,
  rotateDeveloperKey,
  updateDeveloperKey,
} from '../api/developerApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

export function DeveloperPage() {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [perms, setPerms] = useState<string[]>(['read'])
  const [flash, setFlash] = useState<string | null>(null)
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null)
  const [exampleLang, setExampleLang] = useState('curl')

  const keysQuery = useQuery({
    queryKey: ['api', 'developer', 'keys'],
    queryFn: fetchDeveloperKeys,
  })

  const requestsQuery = useQuery({
    queryKey: ['api', 'developer', 'requests'],
    queryFn: () => fetchDeveloperRequests({ limit: 40 }),
  })

  const sdkQuery = useQuery({
    queryKey: ['api', 'developer', 'sdk'],
    queryFn: fetchDeveloperSdk,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['api', 'developer'] })
  }

  const flashMsg = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2800)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createDeveloperKey({ name: name.trim(), permissions: perms }),
    onSuccess: (created) => {
      setName('')
      setRevealedSecret(created.secret)
      invalidate()
      flashMsg('API Key creada — copia el secreto ahora')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string
      patch: { enabled?: boolean; name?: string; permissions?: string[] }
    }) => updateDeveloperKey(id, patch),
    onSuccess: () => {
      invalidate()
      flashMsg('API Key actualizada')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDeveloperKey,
    onSuccess: () => {
      invalidate()
      flashMsg('API Key eliminada')
    },
  })

  const rotateMutation = useMutation({
    mutationFn: rotateDeveloperKey,
    onSuccess: (rotated) => {
      setRevealedSecret(rotated.secret)
      invalidate()
      flashMsg('API Key rotada — copia el nuevo secreto')
    },
  })

  const errorMsg =
    createMutation.error?.message ||
    updateMutation.error?.message ||
    deleteMutation.error?.message ||
    rotateMutation.error?.message ||
    null

  const example = useMemo(() => {
    const examples = sdkQuery.data?.examples ?? []
    return (
      examples.find((e) => e.language === exampleLang) ?? examples[0] ?? null
    )
  }, [sdkQuery.data, exampleLang])

  const usage = requestsQuery.data?.usage

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Developer
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          API Keys hasheadas, permisos, SDKs y documentación para integradores.
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

      {revealedSecret ? (
        <Card title="Secreto (solo una vez)">
          <p className="mb-2 text-sm text-amber-800">
            Copia y guarda este valor. No volverá a mostrarse.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-slate-900 px-3 py-2 text-xs text-white">
              {revealedSecret}
            </code>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              onClick={() => {
                void navigator.clipboard?.writeText(revealedSecret)
                flashMsg('Copiado')
              }}
            >
              Copiar
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              onClick={() => setRevealedSecret(null)}
            >
              Ocultar
            </button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Llamadas"
          value={String(usage?.totalRequests ?? 0)}
        />
        <Stat
          label="Errores"
          value={String(usage?.errorCount ?? 0)}
        />
        <Stat
          label="Latencia media"
          value={`${usage?.avgLatencyMs ?? 0} ms`}
        />
      </div>

      <Card title="Nueva API Key">
        <div className="space-y-3">
          <input
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Nombre"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {API_KEY_PERMISSIONS.map((p) => {
              const on = perms.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  className={[
                    'rounded-md px-2.5 py-1 text-xs',
                    on
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 text-slate-700',
                  ].join(' ')}
                  onClick={() =>
                    setPerms((prev) =>
                      on ? prev.filter((x) => x !== p) : [...prev, p],
                    )
                  }
                >
                  {p}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            disabled={!name.trim() || createMutation.isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => createMutation.mutate()}
          >
            Crear
          </button>
        </div>
      </Card>

      <Card title="API Keys">
        {keysQuery.isLoading ? (
          <Loading />
        ) : (keysQuery.data?.keys.length ?? 0) === 0 ? (
          <EmptyState
            title="Sin API Keys"
            description="Crea una clave para integradores."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(keysQuery.data?.keys ?? []).map((k) => (
              <li
                key={k.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{k.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">
                    {k.keyPrefix}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {k.enabled ? 'Activa' : 'Inactiva'} ·{' '}
                    {k.permissions.join(', ')}
                    {k.lastUsedAt
                      ? ` · último uso ${new Date(k.lastUsedAt).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
                    onClick={() =>
                      updateMutation.mutate({
                        id: k.id,
                        patch: { enabled: !k.enabled },
                      })
                    }
                  >
                    {k.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-2.5 py-1 text-xs"
                    onClick={() => rotateMutation.mutate(k.id)}
                  >
                    Rotar
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700"
                    onClick={() => deleteMutation.mutate(k.id)}
                  >
                    Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="SDKs disponibles">
          {sdkQuery.isLoading ? (
            <Loading />
          ) : (
            <ul className="space-y-2 text-sm">
              {(sdkQuery.data?.sdks ?? []).map((s) => (
                <li
                  key={s.language}
                  className="flex items-center justify-between border-b border-slate-50 py-2"
                >
                  <div>
                    <p className="font-medium text-slate-900">{s.name}</p>
                    <p className="font-mono text-xs text-slate-500">
                      {s.install}
                    </p>
                  </div>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">
                    {s.status} · v{s.version}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Documentación / ejemplos">
          <div className="mb-3 flex flex-wrap gap-2">
            {(sdkQuery.data?.examples ?? []).map((e) => (
              <button
                key={e.language}
                type="button"
                className={[
                  'rounded-md px-2.5 py-1 text-xs',
                  exampleLang === e.language
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200',
                ].join(' ')}
                onClick={() => setExampleLang(e.language)}
              >
                {e.language}
              </button>
            ))}
          </div>
          {example ? (
            <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
              {example.code}
            </pre>
          ) : (
            <EmptyState title="Sin ejemplos" />
          )}
          <p className="mt-3 text-xs text-slate-500">
            Auth: {sdkQuery.data?.authHeader}
          </p>
        </Card>
      </div>

      <Card title="Historial de uso">
        {requestsQuery.isLoading ? (
          <Loading />
        ) : (requestsQuery.data?.requests.length ?? 0) === 0 ? (
          <EmptyState
            title="Sin llamadas"
            description="El uso aparecerá cuando se consuma la API pública."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(requestsQuery.data?.requests ?? []).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                <span className="font-mono text-xs text-slate-700">
                  {r.method} {r.endpoint}
                </span>
                <span className="text-xs text-slate-500">
                  {r.status} · {r.latencyMs} ms ·{' '}
                  {new Date(r.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}
