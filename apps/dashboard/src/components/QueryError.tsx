import { EmptyState } from './EmptyState'

interface QueryErrorProps {
  title?: string
  description?: string
  onRetry?: () => void
}

/** Estado de error homogéneo con reintento (PS4). */
export function QueryError({
  title = 'No se pudo cargar la información',
  description = 'Revisa tu conexión o sesión e inténtalo de nuevo.',
  onRetry,
}: QueryErrorProps) {
  return (
    <EmptyState
      title={title}
      description={description}
      actionLabel={onRetry ? 'Reintentar' : undefined}
      onAction={onRetry}
    />
  )
}
