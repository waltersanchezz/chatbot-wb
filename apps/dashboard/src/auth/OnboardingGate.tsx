import { useQuery } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { fetchOnboardingStatus } from '../api/onboardingApi'
import { Loading } from '../components/Loading'
import { useAuth } from './useAuth'

/**
 * Si el tenant no completó instalación → Wizard.
 * Fail-closed: error de onboarding no abre el panel a ciegas.
 */
export function OnboardingGate() {
  const { user, loading: authLoading } = useAuth()
  const location = useLocation()
  const onboardingQuery = useQuery({
    queryKey: ['api', 'onboarding'],
    queryFn: fetchOnboardingStatus,
    enabled: Boolean(user),
    retry: 1,
  })

  if (authLoading || (user && onboardingQuery.isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loading label="Preparando espacio de trabajo…" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (onboardingQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="max-w-md rounded-xl border border-danger/30 bg-danger/5 px-5 py-4 text-sm text-danger">
          No se pudo verificar el estado de instalación.
          <button
            type="button"
            className="mt-3 block text-sm font-medium text-accent underline"
            onClick={() => void onboardingQuery.refetch()}
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const completed = onboardingQuery.data?.completed === true
  const onWizard = location.pathname.startsWith('/onboarding')

  if (!completed && !onWizard) {
    return <Navigate to="/onboarding" replace />
  }

  if (completed && onWizard) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
