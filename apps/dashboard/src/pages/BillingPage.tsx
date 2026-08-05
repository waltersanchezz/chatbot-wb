import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  fetchPlans,
  fetchSubscription,
  updateSubscription,
  type LimitWarning,
  type PlanDto,
} from '../api/billingApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

const METRIC_LABELS: Record<string, string> = {
  users: 'Usuarios',
  conversations: 'Conversaciones / mes',
  automations: 'Automatizaciones',
  workflows: 'Workflows',
  integrations: 'Integraciones',
  knowledge: 'Base de conocimiento',
  clients: 'Clientes',
  storage: 'Almacenamiento (MB)',
  apiRequests: 'API requests',
}

function formatLimit(n: number): string {
  if (n < 0) return 'Ilimitado'
  return n.toLocaleString('es-CO')
}

function UsageBar({
  used,
  limit,
  warning,
}: {
  used: number
  limit: number
  warning?: LimitWarning
}) {
  const unlimited = limit < 0
  const pct = unlimited
    ? 8
    : limit === 0
      ? used > 0
        ? 100
        : 0
      : Math.min(100, Math.round((used / limit) * 100))
  const color =
    warning?.level === 'exceeded'
      ? 'bg-danger'
      : warning?.level === 'warning'
        ? 'bg-warn'
        : 'bg-brand'

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-ink-muted">
        <span>
          {used.toLocaleString('es-CO')} / {formatLimit(limit)}
        </span>
        <span>{unlimited ? '∞' : `${pct}%`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${unlimited ? 8 : pct}%` }}
        />
      </div>
    </div>
  )
}

export function BillingPage() {
  const queryClient = useQueryClient()
  const [flash, setFlash] = useState<string | null>(null)
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')

  const subQuery = useQuery({
    queryKey: ['api', 'subscription'],
    queryFn: fetchSubscription,
  })

  const plansQuery = useQuery({
    queryKey: ['api', 'plans'],
    queryFn: fetchPlans,
  })

  const mutation = useMutation({
    mutationFn: updateSubscription,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['api', 'subscription'] })
      setFlash('Suscripción actualizada')
      window.setTimeout(() => setFlash(null), 2200)
    },
  })

  if (subQuery.isLoading || plansQuery.isLoading) {
    return <Loading label="Cargando facturación…" />
  }

  if (subQuery.isError || !subQuery.data) {
    return (
      <EmptyState
        title="No se pudo cargar la facturación"
        description="Verifica que el backend esté en marcha y la sesión activa."
      />
    )
  }

  const { subscription, plan, usage, events } = subQuery.data
  const plans = plansQuery.data ?? []
  const warningsByMetric = Object.fromEntries(
    usage.warnings.map((w) => [w.metric, w]),
  ) as Record<string, LimitWarning>

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Facturación
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Plan, consumo y límites del tenant (sin bloqueos aún).
        </p>
      </header>

      {flash ? (
        <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">{flash}</p>
      ) : null}

      {usage.warnings.length > 0 ? (
        <div className="space-y-2">
          {usage.warnings.map((w) => (
            <p
              key={w.metric}
              className={
                w.level === 'exceeded'
                  ? 'rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger'
                  : 'rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn'
              }
            >
              {w.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-ink">Plan actual</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Plan</dt>
              <dd className="font-medium text-ink">{plan.name}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Estado</dt>
              <dd className="font-medium capitalize text-ink">
                {subscription.status}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Periodo de uso</dt>
              <dd className="font-medium text-ink">{usage.period}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Renovación</dt>
              <dd className="font-medium text-ink">
                {subscription.renewDate
                  ? new Date(subscription.renewDate).toLocaleDateString('es-CO')
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Trial hasta</dt>
              <dd className="font-medium text-ink">
                {subscription.trialEndsAt
                  ? new Date(subscription.trialEndsAt).toLocaleDateString(
                      'es-CO',
                    )
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Precio</dt>
              <dd className="font-medium text-ink">
                ${plan.monthlyPrice}/mes · ${plan.annualPrice}/año
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {subscription.status === 'canceled' ? (
              <button
                type="button"
                className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white"
                onClick={() => mutation.mutate({ reactivate: true })}
              >
                Reactivar
              </button>
            ) : (
              <button
                type="button"
                className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger"
                onClick={() => {
                  if (window.confirm('¿Cancelar el plan actual?')) {
                    mutation.mutate({ cancel: true })
                  }
                }}
              >
                Cancelar plan
              </button>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">Consumo</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Barras de uso del periodo {usage.period}
          </p>
          <ul className="mt-4 space-y-3">
            {(Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>).map(
              (metric) => (
                <li key={metric}>
                  <p className="mb-1 text-sm font-medium text-ink">
                    {METRIC_LABELS[metric]}
                  </p>
                  <UsageBar
                    used={usage.byMetric[metric] ?? 0}
                    limit={plan.limits[metric as keyof PlanDto['limits']]}
                    warning={warningsByMetric[metric]}
                  />
                </li>
              ),
            )}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Cambiar plan</h2>
            <p className="mt-1 text-sm text-ink-muted">
              El cambio no bloquea módulos; solo actualiza límites y eventos.
            </p>
          </div>
          <select
            className="rounded-lg border border-line px-3 py-2 text-sm"
            value={cycle}
            onChange={(e) =>
              setCycle(e.target.value as 'monthly' | 'annual')
            }
          >
            <option value="monthly">Mensual</option>
            <option value="annual">Anual</option>
          </select>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className={[
                'rounded-xl border p-4',
                p.id === plan.id
                  ? 'border-brand bg-brand/5'
                  : 'border-line bg-white',
              ].join(' ')}
            >
              <p className="font-semibold text-ink">{p.name}</p>
              <p className="mt-1 text-xs text-ink-muted">{p.description}</p>
              <p className="mt-3 text-sm font-medium text-ink">
                ${cycle === 'monthly' ? p.monthlyPrice : p.annualPrice}
                <span className="text-ink-muted">
                  /{cycle === 'monthly' ? 'mes' : 'año'}
                </span>
              </p>
              <button
                type="button"
                disabled={p.id === plan.id || mutation.isPending}
                className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-muted disabled:opacity-50"
                onClick={() =>
                  mutation.mutate({ planId: p.id, billingCycle: cycle })
                }
              >
                {p.id === plan.id ? 'Plan actual' : 'Seleccionar'}
              </button>
            </div>
          ))}
        </div>
        {mutation.isError ? (
          <p className="mt-3 text-sm text-danger">
            {(mutation.error as Error).message}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Historial</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">Sin eventos de billing.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {events.map((ev) => (
              <li key={ev.id} className="py-3">
                <p className="font-medium text-ink">{ev.type}</p>
                <p className="text-ink-muted">
                  {new Date(ev.createdAt).toLocaleString('es-CO')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
