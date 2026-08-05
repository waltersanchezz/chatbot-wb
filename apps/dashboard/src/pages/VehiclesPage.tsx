import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchAnalytics } from '../api/analyticsApi'
import { fetchClients } from '../api/clientsApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { PageSkeleton } from '../components/Skeleton'
import { QueryError } from '../components/QueryError'
import {
  customerDisplayName,
  formatPhoneDisplay,
  formatWillardReference,
} from '../lib/operatorDisplay'

/**
 * Vehículos del operador — solo APIs existentes (analytics + clients).
 */
export function VehiclesPage() {
  const analyticsQuery = useQuery({
    queryKey: ['api', 'analytics', 'vehicles'],
    queryFn: fetchAnalytics,
  })

  const clientsQuery = useQuery({
    queryKey: ['api', 'clients', 'vehicles-dir'],
    queryFn: () =>
      fetchClients({
        page: 1,
        pageSize: 50,
        sortBy: 'ultimaActividad',
        sortOrder: 'desc',
      }),
  })

  if (analyticsQuery.isLoading || clientsQuery.isLoading) {
    return <PageSkeleton rows={5} />
  }

  if (analyticsQuery.isError && clientsQuery.isError) {
    return (
      <QueryError
        title="No se pudieron cargar los vehículos"
        description="Revisa tu conexión o vuelve a iniciar sesión."
        onRetry={() => {
          void analyticsQuery.refetch()
          void clientsQuery.refetch()
        }}
      />
    )
  }

  const ranked = analyticsQuery.data?.topVehiculos ?? []
  const clientsWithVehicles = (clientsQuery.data?.items ?? []).filter(
    (c) => c.cantidadVehiculos > 0,
  )

  return (
    <div className="space-y-6">
      <Card
        title="Vehículos más consultados"
        description="Ranking comercial según consultas de clientes"
      >
        {ranked.length === 0 ? (
          <EmptyState
            title="Sin vehículos en el ranking"
            description="Cuando los clientes consulten baterías, verás aquí los más frecuentes."
          />
        ) : (
          <ul className="divide-y divide-line">
            {ranked.map((row, index) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-6 text-xs font-medium tabular-nums text-ink-muted">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-sm font-medium text-ink">
                    {row.label}
                  </span>
                </div>
                <span className="text-sm tabular-nums text-ink-muted">
                  {row.count} consultas
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Clientes con vehículo"
        description="Directorio con al menos un vehículo asociado"
      >
        {clientsQuery.isError ? (
          <p className="text-sm text-ink-muted">
            No se pudo cargar el directorio de clientes.
          </p>
        ) : clientsWithVehicles.length === 0 ? (
          <EmptyState
            title="Sin clientes con vehículo"
            description="Aparecerán aquí cuando un cliente complete datos de su vehículo."
          />
        ) : (
          <ul className="divide-y divide-line">
            {clientsWithVehicles.map((client) => (
              <li
                key={client.id}
                className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    to={`/clientes?q=${encodeURIComponent(client.waId)}`}
                    className="font-medium text-ink hover:text-accent"
                  >
                    {customerDisplayName(client.nombre, client.waId)}
                  </Link>
                  <p className="text-xs text-ink-muted">
                    {formatPhoneDisplay(client.waId)}
                  </p>
                </div>
                <p className="text-sm text-ink-muted">
                  {client.cantidadVehiculos} vehículo
                  {client.cantidadVehiculos === 1 ? '' : 's'}
                  {client.ultimaReferencia
                    ? ` · Willard ${formatWillardReference(client.ultimaReferencia)}`
                    : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
