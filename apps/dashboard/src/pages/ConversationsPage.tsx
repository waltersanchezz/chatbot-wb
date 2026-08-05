import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  buildWhatsAppLink,
  fetchConversationDetail,
  fetchConversations,
  type ConversationDetailDto,
  type ConversationListItemDto,
} from '../api/conversationsApi'
import { Card } from '../components/Card'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { PageSkeleton } from '../components/Skeleton'
import { QueryError } from '../components/QueryError'
import {
  InterestBadge,
  MatchBadge,
  SalesFlowBadge,
} from '../components/StatusBadge'
import {
  buildCommercialMilestones,
  customerDisplayName,
  formatDateTime,
  formatPhoneDisplay,
  formatWillardReference,
  isTechnicalPhoneId,
} from '../lib/operatorDisplay'

const columns: DataTableColumn<ConversationListItemDto>[] = [
  {
    key: 'customer',
    header: 'Cliente',
    cell: (row) => (
      <div>
        <p className="font-medium text-ink">
          {customerDisplayName(row.customerName, row.phone)}
        </p>
        <p className="text-xs text-ink-muted">
          {formatPhoneDisplay(row.phone)}
        </p>
      </div>
    ),
  },
  {
    key: 'vehicle',
    header: 'Vehículo',
    cell: (row) => (
      <div>
        <p className="text-ink">{row.vehicle ?? 'Sin vehículo'}</p>
        {row.year ? (
          <p className="text-xs text-ink-muted">{row.year}</p>
        ) : null}
      </div>
    ),
  },
  {
    key: 'reference',
    header: 'Batería Willard',
    cell: (row) => (
      <span className="text-sm font-medium text-ink">
        {formatWillardReference(row.recommendedReference)}
      </span>
    ),
  },
  {
    key: 'status',
    header: 'Estado',
    cell: (row) => <SalesFlowBadge state={row.salesFlowState} />,
  },
  {
    key: 'interest',
    header: 'Interés',
    cell: (row) => <InterestBadge score={row.leadScore} />,
  },
  {
    key: 'lastActivity',
    header: 'Última actividad',
    cell: (row) => (
      <span className="text-sm text-ink-muted">
        {formatDateTime(row.lastActivityAt)}
      </span>
    ),
  },
]

