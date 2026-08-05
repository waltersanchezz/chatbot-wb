import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  COPILOT_SUGGESTIONS,
  applyCopilot,
  deleteCopilotHistory,
  fetchCopilotHistory,
  generateCopilot,
  type CopilotGeneratedResponse,
  type CopilotSessionDto,
} from '../api/copilotApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

export function CopilotPage() {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [active, setActive] = useState<CopilotSessionDto | null>(null)
  const [editJson, setEditJson] = useState('')
  const [flash, setFlash] = useState<string | null>(null)
  const [saveAsTemplate, setSaveAsTemplate] = useState(false)

  const historyQuery = useQuery({
    queryKey: ['api', 'copilot', 'history'],
    queryFn: () => fetchCopilotHistory(30),
  })

  useEffect(() => {
    if (active) {
      setEditJson(JSON.stringify(active.response, null, 2))
    }
  }, [active])

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['api', 'copilot'] })
  }

  const flashMsg = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2800)
  }

  const generateMutation = useMutation({
    mutationFn: generateCopilot,
    onSuccess: (session) => {
      setActive(session)
      invalidate()
      flashMsg(`Generado · ${session.response.industry}`)
    },
  })

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!active) throw new Error('Sin sesión activa')
      let response: CopilotGeneratedResponse | undefined
      try {
        response = JSON.parse(editJson) as CopilotGeneratedResponse
      } catch {
        throw new Error('JSON de vista previa inválido')
      }
      return applyCopilot({
        sessionId: active.id,
        response,
        saveAsTemplate,
        templateType: 'full',
      })
    },
    onSuccess: (result) => {
      setActive(result.session)
      setSaveAsTemplate(false)
      invalidate()
      flashMsg(
        `Aplicado · KB ${result.applied.knowledge} · Auto ${result.applied.automations} · WF ${result.applied.workflows}${
          result.template ? ' · plantilla guardada' : ''
        }`,
      )
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCopilotHistory,
    onSuccess: (_void, id) => {
      if (active?.id === id) setActive(null)
      invalidate()
      flashMsg('Sesión eliminada')
    },
  })

  const errorMsg =
    generateMutation.error?.message ||
    applyMutation.error?.message ||
    deleteMutation.error?.message ||
    null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          AI Copilot
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Genera configuraciones completas con lenguaje natural. Solo consume
          APIs públicas existentes.
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Chat">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {COPILOT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
                  onClick={() => setPrompt(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <textarea
              className="min-h-28 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Ej: Crear un taller automotriz en Bogotá…"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              type="button"
              disabled={!prompt.trim() || generateMutation.isPending}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => generateMutation.mutate(prompt.trim())}
            >
              {generateMutation.isPending ? 'Generando…' : 'Generar'}
            </button>
          </div>
        </Card>

        <Card title="Vista previa / editar">
          {!active ? (
            <EmptyState
              title="Sin generación"
              description="Escribe un prompt y genera una configuración."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span className="rounded bg-slate-100 px-2 py-0.5">
                  {active.response.intent}
                </span>
                <span>{active.response.industry}</span>
                <span className="rounded bg-slate-100 px-2 py-0.5">
                  {active.status}
                </span>
              </div>
              <p className="text-sm text-slate-700">{active.response.summary}</p>
              <textarea
                className="min-h-56 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                value={editJson}
                onChange={(e) => setEditJson(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                />
                Guardar como plantilla al aplicar
              </label>
              <button
                type="button"
                disabled={applyMutation.isPending}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => applyMutation.mutate()}
              >
                {applyMutation.isPending ? 'Aplicando…' : 'Aplicar cambios'}
              </button>
            </div>
          )}
        </Card>
      </div>

      <Card title="Historial">
        {historyQuery.isLoading ? (
          <Loading />
        ) : (historyQuery.data?.sessions.length ?? 0) === 0 ? (
          <EmptyState
            title="Sin historial"
            description="Las generaciones aparecerán aquí."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {(historyQuery.data?.sessions ?? []).map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setActive(s)}
                >
                  <p className="truncate text-sm font-medium text-slate-900">
                    {s.prompt}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.response.industry} · {s.status} ·{' '}
                    {new Date(s.createdAt).toLocaleString()}
                  </p>
                </button>
                <button
                  type="button"
                  className="text-xs text-red-600 hover:underline"
                  onClick={() => deleteMutation.mutate(s.id)}
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )}

        {(historyQuery.data?.templates.length ?? 0) > 0 ? (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Plantillas guardadas
            </p>
            <ul className="space-y-2">
              {historyQuery.data!.templates.map((t) => (
                <li key={t.id} className="text-sm text-slate-700">
                  {t.payload.industry} · {t.type} ·{' '}
                  {new Date(t.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
