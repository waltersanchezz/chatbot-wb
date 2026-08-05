import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ToastContext, type ToastItem, type ToastTone } from './ToastContext'

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-ok/40 bg-ok/10 text-ok',
  error: 'border-danger/40 bg-danger/10 text-danger',
  info: 'border-accent/40 bg-accent-soft text-accent',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setToasts((prev) => [...prev.slice(-4), { ...toast, id }])
      window.setTimeout(() => dismiss(id), 4_500)
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title: string, description?: string) =>
        push({ tone: 'success', title, description }),
      error: (title: string, description?: string) =>
        push({ tone: 'error', title, description }),
      info: (title: string, description?: string) =>
        push({ tone: 'info', title, description }),
    }),
    [toasts, push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={[
              'pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-lg backdrop-blur',
              TONE_CLASS[toast.tone],
            ].join(' ')}
            role="status"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs opacity-90">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-xs font-medium opacity-70 hover:opacity-100"
              >
                Cerrar
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
