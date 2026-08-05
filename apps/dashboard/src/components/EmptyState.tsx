interface EmptyStateProps {
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-ink-muted">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-ink/90"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
