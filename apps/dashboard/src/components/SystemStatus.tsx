import { useQuery } from '@tanstack/react-query'
import { useRealtime } from '../realtime/useRealtime'

async function pingHealth(): Promise<boolean> {
  const res = await fetch('/health', { method: 'GET' })
  return res.ok
}

const sseLabel: Record<string, string> = {
  open: 'En vivo',
  connecting: 'Conectando…',
  error: 'Reconectando…',
  closed: 'Sin tiempo real',
}

const sseDot: Record<string, string> = {
  open: 'bg-ok',
  connecting: 'bg-warn',
  error: 'bg-warn',
  closed: 'bg-ink-muted',
}

/**
 * Indicadores visuales: API /health + canal SSE (PS4).
 */
export function SystemStatus() {
  const { status } = useRealtime()
  const healthQuery = useQuery({
    queryKey: ['system', 'health'],
    queryFn: pingHealth,
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 10_000,
  })

  const apiOk = healthQuery.data === true
  const apiPending = healthQuery.isLoading || healthQuery.isFetching

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <StatusChip
        ok={apiOk}
        pending={apiPending}
        label={
          apiPending
            ? 'Verificando…'
            : apiOk
              ? 'Servicio activo'
              : 'Servicio no disponible'
        }
      />
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 font-medium text-ink-muted"
        title="Canal de eventos en tiempo real"
      >
        <span
          className={[
            'h-1.5 w-1.5 rounded-full',
            sseDot[status] ?? 'bg-ink-muted',
          ].join(' ')}
        />
        {sseLabel[status] ?? status}
      </span>
    </div>
  )
}

function StatusChip({
  ok,
  pending,
  label,
}: {
  ok: boolean
  pending: boolean
  label: string
}) {
  const tone = pending
    ? 'border-line text-ink-muted'
    : ok
      ? 'border-ok/30 bg-ok/10 text-ok'
      : 'border-danger/30 bg-danger/10 text-danger'
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium',
        tone,
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          pending ? 'bg-ink-muted' : ok ? 'bg-ok' : 'bg-danger',
        ].join(' ')}
      />
      {label}
    </span>
  )
}
