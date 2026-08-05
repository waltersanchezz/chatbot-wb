interface LoadingProps {
  label?: string
}

export function Loading({ label = 'Cargando…' }: LoadingProps) {
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-3 text-ink-muted"
      role="status"
      aria-live="polite"
    >
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
    </div>
  )
}
