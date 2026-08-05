import type { ReactNode } from 'react'

interface CardProps {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function Card({
  title,
  description,
  action,
  children,
  className = '',
}: CardProps) {
  return (
    <section
      className={`rounded-xl border border-line bg-panel shadow-[0_1px_0_rgba(15,23,32,0.04)] ${className}`}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-ink">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-1 text-sm text-ink-muted">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}
