import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { buildWhatsAppLink } from '../api/conversationsApi'
import {
  fetchClientDetail,
  fetchClients,
  type ClientDto,
} from '../api/clientsApi'
import {
  fetchLeads,
  patchLeadStatus,
  type LeadListItem,
} from '../api/leadsApi'
import { Card } from '../components/Card'
import { CommercialStatusSelect } from '../components/CommercialStatusSelect'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'
import { PageSkeleton } from '../components/Skeleton'
import { QueryError } from '../components/QueryError'
import { InterestBadge, SalesFlowBadge } from '../components/StatusBadge'
import {
  leadStatusPatchPath,
  pickLeadForPhone,
  type CommercialStatus,
} from '../lib/commercialLeadStatus'
import {
  customerDisplayName,
  formatDateTime,
  formatPhoneDisplay,
  formatWillardReference,
  isTechnicalPhoneId,
} from '../lib/operatorDisplay'

export function ClientsPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const initialQ = searchParams.get('q')?.trim() ?? ''
  const [search, setSearch] = useState(initialQ)
  const [debouncedQ, setDebouncedQ] = useState(initialQ)
  const [sortBy, setSortBy] = useState<
    'ultimaActividad' | 'primerContacto' | 'leadPromedio' | 'cantidadConversaciones'
  >('ultimaActividad')
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

  const query = useQuery({
    queryKey: ['api', 'clients', debouncedQ, sortBy, sortOrder, page],
    queryFn: () =>
      fetchClients({
        page,
        pageSize: 20,
        q: debouncedQ || undefined,
        sortBy,
        sortOrder,
      }),
    placeholderData: (prev) => prev,
  })

  const leadsQuery = useQuery({
    queryKey: ['api', 'leads'],
    queryFn: fetchLeads,
  })

  const detailQuery = useQuery({
    queryKey: ['api', 'client-detail', selectedId],
    queryFn: () => fetchClientDetail(selectedId!),
    enabled: Boolean(selectedId),
  })

  const statusMutation = useMutation({
    mutationFn: async (input: {
      lead: LeadListItem
      label: CommercialStatus
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

  const leads = leadsQuery.data ?? []

  const columns = useMemo<DataTableColumn<ClientDto>[]>(
    () => [
      {
        key: 'nombre',
        header: 'Nombre',
        cell: (row) => (
          <span className="font-medium text-ink">
            {customerDisplayName(row.nombre, row.waId)}
          </span>
        ),
      },
      {
        key: 'telefono',
        header: 'Teléfono',
        cell: (row) => (
          <span className="text-sm text-ink-muted">
            {formatPhoneDisplay(row.waId)}
          </span>
        ),
      },
      {
        key: 'vehiculo',
        header: 'Vehículo',
        cell: (row) => (
          <span className="text-sm text-ink">
            {row.ultimoVehiculo?.trim() || '—'}
          </span>
        ),
      },
      {
        key: 'referencia',
        header: 'Referencia recomendada',
        cell: (row) => (
          <span className="text-sm font-medium text-ink">
            {row.ultimaReferencia
              ? formatWillardReference(row.ultimaReferencia)
              : '—'}
          </span>
        ),
      },
      {
        key: 'estado',
        header: 'Estado',
        cell: (row) => (
          <CommercialStatusSelect
            lead={pickLeadForPhone(leads, row.waId)}
            disabled={statusMutation.isPending}
            onChange={(label, lead) => {
              statusMutation.mutate({ lead, label })
            }}
          />
        ),
      },
      {
        key: 'actividad',
        header: 'Última actividad',
        cell: (row) => (
          <span className="text-sm text-ink-muted">
            {formatDateTime(row.ultimaActividad)}
          </span>
        ),
      },
      {
        key: 'whatsapp',
        header: 'WhatsApp',
        cell: (row) => {
          const canOpen = !isTechnicalPhoneId(row.waId)
          if (!canOpen) {
            return (
              <span className="text-xs text-ink-muted">No disponible</span>
            )
          }
          return (
            <a
              href={buildWhatsAppLink(row.waId)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex rounded-lg bg-ok px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-ok/90"
            >
              Abrir WhatsApp
            </a>
          )
        },
      },
    ],
    [leads, statusMutation.isPending, statusMutation.mutate],
  )

  if (query.isLoading && !query.data) {
    return <PageSkeleton rows={6} />
  }

  if (query.isError && !query.data) {
    return (
      <QueryError
        title="No se pudieron cargar los clientes"
        description="Revisa tu conexión o vuelve a iniciar sesión."
        onRetry={() => void query.refetch()}
      />
    )
  }

  const data = query.data
  if (!data) {
    return <PageSkeleton rows={6} />
  }

  const selectedLead = selectedId
    ? pickLeadForPhone(
        leads,
        detailQuery.data?.waId ?? selectedId,
      )
    : null

  return (
    <>
      <Card
        title="Directorio de clientes"
        description={`${data.total} cliente${data.total === 1 ? '' : 's'} · clic para ver ficha`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="client-search">
              Buscar por nombre, teléfono o vehículo
            </label>
            <input
              id="client-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, teléfono o vehículo…"
              autoComplete="off"
              className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none ring-accent focus:ring-2 sm:w-64"
            />
            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [by, order] = e.target.value.split(':') as [
                  typeof sortBy,
                  'asc' | 'desc',
                ]
                setSortBy(by)
                setSortOrder(order)
                setPage(1)
              }}
              className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none ring-accent focus:ring-2"
            >
              <option value="ultimaActividad:desc">Última actividad ↓</option>
              <option value="ultimaActividad:asc">Última actividad ↑</option>
              <option value="primerContacto:desc">Primer contacto ↓</option>
              <option value="primerContacto:asc">Primer contacto ↑</option>
              <option value="leadPromedio:desc">Interés ↓</option>
              <option value="leadPromedio:asc">Interés ↑</option>
              <option value="cantidadConversaciones:desc">Conversaciones ↓</option>
              <option value="cantidadConversaciones:asc">Conversaciones ↑</option>
            </select>
          </div>
        }
      >
        {statusError ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {statusError}
          </p>
        ) : null}
        <div
          className={
            query.isFetching && query.isPlaceholderData
              ? 'opacity-60 transition-opacity'
              : 'transition-opacity'
          }
        >
          <DataTable
            columns={columns}
            rows={data.items}
            rowKey={(row) => row.id}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyTitle="Sin clientes todavía"
            emptyDescription={
              debouncedQ
                ? 'Ningún resultado para nombre, teléfono o vehículo.'
                : 'Cuando un cliente escriba por WhatsApp, aparecerá aquí.'
            }
          />
        </div>

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
        <ClientDetailDrawer
          open
          loading={detailQuery.isLoading}
          error={detailQuery.isError}
          detail={detailQuery.data}
          lead={selectedLead}
          statusPending={statusMutation.isPending}
          onStatusChange={(label, lead) => {
            statusMutation.mutate({ lead, label })
          }}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
    </>
  )
}

function ClientDetailDrawer({
  open,
  loading,
  error,
  detail,
  lead,
  statusPending,
  onStatusChange,
  onClose,
}: {
  open: boolean
  loading: boolean
  error: boolean
  detail: Awaited<ReturnType<typeof fetchClientDetail>> | undefined
  lead: LeadListItem | null
  statusPending: boolean
  onStatusChange: (label: CommercialStatus, lead: LeadListItem) => void
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
    ? customerDisplayName(detail.nombre, detail.waId)
    : 'Cliente'

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
        aria-labelledby="client-detail-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Cliente
            </p>
            <h2
              id="client-detail-title"
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
          {loading ? <Loading label="Cargando cliente…" /> : null}
          {error && !loading ? (
            <EmptyState
              title="No se pudo cargar el cliente"
              description="El cliente no está disponible en este momento."
            />
          ) : null}
          {detail && !loading ? (
            <div className="space-y-6">
              <section className="space-y-3 rounded-xl border border-line bg-surface/50 px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-muted">Estado comercial</span>
                  <CommercialStatusSelect
                    lead={lead}
                    disabled={statusPending}
                    onChange={onStatusChange}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-muted">Interés</span>
                  <InterestBadge score={detail.leadPromedio} />
                </div>
                <DetailRow
                  label="Primer contacto"
                  value={formatDateTime(detail.createdAt)}
                />
                <DetailRow
                  label="Última actividad"
                  value={formatDateTime(detail.updatedAt)}
                />
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">Vehículos</h3>
                {detail.vehiculos.length === 0 ? (
                  <EmptyState
                    title="Sin vehículos"
                    description="Este cliente aún no ha consultado un vehículo."
                  />
                ) : (
                  <ul className="space-y-2">
                    {detail.vehiculos.map((v) => (
                      <li
                        key={`${v.label}-${v.year}`}
                        className="rounded-lg border border-line bg-surface px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-ink">{v.label}</p>
                        {v.year ? (
                          <p className="text-xs text-ink-muted">{v.year}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">
                  Baterías Willard recomendadas
                </h3>
                {detail.referenciasRecomendadas.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    Sin recomendaciones todavía.
                  </p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {detail.referenciasRecomendadas.map((ref) => (
                      <li
                        key={ref}
                        className="rounded-md bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent"
                      >
                        {formatWillardReference(ref)}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold text-ink">
                  Historial de conversaciones
                </h3>
                {detail.conversaciones.length === 0 ? (
                  <EmptyState
                    title="Sin historial"
                    description="No hay conversaciones asociadas a este cliente."
                  />
                ) : (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {detail.conversaciones.map((c) => (
                      <li key={c.id} className="px-3 py-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-ink">
                            {formatWillardReference(c.recommendedReference)}
                          </span>
                          <SalesFlowBadge state={c.salesFlowState} />
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          {formatDateTime(c.updatedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
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
