import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  TEMPLATE_CATEGORIES,
  fetchTemplate,
  fetchTemplateInstalls,
  fetchTemplates,
  installTemplate,
  uninstallTemplate,
  type TemplateDto,
} from '../api/marketplaceApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

export function MarketplacePage() {
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ['api', 'templates', q, category],
    queryFn: () =>
      fetchTemplates({
        q: q.trim() || undefined,
        category: category || undefined,
      }),
  })

  const installsQuery = useQuery({
    queryKey: ['api', 'template-installs'],
    queryFn: fetchTemplateInstalls,
  })

  const previewQuery = useQuery({
    queryKey: ['api', 'templates', previewId],
    queryFn: () => fetchTemplate(previewId!),
    enabled: Boolean(previewId),
  })

  const installedMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const i of installsQuery.data ?? []) {
      map.set(i.templateId, i.version)
    }
    return map
  }, [installsQuery.data])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['api', 'templates'] })
    void queryClient.invalidateQueries({ queryKey: ['api', 'template-installs'] })
  }

  const flashMsg = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2500)
  }

  const installMutation = useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) =>
      installTemplate(id, force),
    onSuccess: (result) => {
      invalidate()
      flashMsg(
        result.updated
          ? 'Plantilla actualizada'
          : `Instalada · KB ${result.created.knowledge} · Auto ${result.created.automations} · WF ${result.created.workflows}`,
      )
    },
  })

  const uninstallMutation = useMutation({
    mutationFn: uninstallTemplate,
    onSuccess: () => {
      invalidate()
      flashMsg('Plantilla desinstalada')
    },
  })

  if (listQuery.isLoading || installsQuery.isLoading) {
    return <Loading label="Cargando marketplace…" />
  }

  if (listQuery.isError || !listQuery.data) {
    return (
      <EmptyState
        title="No se pudo cargar el marketplace"
        description="Verifica que el backend esté en marcha y la sesión activa."
      />
    )
  }

  const templates = listQuery.data

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Marketplace
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Instala configuraciones completas en el tenant activo.
        </p>
      </header>

      {flash ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>
      ) : null}

      <Card>
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Buscar plantillas…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-[12rem] flex-1 rounded-lg border border-line px-3 py-2 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="">Todas las categorías</option>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {templates.map((tpl) => (
          <TemplateCard
            key={tpl.id}
            template={tpl}
            installedVersion={installedMap.get(tpl.id)}
            busy={installMutation.isPending || uninstallMutation.isPending}
            onPreview={() => setPreviewId(tpl.id)}
            onInstall={() => installMutation.mutate({ id: tpl.id })}
            onUpdate={() => installMutation.mutate({ id: tpl.id, force: true })}
            onUninstall={() => {
              if (window.confirm('¿Desinstalar esta plantilla del tenant?')) {
                uninstallMutation.mutate(tpl.id)
              }
            }}
          />
        ))}
      </div>

      {templates.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Prueba otra categoría o término de búsqueda."
        />
      ) : null}

      {previewId && previewQuery.data ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                Preview · {previewQuery.data.name}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                v{previewQuery.data.version} · {previewQuery.data.author}
              </p>
            </div>
            <button
              type="button"
              className="text-sm text-ink-muted"
              onClick={() => setPreviewId(null)}
            >
              Cerrar
            </button>
          </div>
          <p className="mt-3 text-sm text-ink">{previewQuery.data.description}</p>
          <ContentSummary summary={previewQuery.data.summary} />
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-surface-muted p-3 text-xs text-ink">
            {JSON.stringify(previewQuery.data.payload, null, 2)}
          </pre>
        </Card>
      ) : null}

      {(installMutation.isError || uninstallMutation.isError) && (
        <p className="text-sm text-danger">
          {(
            (installMutation.error || uninstallMutation.error) as Error
          ).message}
        </p>
      )}
    </div>
  )
}

function TemplateCard({
  template,
  installedVersion,
  busy,
  onPreview,
  onInstall,
  onUpdate,
  onUninstall,
}: {
  template: TemplateDto
  installedVersion?: string
  busy: boolean
  onPreview: () => void
  onInstall: () => void
  onUpdate: () => void
  onUninstall: () => void
}) {
  const installed = Boolean(installedVersion)
  const outdated =
    installed && installedVersion !== template.version

  return (
    <article className="flex flex-col rounded-xl border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {template.category}
          </p>
          <h3 className="mt-1 font-semibold text-ink">{template.name}</h3>
        </div>
        <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
          v{template.version}
        </span>
      </div>
      <p className="mt-2 flex-1 text-sm text-ink-muted">{template.description}</p>
      <ContentSummary summary={template.summary} compact />
      {installed ? (
        <p className="mt-2 text-xs text-ok">
          Instalada{outdated ? ` (v${installedVersion} → actualizar)` : ''}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
          onClick={onPreview}
        >
          Preview
        </button>
        {!installed ? (
          <button
            type="button"
            disabled={busy}
            className="rounded bg-brand px-2 py-1 font-medium text-white disabled:opacity-50"
            onClick={onInstall}
          >
            Instalar
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-line px-2 py-1 hover:bg-surface-muted disabled:opacity-50"
              onClick={onUpdate}
            >
              Actualizar
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded border border-danger/40 px-2 py-1 text-danger disabled:opacity-50"
              onClick={onUninstall}
            >
              Desinstalar
            </button>
          </>
        )}
      </div>
    </article>
  )
}

function ContentSummary({
  summary,
  compact,
}: {
  summary: TemplateDto['summary']
  compact?: boolean
}) {
  const bits = [
    summary.knowledge ? `KB ${summary.knowledge}` : null,
    summary.automations ? `Auto ${summary.automations}` : null,
    summary.workflows ? `WF ${summary.workflows}` : null,
    summary.company ? 'Company' : null,
    summary.pipeline ? 'Pipeline' : null,
    summary.tasks ? `Tasks ${summary.tasks}` : null,
    summary.widgets ? `Widgets ${summary.widgets}` : null,
  ].filter(Boolean)

  return (
    <p
      className={
        compact
          ? 'mt-3 text-xs text-ink-muted'
          : 'mt-3 text-sm text-ink-muted'
      }
    >
      {bits.length ? bits.join(' · ') : 'Sin contenido'}
    </p>
  )
}
