import { apiFetch, setAccessToken } from './http'

export type UserRole = 'ADMIN' | 'ASESOR' | 'LECTURA'

export interface AuthUser {
  userId: string
  tenantId: string
  role: UserRole
  name: string
  email: string
}

export interface LoginResult {
  token: string
  user: AuthUser
}

export async function loginRequest(
  email: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `Login ${res.status}`)
  }
  return (await res.json()) as LoginResult
}

export async function logoutRequest(): Promise<void> {
  await apiFetch('/api/logout', { method: 'POST' })
  setAccessToken(null)
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await apiFetch('/api/me')
  if (!res.ok) throw new Error(`Me ${res.status}`)
  return (await res.json()) as AuthUser
}