export function ConversationsPage() {
  const [searchParams] = useSearchParams()
  const initialQ = searchParams.get('q')?.trim() ?? ''
  const [search, setSearch] = useState(initialQ)
  const [debouncedQ, setDebouncedQ] = useState(initialQ)
  const [sortBy, setSortBy] = useState<'createdAt' | 'lastActivityAt'>(
    'lastActivityAt',
  )
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  const query = useQuery({
    queryKey: ['api', 'conversations', debouncedQ, sortBy, sortOrder, page],
    queryFn: () =>
      fetchConversations({
        page,
        pageSize: 20,
        q: debouncedQ || undefined,
        sortBy,
        sortOrder,
      }),
  })

  const detailQuery = useQuery({
    queryKey: ['api', 'conversation-detail', selectedId],
    queryFn: () => fetchConversationDetail(selectedId!),
    enabled: Boolean(selectedId),
  })

  if (query.isLoading) {
    return <PageSkeleton rows={6} />
  }

  if (query.isError || !query.data) {
    return (
      <QueryError
        title="No se pudieron cargar las conversaciones"
        description="Revisa tu conexión o vuelve a iniciar sesión."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const data = query.data

  return (
    <>
      <Card
        title="Bandeja de conversaciones"
        description={`${data.total} conversación${data.total === 1 ? '' : 'es'} · selecciona una para ver el detalle`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="conv-search">
              Buscar
            </label>
            <input
              id="conv-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, teléfono, vehículo…"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none ring-accent focus:ring-2 sm:w-56"
            />
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split(':') as [
                  'createdAt' | 'lastActivityAt',
                  'asc' | 'desc',
                ]
                setSortBy(by)
                setSortOrder(order)
                setPage(1)
              }}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none ring-accent focus:ring-2"
            >
              <option value="lastActivityAt:desc">Última actividad ↓</option>
              <option value="lastActivityAt:asc">Última actividad ↑</option>
              <option value="createdAt:desc">Más recientes ↓</option>
              <option value="createdAt:asc">Más antiguas ↑</option>
            </select>
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyTitle="No hay conversaciones todavía"
          emptyDescription={
            debouncedQ
              ? 'Ningún resultado para esa búsqueda.'
              : 'Cuando un cliente escriba por WhatsApp, aparecerá aquí.'
          }
        />

        {data.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-sm">
            <p className="text-ink-muted">
              Página {data.page} de {data.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {selectedId ? (
        <ConversationDetailDrawer
          open
          loading={detailQuery.isLoading}
          error={detailQuery.isError}
          detail={detailQuery.data}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  )
}

function ConversationDetailDrawer({
  open,
  loading,
  error,
  detail,
  onClose,
}: {
  open: boolean
  loading: boolean
  error: boolean
  detail: ConversationDetailDto | undefined
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const canOpenWa = detail ? !isTechnicalPhoneId(detail.waId) : false
  const waHref = detail && canOpenWa ? buildWhatsAppLink(detail.waId) : '#'
  const displayName = detail
    ? customerDisplayName(detail.customerName, detail.waId)
    : 'Conversación'
  const milestones = detail
    ? buildCommercialMilestones({
        recommendedReference: detail.recommendedReference,
        leadScore: detail.leadScore,
        salesFlowState: detail.salesFlowState,
        matchKind: detail.matchKind,
      })
    : []

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Cerrar panel"
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
      />
      <aside
        className="relative z-50 flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conv-detail-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Conversación
            </p>
            <h2
              id="conv-detail-title"
              className="mt-1 truncate text-lg font-semibold text-ink"
            >
              {displayName}
            </h2>
            {detail ? (
              <p className="mt-0.5 text-sm text-ink-muted">
                {formatPhoneDisplay(detail.waId)}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-2.5 py-1 text-sm text-ink-muted hover:bg-surface"
          >
            Cerrar
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? <Loading label="Cargando conversación…" /> : null}
          {error && !loading ? (
            <EmptyState
              title="No se pudo cargar el detalle"
              description="La conversación no está disponible en este momento."
            />
          ) : null}
          {detail && !loading ? (
            <div className="space-y-6">
              <section className="space-y-3 rounded-xl border border-line bg-surface/50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SalesFlowBadge state={detail.salesFlowState} />
                  <InterestBadge score={detail.leadScore} />
                  <MatchBadge matchKind={detail.matchKind} />
                </div>
                <DetailRow
                  label="Vehículo"
                  value={
                    detail.vehicle
                      ? `${detail.vehicle}${detail.year ? ` · ${detail.year}` : ''}`
                      : 'Sin vehículo'
                  }
                />
                <DetailRow
                  label="Batería Willard"
                  value={formatWillardReference(detail.recommendedReference)}
                />
                <DetailRow
                  label="Última actividad"
                  value={formatDateTime(detail.updatedAt)}
                />
                <DetailRow
                  label="Inicio"
                  value={formatDateTime(detail.createdAt)}
                />
              </section>

              {milestones.length > 0 ? (
                <section>
                  <h3 className="mb-3 text-sm font-semibold text-ink">
                    Hitos comerciales
                  </h3>
                  <ul className="space-y-2">
                    {milestones.map((m) => (
                      <li
                        key={m.id}
                        className={[
                          'rounded-lg border px-3 py-2.5 text-sm',
                          m.tone === 'ok' && 'border-ok/20 bg-ok/5',
                          m.tone === 'warn' && 'border-warn/20 bg-warn/5',
                          m.tone === 'danger' && 'border-danger/20 bg-danger/5',
                          m.tone === 'muted' && 'border-line bg-surface',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <p className="font-medium text-ink">{m.label}</p>
                        {m.detail ? (
                          <p className="mt-0.5 text-xs text-ink-muted">
                            {m.detail}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section>
                <h3 className="mb-3 text-sm font-semibold text-ink">
                  Mensajes
                </h3>
                {detail.timeline.length === 0 ? (
                  <EmptyState
                    title="Sin mensajes guardados"
                    description="Aún no hay historial de chat para esta conversación. Usa WhatsApp para contactar al cliente con el resumen de arriba."
                  />
                ) : (
                  <ol className="space-y-3">
                    {[...detail.timeline]
                      .sort(
                        (a, b) =>
                          Date.parse(a.timestamp) - Date.parse(b.timestamp),
                      )
                      .map((msg) => {
                        const isCustomer = msg.sender === 'customer'
                        return (
                          <li
                            key={msg.id}
                            className={[
                              'rounded-xl px-3 py-2.5 text-sm',
                              isCustomer
                                ? 'ml-4 border border-accent/15 bg-accent-soft text-ink'
                                : 'mr-4 border border-line bg-panel text-ink shadow-sm',
                            ].join(' ')}
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                              <span
                                className={[
                                  'font-semibold',
                                  isCustomer ? 'text-accent' : 'text-ink-muted',
                                ].join(' ')}
                              >
                                {isCustomer ? 'Cliente' : 'Rodacenter AI'}
                              </span>
                              <time className="text-ink-muted">
                                {formatDateTime(msg.timestamp)}
                              </time>
                            </div>
                            <p className="whitespace-pre-wrap leading-relaxed">
                              {msg.text}
                            </p>
                          </li>
                        )
                      })}
                  </ol>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-line px-5 py-4">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!canOpenWa}
            className={[
              'flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition',
              canOpenWa
                ? 'bg-ok text-white hover:bg-ok/90'
                : 'pointer-events-none bg-surface text-ink-muted',
            ].join(' ')}
          >
            {canOpenWa
              ? `Contactar por WhatsApp · ${formatPhoneDisplay(detail?.waId)}`
              : 'WhatsApp no disponible'}
          </a>
        </footer>
      </aside>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="shrink-0 text-ink-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  )
}
