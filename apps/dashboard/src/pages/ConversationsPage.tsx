import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  buildWhatsAppLink,
  fetchConversationDetail,
  fetchConversations,
  type ConversationDetailDto,
  type ConversationListItemDto,
} from '../api/conversationsApi'
import {
  fetchLeads,
  patchLeadStatus,
  postLeadNote,
  type LeadListItem,
} from '../api/leadsApi'
import { Card } from '../components/Card'
import { CommercialStatusSelect } from '../components/CommercialStatusSelect'
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
  isTerminalLeadStatus,
  leadStatusPatchPath,
  leadStatusToCommercial,
  pickLeadForPhone,
  type CommercialStatus,
} from '../lib/commercialLeadStatus'
import {
  buildCommercialMilestones,
  customerDisplayName,
  formatDateTime,
  formatPhoneDisplay,
  formatSoundSystem,
  formatWillardReference,
  isTechnicalPhoneId,
  salesFlowLabel,
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
  const queryClient = useQueryClient()
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
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQ(search)
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [search])

  /** Fuente única: GET /api/conversations. Sin mocks ni placeholders demo. */
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
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 1,
  })

  const leadsQuery = useQuery({
    queryKey: ['api', 'leads'],
    queryFn: fetchLeads,
  })

  const detailQuery = useQuery({
    queryKey: ['api', 'conversation-detail', selectedId],
    queryFn: () => fetchConversationDetail(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const statusMutation = useMutation({
    mutationFn: async (input: {
      lead: LeadListItem
      label: CommercialStatus
      note?: string
    }) => {
      const path = leadStatusPatchPath(input.lead.status, input.label)
      let last = input.lead
      for (const status of path) {
        last = await patchLeadStatus(
          input.lead.id,
          status,
          status === 'perdido' ? { lostReason: 'No interesado' } : undefined,
        )
      }
      const note = input.note?.trim()
      if (note) {
        last = await postLeadNote(input.lead.id, note)
      }
      return last
    },
    onSuccess: async () => {
      setStatusError(null)
      await queryClient.invalidateQueries({ queryKey: ['api', 'leads'] })
    },
    onError: (err: Error & { status?: number }) => {
      setStatusError(
        err.status === 409
          ? 'Ese cambio de estado no está permitido.'
          : 'No se pudo actualizar el estado.',
      )
    },
  })

  if (query.isLoading) {
    return <PageSkeleton rows={6} />
  }

  if (query.isError) {
    return (
      <QueryError
        title="No se pudieron cargar las conversaciones"
        description="No hay datos de demostración: revisa tu conexión o vuelve a iniciar sesión."
        onRetry={() => void query.refetch()}
      />
    )
  }

  if (!query.data) {
    return (
      <EmptyState
        title="Sin conversaciones"
        description="Cuando un cliente escriba por WhatsApp, aparecerá aquí."
      />
    )
  }

  const data = query.data
  const leads = leadsQuery.data ?? []
  const selectedLead = detailQuery.data
    ? pickLeadForPhone(leads, detailQuery.data.waId)
    : null

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
        {statusError ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {statusError}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          rows={data.items}
          rowKey={(row) => row.id}
          onRowClick={(row) => {
            setStatusError(null)
            setSelectedId(row.id)
          }}
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
          lead={selectedLead}
          statusPending={statusMutation.isPending}
          onStatusChange={(label, lead) => {
            statusMutation.mutate({ lead, label })
          }}
          onCloseSale={(lead, note) => {
            statusMutation.mutate({ lead, label: 'Vendido', note })
          }}
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
  lead,
  statusPending,
  onStatusChange,
  onCloseSale,
  onClose,
}: {
  open: boolean
  loading: boolean
  error: boolean
  detail: ConversationDetailDto | undefined
  lead: LeadListItem | null
  statusPending: boolean
  onStatusChange: (label: CommercialStatus, lead: LeadListItem) => void
  onCloseSale: (lead: LeadListItem, note?: string) => void
  onClose: () => void
}) {
  const [closingSale, setClosingSale] = useState(false)
  const [saleNote, setSaleNote] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (closingSale) setClosingSale(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, closingSale])

  useEffect(() => {
    if (!open || !lead || !detail) return
    if (isTerminalLeadStatus(lead.status)) {
      setClosingSale(false)
      return
    }
    const ref =
      detail.recommendedReference?.trim() ||
      lead.recommendation?.trim() ||
      ''
    setSaleNote(
      ref
        ? `Venta cerrada — referencia: ${formatWillardReference(ref)}`
        : 'Venta cerrada',
    )
  }, [open, lead?.id, lead?.status, detail?.recommendedReference, lead?.recommendation])

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
  const canCloseSale =
    Boolean(lead) && lead !== null && !isTerminalLeadStatus(lead.status)
  const isSold = lead ? leadStatusToCommercial(lead.status) === 'Vendido' : false

  const requestCloseSale = () => {
    if (!lead || isTerminalLeadStatus(lead.status)) return
    setClosingSale(true)
  }

  const handleStatusChange = (label: CommercialStatus, target: LeadListItem) => {
    if (label === 'Vendido') {
      requestCloseSale()
      return
    }
    onStatusChange(label, target)
  }

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
                  label="Cliente"
                  value={customerDisplayName(detail.customerName, detail.waId)}
                />
                <DetailRow
                  label="Teléfono"
                  value={formatPhoneDisplay(detail.waId)}
                />
                <DetailRow
                  label="Vehículo"
                  value={detail.vehicle?.trim() || '—'}
                />
                <DetailRow label="Año" value={detail.year?.trim() || '—'} />
                <DetailRow
                  label="Planta de sonido"
                  value={formatSoundSystem(detail.soundSystem)}
                />
                <DetailRow
                  label="Referencia recomendada"
                  value={formatWillardReference(detail.recommendedReference)}
                />
                <DetailRow
                  label="Amperaje"
                  value={detail.amperage?.trim() || '—'}
                />
                <DetailRow
                  label="Tipo de caja"
                  value={detail.caseType?.trim() || '—'}
                />
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="shrink-0 text-ink-muted">Estado comercial</span>
                  <CommercialStatusSelect
                    lead={lead}
                    disabled={statusPending}
                    onChange={handleStatusChange}
                  />
                </div>
                <DetailRow
                  label="Estado del flujo"
                  value={salesFlowLabel(detail.salesFlowState)}
                />
                <DetailRow
                  label="Última actividad"
                  value={formatDateTime(detail.updatedAt)}
                />
              </section>

              {canCloseSale || isSold ? (
                <section className="space-y-3 rounded-xl border border-line px-4 py-3">
                  <h3 className="text-sm font-semibold text-ink">Cierre comercial</h3>
                  {isSold ? (
                    <p className="text-sm text-ok">
                      Oportunidad marcada como vendida.
                      {lead?.notes?.trim() ? (
                        <span className="mt-1 block text-xs text-ink-muted whitespace-pre-wrap">
                          {lead.notes.trim()}
                        </span>
                      ) : null}
                    </p>
                  ) : closingSale ? (
                    <div className="space-y-3">
                      <p className="text-sm text-ink">
                        ¿Confirmas que esta oportunidad fue vendida?
                      </p>
                      <label className="block text-xs text-ink-muted" htmlFor="sale-note">
                        Nota opcional (sin precio ni factura)
                      </label>
                      <textarea
                        id="sale-note"
                        value={saleNote}
                        onChange={(e) => setSaleNote(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none ring-accent focus:ring-2"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={statusPending || !lead}
                          onClick={() => {
                            if (!lead) return
                            onCloseSale(lead, saleNote.trim() || undefined)
                            setClosingSale(false)
                          }}
                          className="rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-white hover:bg-ok/90 disabled:opacity-50"
                        >
                          Confirmar venta
                        </button>
                        <button
                          type="button"
                          disabled={statusPending}
                          onClick={() => setClosingSale(false)}
                          className="rounded-lg border border-line px-3 py-2 text-sm text-ink-muted hover:bg-surface"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={statusPending || !lead}
                      onClick={requestCloseSale}
                      className="w-full rounded-lg border border-ok/30 bg-ok/10 px-3 py-2.5 text-sm font-semibold text-ok hover:bg-ok/15 disabled:opacity-50"
                    >
                      Cerrar venta
                    </button>
                  )}
                </section>
              ) : null}

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
                  Historial de mensajes
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
            aria-label={
              canOpenWa
                ? `Abrir WhatsApp con ${formatPhoneDisplay(detail?.waId)}`
                : 'WhatsApp no disponible'
            }
            aria-disabled={!canOpenWa}
            className={[
              'flex w-full flex-col items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition',
              canOpenWa
                ? 'bg-ok text-white hover:bg-ok/90'
                : 'pointer-events-none bg-surface text-ink-muted',
            ].join(' ')}
          >
            <span>{canOpenWa ? 'Abrir WhatsApp' : 'WhatsApp no disponible'}</span>
            {canOpenWa ? (
              <span className="mt-0.5 text-xs font-medium text-white/90">
                {formatPhoneDisplay(detail?.waId)}
              </span>
            ) : null}
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
