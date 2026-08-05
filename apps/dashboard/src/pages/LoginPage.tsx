import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from &&
    (location.state as { from?: string }).from !== '/login'
      ? (location.state as { from: string }).from
      : '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string
    password?: string
  }>({})
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return

    const nextErrors: { email?: string; password?: string } = {}
    if (!email.trim()) nextErrors.email = 'Ingresa tu email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = 'Email no válido.'
    }
    if (!password) nextErrors.password = 'Ingresa tu contraseña.'

    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setError(null)
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,#f3e4d8_0%,transparent_45%),radial-gradient(ellipse_at_90%_80%,#e8eef3_0%,transparent_40%),linear-gradient(160deg,#f7f4f0_0%,#eef2f5_55%,#e7ebe8_100%)]"
      />
      <div className="relative w-full max-w-md">
        <p className="font-mono text-xs tracking-[0.2em] text-ink-muted uppercase">
          Rodacenter
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
          Iniciar sesión
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Acceso al panel de operación de Rodacenter AI.
        </p>

        <form
          onSubmit={onSubmit}
          noValidate
          className="mt-8 space-y-4 rounded-2xl border border-line bg-panel/90 p-6 shadow-[0_20px_60px_rgba(15,23,32,0.08)] backdrop-blur"
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">Email</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(fieldErrors.email)}
              className={[
                'w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink outline-none ring-accent/30 focus:ring-2',
                fieldErrors.email ? 'border-danger' : 'border-line',
              ].join(' ')}
            />
            {fieldErrors.email ? (
              <span className="text-xs text-danger">{fieldErrors.email}</span>
            ) : null}
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-ink">Contraseña</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(fieldErrors.password)}
              className={[
                'w-full rounded-lg border bg-surface px-3 py-2.5 text-sm text-ink outline-none ring-accent/30 focus:ring-2',
                fieldErrors.password ? 'border-danger' : 'border-line',
              ].join(' ')}
            />
            {fieldErrors.password ? (
              <span className="text-xs text-danger">{fieldErrors.password}</span>
            ) : null}
          </label>

          {error ? (
            <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
