import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Loading } from '../components/Loading'
import { useAuth } from './useAuth'

export function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loading label="Verificando sesión…" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
