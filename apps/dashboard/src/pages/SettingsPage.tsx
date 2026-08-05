import { useQuery } from '@tanstack/react-query'
import { Card } from '../components/Card'
import { Loading } from '../components/Loading'
import { delay, mockSettings } from '../mocks/data'

export function SettingsPage() {
  const query = useQuery({
    queryKey: ['mock', 'settings'],
    queryFn: () => delay(mockSettings),
  })

  if (query.isLoading || !query.data) {
    return <Loading label="Cargando configuración…" />
  }

  const settings = query.data
  const rows = [
    { label: 'Empresa', value: settings.companyName },
    { label: 'Zona horaria', value: settings.timezone },
    { label: 'TTL de sesión (min)', value: String(settings.sessionTtlMinutes) },
    {
      label: 'TTL de recovery (min)',
      value: String(settings.recoveryTtlMinutes),
    },
    { label: 'Canal', value: settings.channel },
    { label: 'Entorno', value: settings.environment },
  ]

  return (
    <Card
      title="Configuración del producto"
      description="Solo lectura — sin endpoints ni SQLite en esta fase"
    >
      <dl className="divide-y divide-line">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <dt className="text-sm text-ink-muted">{row.label}</dt>
            <dd className="text-sm font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
