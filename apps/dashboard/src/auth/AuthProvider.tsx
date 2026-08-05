import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  fetchMe,
  loginRequest,
  logoutRequest,
  type AuthUser,
} from '../api/authApi'
import { getAccessToken, setAccessToken } from '../api/http'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => getAccessToken())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const stored = getAccessToken()
      if (!stored) {
        if (!cancelled) {
          setUser(null)
          setToken(null)
          setLoading(false)
        }
        return
      }
      try {
        const me = await fetchMe()
        if (!cancelled) {
          setUser(me)
          setToken(stored)
        }
      } catch {
        setAccessToken(null)
        if (!cancelled) {
          setUser(null)
          setToken(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()

    const onExpired = () => {
      setUser(null)
      setToken(null)
    }
    window.addEventListener('rodacenter:session-expired', onExpired)

    return () => {
      cancelled = true
      window.removeEventListener('rodacenter:session-expired', onExpired)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password)
    setAccessToken(result.token)
    setToken(result.token)
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      setAccessToken(null)
    }
    setToken(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, login, logout }),
    [user, token, loading, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
