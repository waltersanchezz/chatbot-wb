import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchConversations } from '../api/conversationsApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { PageSkeleton } from '../components/Skeleton'
import { QueryError } from '../components/QueryError'
import { SalesFlowBadge } from '../components/StatusBadge'
import {
  customerDisplayName,
  formatDateTime,
  formatPhoneDisplay,
  formatWillardReference,
} from '../lib/operatorDisplay'

/**
 * Historial operativo — conversaciones reales ordenadas por última actividad.
 */
export function HistoryPage() {
  const historyQuery = useQuery({
    queryKey: ['api', 'conversations', 'historial'],
    queryFn: () =>
      fetchConversations({
        page: 1,
        pageSize: 40,
        sortBy: 'lastActivityAt',
        sortOrder: 'desc',
      }),
  })

  if (historyQuery.isLoading) {
    return <PageSkeleton rows={6} />
  }

  if (historyQuery.isError || !historyQuery.data) {
    return (
      <QueryError
        title="No se pudo cargar el historial"
        description="Revisa tu conexión o vuelve a iniciar sesión."
        onRetry={() => void historyQuery.refetch()}
      />
    )
  }

  const items = historyQuery.data.items

  return (
    <Card
      title="Historial de actividad"
      description={`${historyQuery.data.total} conversación${historyQuery.data.total === 1 ? '' : 'es'} recientes`}
    >
      {items.length === 0 ? (
        <EmptyState
          title="Sin actividad todavía"
          description="Cuando haya conversaciones con clientes, el historial aparecerá aquí."
        />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/conversaciones?q=${encodeURIComponent(item.phone)}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {customerDisplayName(item.customerName, item.phone)}
                  </Link>
                  <SalesFlowBadge state={item.salesFlowState} />
                </div>
                <p className="text-sm text-ink-muted">
                  {item.vehicle ?? 'Sin vehículo'}
                  {item.year ? ` · ${item.year}` : ''}
                  {item.recommendedReference
                    ? ` · Willard ${formatWillardReference(item.recommendedReference)}`
                    : ''}
                </p>
                <p className="text-xs text-ink-muted">
                  {formatPhoneDisplay(item.phone)}
                </p>
              </div>
              <time className="shrink-0 text-xs text-ink-muted">
                {formatDateTime(item.lastActivityAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
