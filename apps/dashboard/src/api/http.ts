const TOKEN_KEY = 'rodacenter_auth_token'

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function authHeaders(): HeadersInit {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function loginPath(): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}login`
}

/**
 * Fetch autenticado. En 401 limpia token y redirige a login (PS1 auth, fail-closed).
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getAccessToken()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    const isAuthEndpoint =
      input.includes('/api/login') || input.includes('/api/me')
    setAccessToken(null)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('rodacenter:session-expired'))
    }
    if (
      !isAuthEndpoint &&
      typeof window !== 'undefined' &&
      !window.location.pathname.endsWith('/login')
    ) {
      window.location.assign(loginPath())
    }
  }

  return res
}
