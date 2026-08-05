import { NavLink } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { canAccessNavItem, roleLabel } from '../auth/roles'
import { OPERATOR_NAV } from '../nav/operatorNav'

interface SidebarProps {
  open: boolean
  onNavigate?: () => void
}

export function Sidebar({ open, onNavigate }: SidebarProps) {
  const { user } = useAuth()
  const links = OPERATOR_NAV.filter((link) =>
    canAccessNavItem(
      user?.role,
      'requiresAdmin' in link ? link.requiresAdmin : false,
    ),
  )

  return (
    <>
      <div
        className={[
          'fixed inset-0 z-40 bg-ink/40 transition md:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        aria-hidden={!open}
        onClick={onNavigate}
      />

      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col bg-sidebar text-white transition-transform md:static md:z-0 md:w-60 md:max-w-none md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-sidebar-muted">
            Rodacenter
          </p>
          <p className="mt-1 text-lg font-semibold tracking-tight">Operador</p>
          {user ? (
            <p className="mt-1 text-xs text-sidebar-muted">
              {roleLabel(user.role)}
            </p>
          ) : null}
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Principal">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={'end' in link ? link.end : false}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  'rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-sidebar-active text-white'
                    : 'text-sidebar-muted hover:bg-white/5 hover:text-white',
                ].join(' ')
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs text-sidebar-muted">
          Producción · operación diaria
        </div>
      </aside>
    </>
  )
}
