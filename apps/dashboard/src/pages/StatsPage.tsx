import { useQuery } from '@tanstack/react-query'
import {
  fetchAnalytics,
  type AnalyticsRankedItemDto,
} from '../api/analyticsApi'
import { Card } from '../components/Card'
import { EmptyState } from '../components/EmptyState'
import { Loading } from '../components/Loading'

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

export function StatsPage() {
  const query = useQuery({
    queryKey: ['api', 'analytics'],
    queryFn: fetchAnalytics,
  })

  if (query.isLoading) {
    return <Loading label="Cargando analítica comercial…" />
  }

  if (query.isError || !query.data) {
    return (
      <EmptyState
        title="No se pudo cargar la analítica"
        description="Verifica que el backend esté en marcha y SQLite disponible."
      />
    )
  }

  const data = query.data

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">
            Analítica comercial
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Métricas desde SQLite · generado {formatGeneratedAt(data.generatedAt)}
          </p>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Conversaciones hoy"
          value={String(data.conversaciones.hoy)}
          hint="SQLite"
        />
        <KpiCard
          label="Conversaciones semana"
          value={String(data.conversaciones.semana)}
          hint="Últimos 7 días"
        />
        <KpiCard
          label="Conversaciones mes"
          value={String(data.conversaciones.mes)}
          hint="Mes calendario"
        />
        <KpiCard
          label="Promedio lead score"
          value={String(data.promedioLeadScore)}
          hint="Sesiones activas"
        />
        <KpiCard
          label="Leads generados"
          value={String(data.leads.generados)}
          hint="Comerciales"
        />
        <KpiCard
          label="Listos para asesor"
          value={String(data.leads.listosParaAsesor)}
          hint="READY_FOR_ADVISOR"
        />
        <KpiCard
          label="Abandonados"
          value={String(data.leads.abandonados)}
          hint="learning_events"
        />
        <KpiCard
          label="Cerrados"
          value={String(data.leads.cerrados)}
          hint="CLOSED / accepted"
        />
        <KpiCard
          label="Tiempo promedio"
          value={data.tiempoPromedioConversacion}
          hint="mm:ss"
        />
        <KpiCard
          label="Tasa de aceptación"
          value={formatPercent(data.tasaAceptacion)}
          hint="accepted / decididos"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card title="Conversaciones" description="Hoy · semana · mes">
          <BarChart
            items={[
              { label: 'Hoy', count: data.conversaciones.hoy },
              { label: 'Semana', count: data.conversaciones.semana },
              { label: 'Mes', count: data.conversaciones.mes },
            ]}
          />
        </Card>
        <Card title="Leads" description="Embudo comercial">
          <BarChart
            items={[
              { label: 'Generados', count: data.leads.generados },
              { label: 'Asesor', count: data.leads.listosParaAsesor },
              { label: 'Abandonados', count: data.leads.abandonados },
              { label: 'Cerrados', count: data.leads.cerrados },
            ]}
          />
        </Card>
        <Card title="Calidad" description="Score y aceptación">
          <BarChart
            items={[
              {
                label: 'Lead score',
                count: Math.round(data.promedioLeadScore),
              },
              {
                label: 'Aceptación %',
                count: Math.round(data.tasaAceptacion * 100),
              },
            ]}
          />
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <TopTable
          title="Top referencias"
          description="Top 10 desde learning_events"
          rows={data.topReferencias}
        />
        <TopTable
          title="Top vehículos"
          description="Top 10 marca + modelo"
          rows={data.topVehiculos}
        />
        <TopTable
          title="Top preguntas técnicas"
          description="Top 10 consultadas"
          rows={data.topPreguntasTecnicas}
        />
      </section>
    </div>
  )
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <article className="rounded-xl border border-line bg-panel px-5 py-4 shadow-[0_1px_0_rgba(15,23,32,0.04)]">
      <p className="text-sm font-medium text-ink-muted">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-mono text-3xl font-medium tracking-tight text-ink">
          {value}
        </p>
        <span className="text-xs font-medium text-ink-muted">{hint}</span>
      </div>
    </article>
  )
}

function BarChart({
  items,
}: {
  items: Array<{ label: string; count: number }>
}) {
  const max = Math.max(1, ...items.map((i) => i.count))

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const pct = Math.round((item.count / max) * 100)
        return (
          <li key={item.label}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-ink">{item.label}</span>
              <span className="font-mono text-ink-muted">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function TopTable({
  title,
  description,
  rows,
}: {
  title: string
  description: string
  rows: AnalyticsRankedItemDto[]
}) {
  return (
    <Card title={title} description={description}>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">Sin datos todavía.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-muted">
                <th className="pb-2 pr-2 font-medium">#</th>
                <th className="pb-2 pr-2 font-medium">Nombre</th>
                <th className="pb-2 text-right font-medium">Cant.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row, index) => (
                <tr key={row.key}>
                  <td className="py-2 pr-2 font-mono text-xs text-ink-muted">
                    {String(index + 1).padStart(2, '0')}
                  </td>
                  <td className="max-w-[14rem] truncate py-2 pr-2 text-ink">
                    {row.label}
                  </td>
                  <td className="py-2 text-right font-mono text-ink-muted">
                    {row.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
