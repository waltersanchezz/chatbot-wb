import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import {
  KNOWLEDGE_CATEGORIES,
  createKnowledge,
  deleteKnowledge,
  duplicateKnowledge,
  exportKnowledgeCsv,
  fetchKnowledge,
  importKnowledgeCsv,
  updateKnowledge,
  type KnowledgeCategory,
  type KnowledgeCreateInput,
  type KnowledgeItemDto,
} from '../api/knowledgeApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

type FormState = {
  id?: string
  category: KnowledgeCategory
  title: string
  question: string
  answer: string
  tags: string
  priority: number
  enabled: boolean
}

const emptyForm = (): FormState => ({
  category: 'FAQ',
  title: '',
  question: '',
  answer: '',
  tags: '',
  priority: 0,
  enabled: true,
})

function toForm(item: KnowledgeItemDto): FormState {
  return {
    id: item.id,
    category: item.category,
    title: item.title,
    question: item.question,
    answer: item.answer,
    tags: item.tags.join(', '),
    priority: item.priority,
    enabled: item.enabled,
  }
}

function toCreate(form: FormState): KnowledgeCreateInput {
  return {
    category: form.category,
    title: form.title.trim() || form.question.trim(),
    question: form.question.trim() || form.title.trim(),
    answer: form.answer.trim(),
    tags: form.tags
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean),
    priority: Number(form.priority) || 0,
    enabled: form.enabled,
  }
}

export function KnowledgePage() {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<string>('')
  const [enabledFilter, setEnabledFilter] = useState<string>('all')
  const [form, setForm] = useState<FormState | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const params = useMemo(
    () => ({
      q: q.trim() || undefined,
      category: category || undefined,
      enabled:
        enabledFilter === 'all'
          ? undefined
          : enabledFilter === 'true',
    }),
    [q, category, enabledFilter],
  )

  const query = useQuery({
    queryKey: ['api', 'knowledge', params],
    queryFn: () => fetchKnowledge(params),
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['api', 'knowledge'] })

  const showFlash = (msg: string) => {
    setFlash(msg)
    window.setTimeout(() => setFlash(null), 2200)
  }

  const saveMutation = useMutation({
    mutationFn: async (state: FormState) => {
      const payload = toCreate(state)
      if (state.id) return updateKnowledge(state.id, payload)
      return createKnowledge(payload)
    },
    onSuccess: () => {
      setForm(null)
      invalidate()
      showFlash('Guardado')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledge,
    onSuccess: () => {
      invalidate()
      showFlash('Eliminado')
    },
  })

  const duplicateMutation = useMutation({
    mutationFn: duplicateKnowledge,
    onSuccess: () => {
      invalidate()
      showFlash('Duplicado')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateKnowledge(id, { enabled }),
    onSuccess: () => invalidate(),
  })

  const importMutation = useMutation({
    mutationFn: importKnowledgeCsv,
    onSuccess: (result) => {
      invalidate()
      showFlash(`Importadas ${result.imported} filas`)
    },
  })

  if (query.isLoading) {
    return <Loading label="Cargando base de conocimiento…" />
  }

  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="No se pudo cargar el conocimiento"
        description="Verifica que el backend esté en marcha y la sesión activa."
      />
    )
  }

  const { items, total, enabledCount } = query.data

  const onExport = async () => {
    const csv = await exportKnowledgeCsv(params)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'knowledge.csv'
    a.click()
    URL.revokeObjectURL(url)
    showFlash('CSV exportado')
  }

  const onImportFile = async (file: File) => {
    const text = await file.text()
    importMutation.mutate(text)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Base de conocimiento
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Preguntas y respuestas que usa el chatbot por tenant.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-lg bg-surface-muted px-3 py-1.5 text-ink">
            {total} preguntas · {enabledCount} activas
          </span>
          <button
            type="button"
            className="rounded-lg bg-brand px-3 py-2 font-medium text-white hover:bg-brand/90"
            onClick={() => setForm(emptyForm())}
          >
            Crear nuevo
          </button>
        </div>
      </header>

      {flash ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>
      ) : null}

      <Card>
        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Buscar…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-[12rem] flex-1 rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="">Todas las categorías</option>
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={enabledFilter}
            onChange={(e) => setEnabledFilter(e.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm"
          >
            <option value="all">Todas</option>
            <option value="true">Activas</option>
            <option value="false">Inactivas</option>
          </select>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={() => void onExport()}
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={() => fileRef.current?.click()}
          >
            Importar CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onImportFile(file)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      {form ? (
        <Card>
          <h2 className="text-lg font-semibold text-ink">
            {form.id ? 'Editar ítem' : 'Nuevo ítem'}
          </h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Título</span>
              <input
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Categoría</span>
              <select
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as KnowledgeCategory,
                  })
                }
              >
                {KNOWLEDGE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-ink-muted">Pregunta</span>
              <input
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block text-ink-muted">Respuesta</span>
              <textarea
                rows={5}
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.answer}
                onChange={(e) => setForm({ ...form, answer: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-ink-muted">Tags</span>
              <input
                className="w-full rounded-lg border border-line px-3 py-2"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="cca, arranque, …"
              />
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
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm({ ...form, enabled: e.target.checked })
                }
              />
              Activo
            </label>
          </div>
          {saveMutation.isError ? (
            <p className="mt-3 text-sm text-danger">
              {(saveMutation.error as Error).message}
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
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
        {items.length === 0 ? (
          <EmptyState
            title="Sin resultados"
            description="Crea un ítem o importa un CSV con Preguntas, Respuestas, Categoría y Tags."
          />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 py-4 md:flex-row md:items-start md:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{item.title}</p>
                    <span className="rounded bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                      {item.category}
                    </span>
                    {!item.enabled ? (
                      <span className="rounded bg-warn/10 px-2 py-0.5 text-xs text-warn">
                        Inactivo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{item.question}</p>
                  <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-ink">
                    {item.answer}
                  </p>
                  {item.tags.length ? (
                    <p className="mt-2 text-xs text-ink-muted">
                      Tags: {item.tags.join(', ')}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() => setForm(toForm(item))}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() =>
                      toggleMutation.mutate({
                        id: item.id,
                        enabled: !item.enabled,
                      })
                    }
                  >
                    {item.enabled ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="rounded border border-line px-2 py-1 hover:bg-surface-muted"
                    onClick={() => duplicateMutation.mutate(item.id)}
                  >
                    Duplicar
                  </button>
                  <button
                    type="button"
                    className="rounded border border-danger/40 px-2 py-1 text-danger hover:bg-danger/5"
                    onClick={() => {
                      if (window.confirm('¿Eliminar este ítem?')) {
                        deleteMutation.mutate(item.id)
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
    </div>
  )
}
