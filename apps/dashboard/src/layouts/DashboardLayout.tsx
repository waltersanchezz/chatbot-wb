import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'
import { Topbar } from '../components/Topbar'

const titles: Record<string, { title: string; subtitle: string }> = {
  '/': {
    title: 'Inicio',
    subtitle: 'Resumen del día · prioridades comerciales',
  },
  '/conversaciones': {
    title: 'Conversaciones',
    subtitle: 'Bandeja WhatsApp · casos para atender',
  },
  '/clientes': {
    title: 'Clientes',
    subtitle: 'Directorio de contactos y vehículos',
  },
  '/vehiculos': {
    title: 'Vehículos',
    subtitle: 'Lo más consultado por tus clientes',
  },
  '/historial': {
    title: 'Historial',
    subtitle: 'Actividad reciente ordenada por última interacción',
  },
  '/configuracion': {
    title: 'Configuración',
    subtitle: 'Identidad y datos de la empresa',
  },
}

export function DashboardLayout() {
  const { pathname } = useLocation()
  const [navOpen, setNavOpen] = useState(false)
  const meta = titles[pathname] ?? {
    title: 'Operador',
    subtitle: 'Rodacenter Manizales',
  }

  return (
    <div className="flex h-full min-h-screen bg-surface">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={meta.title}
          subtitle={meta.subtitle}
          onOpenNav={() => setNavOpen(true)}
        />
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
