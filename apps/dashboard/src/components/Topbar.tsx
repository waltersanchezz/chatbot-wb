import { useAuth } from '../auth/useAuth'
import { roleLabel } from '../auth/roles'
import { SystemStatus } from './SystemStatus'

interface TopbarProps {
  title: string
  subtitle?: string
  onOpenNav?: () => void
}

export function Topbar({ title, subtitle, onOpenNav }: TopbarProps) {
  const { user, logout } = useAuth()
  const initials = (user?.name || 'RC')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-panel/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenNav}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink md:hidden"
            aria-label="Abrir menú"
          >
            <span className="block space-y-1" aria-hidden>
              <span className="block h-0.5 w-4 bg-ink" />
              <span className="block h-0.5 w-4 bg-ink" />
              <span className="block h-0.5 w-4 bg-ink" />
            </span>
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-ink sm:text-xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs text-ink-muted sm:text-sm">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden lg:block">
            <SystemStatus />
          </div>
          {user ? (
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink">{user.name}</p>
              <p className="text-[11px] text-ink-muted">
                {roleLabel(user.role)}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink transition hover:border-accent/40 hover:text-accent"
          >
            Cerrar sesión
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
            {initials || 'RC'}
          </div>
        </div>
      </div>
      <div className="border-t border-line px-4 py-2 lg:hidden">
        <SystemStatus />
      </div>
    </header>
  )
}
