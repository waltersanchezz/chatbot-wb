export interface DashboardStat {
  id: string
  label: string
  value: string
  delta: string
  trend: 'up' | 'down' | 'flat'
}

interface StatCardProps {
  stat: DashboardStat
}

const trendClass = {
  up: 'text-ok',
  down: 'text-danger',
  flat: 'text-ink-muted',
} as const

export function StatCard({ stat }: StatCardProps) {
  return (
    <article className="rounded-xl border border-line bg-panel px-5 py-4 shadow-[0_1px_0_rgba(15,23,32,0.04)]">
      <p className="text-sm font-medium text-ink-muted">{stat.label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-mono text-3xl font-medium tracking-tight text-ink">
          {stat.value}
        </p>
        <span className={`text-sm font-medium ${trendClass[stat.trend]}`}>
          {stat.delta}
        </span>
      </div>
    </article>
  )
}
