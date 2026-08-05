import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './useAuth'
import { canAccessSettings } from './roles'

/** Bloquea rutas de administración a roles Operador (UI RBAC PS4). */
export function AdminRoute() {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!canAccessSettings(user?.role)) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
