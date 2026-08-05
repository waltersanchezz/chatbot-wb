import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchAnalytics } from '../api/analyticsApi'
import { buildWhatsAppLink, fetchConversations } from '../api/conversationsApi'
import { fetchDashboard } from '../api/dashboardApi'
import { fetchTasks, type TaskDto, type TaskPriority } from '../api/tasksApi'
import { Card } from '../components/Card'
import { CardsSkeleton, PageSkeleton } from '../components/Skeleton'
import { QueryError } from '../components/QueryError'
import { SalesFlowBadge } from '../components/StatusBadge'
import { StatCard, type DashboardStat } from '../components/StatCard'
import { EmptyState } from '../components/EmptyState'
import {
  customerDisplayName,
  formatPhoneDisplay,
  formatWillardReference,
  isTechnicalPhoneId,
} from '../lib/operatorDisplay'

const priorityBadge: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  Alta: {
    label: 'Alta',
    className: 'bg-danger/10 text-danger ring-1 ring-danger/20',
  },
  Media: {
    label: 'Media',
    className: 'bg-warn/10 text-warn ring-1 ring-warn/20',
  },
  Baja: {
    label: 'Baja',
    className: 'bg-ok/10 text-ok ring-1 ring-ok/20',
  },
}

export function HomePage() {
  const dashboardQuery = useQuery({
    queryKey: ['api', 'dashboard'],
    queryFn: fetchDashboard,
  })

  const tasksQuery = useQuery({
    queryKey: ['api', 'tasks'],
    queryFn: fetchTasks,
  })

  const recentQuery = useQuery({
    queryKey: ['api', 'conversations', 'home-recent'],
    queryFn: () =>
      fetchConversations({
        page: 1,
        pageSize: 5,
        sortBy: 'lastActivityAt',
        sortOrder: 'desc',
      }),
  })

  const vehiclesQuery = useQuery({
    queryKey: ['api', 'analytics', 'home-vehicles'],
    queryFn: fetchAnalytics,
  })

  if (dashboardQuery.isLoading) {
    return (
      <div className="space-y-6">
        <CardsSkeleton count={5} />
        <PageSkeleton rows={3} />
      </div>
    )
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <QueryError
        title="No se pudo cargar el inicio"
        description="Revisa tu conexión o vuelve a iniciar sesión."
        onRetry={() => void dashboardQuery.refetch()}
      />
    )
  }

  const stats: DashboardStat[] = [
    {
      id: 'conv-today',
      label: 'Conversaciones hoy',
      value: String(dashboardQuery.data.conversacionesHoy),
      delta: 'Hoy',
      trend: 'flat',
    },
    {
      id: 'active-clients',
      label: 'Clientes activos',
      value: String(dashboardQuery.data.clientesActivos),
      delta: 'En seguimiento',
      trend: 'flat',
    },
    {
      id: 'pending-leads',
      label: 'Leads pendientes',
      value: String(dashboardQuery.data.leadsPendientes),
      delta: 'Por atender',
      trend: 'flat',
    },
    {
      id: 'closed-today',
      label: 'Finalizadas hoy',
      value: String(dashboardQuery.data.conversacionesCerradasHoy),
      delta: 'Hoy',
      trend: 'flat',
    },
    {
      id: 'avg-time',
      label: 'Tiempo promedio',
      value: dashboardQuery.data.tiempoPromedioConversacion,
      delta: 'Por conversación',
      trend: 'flat',
    },
  ]

  const tasks = tasksQuery.data?.tasks ?? []
  const byPriority = tasksQuery.data?.byPriority
  const recent = recentQuery.data?.items ?? []
  const topVehicles = (vehiclesQuery.data?.topVehiculos ?? []).slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <StatCard key={stat.id} stat={stat} />
        ))}
      </div>

      <Card
        title="Centro de tareas"
        description={
          tasksQuery.isError
            ? 'No se pudieron cargar las tareas'
            : `${tasks.length} tarea${tasks.length === 1 ? '' : 's'} · ordenadas por prioridad`
        }
      >
        {tasksQuery.isError ? (
          <p className="text-sm text-ink-muted">
            No se pudieron cargar las tareas. Intenta de nuevo en unos segundos.
          </p>
        ) : tasks.length === 0 ? (
          <EmptyState
            title="Sin tareas pendientes"
            description="Cuando un cliente necesite un asesor, aparecerá aquí."
          />
        ) : (
          <div className="space-y-4">
            {byPriority ? (
              <div className="flex flex-wrap gap-2 text-xs">
                <span
                  className={`rounded-md px-2 py-1 font-medium ${priorityBadge.Alta.className}`}
                >
                  {priorityBadge.Alta.label} · {byPriority.Alta}
                </span>
                <span
                  className={`rounded-md px-2 py-1 font-medium ${priorityBadge.Media.className}`}
                >
                  {priorityBadge.Media.label} · {byPriority.Media}
                </span>
                <span
                  className={`rounded-md px-2 py-1 font-medium ${priorityBadge.Baja.className}`}
                >
                  {priorityBadge.Baja.label} · {byPriority.Baja}
                </span>
              </div>
            ) : null}

            <ul className="divide-y divide-line">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Conversaciones recientes"
          description="Última actividad del canal WhatsApp"
        >
          {recentQuery.isError ? (
            <p className="text-sm text-ink-muted">
              No se pudieron cargar las conversaciones.
            </p>
          ) : recent.length === 0 ? (
            <EmptyState
              title="Sin conversaciones"
              description="Las consultas de clientes aparecerán aquí."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/conversaciones?q=${encodeURIComponent(item.phone)}`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {customerDisplayName(item.customerName, item.phone)}
                    </Link>
                    <p className="truncate text-sm text-ink-muted">
                      {item.vehicle ?? 'Sin vehículo'}
                      {item.year ? ` · ${item.year}` : ''}
                    </p>
                  </div>
                  <SalesFlowBadge state={item.salesFlowState} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Vehículos más consultados"
          description="Lo que más preguntan tus clientes"
        >
          {vehiclesQuery.isError ? (
            <p className="text-sm text-ink-muted">
              No se pudieron cargar los vehículos.
            </p>
          ) : topVehicles.length === 0 ? (
            <EmptyState
              title="Sin vehículos todavía"
              description="Cuando haya consultas, verás el ranking aquí."
            />
          ) : (
            <ul className="space-y-3">
              {topVehicles.map((row, index) => (
                <li
                  key={row.key}
                  className="flex items-center justify-between gap-3"
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
                    {row.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              to="/vehiculos"
              className="text-sm font-medium text-accent hover:underline"
            >
              Ver todos los vehículos
            </Link>
          </div>
        </Card>
      </div>
    </div>
  )
}

function TaskRow({ task }: { task: TaskDto }) {
  const badge = priorityBadge[task.prioridad]
  const canOpenWa = !isTechnicalPhoneId(task.waId)
  const waHref = canOpenWa ? buildWhatsAppLink(task.waId) : '#'

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
          <span className="text-sm font-semibold text-ink">{task.tipo}</span>
        </div>
        <p className="text-sm font-medium text-ink">
          {customerDisplayName(task.cliente, task.waId)}
        </p>
        <p className="text-xs text-ink-muted">
          {formatPhoneDisplay(task.waId)}
          {' · '}
          {task.vehiculo ?? 'Sin vehículo'}
          {' · '}
          {formatWillardReference(task.referencia)}
          {' · '}
          {task.tiempoDesdeUltimaActividad}
        </p>
      </div>
      {canOpenWa ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-lg bg-ok px-3 py-2 text-center text-sm font-semibold text-white hover:bg-ok/90"
        >
          WhatsApp
        </a>
      ) : (
        <span className="shrink-0 rounded-lg bg-surface px-3 py-2 text-sm text-ink-muted">
          Sin número
        </span>
      )}
    </li>
  )
}
