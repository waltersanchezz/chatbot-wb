import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import {
  RealtimeContext,
  type RealtimeStatus,
} from './RealtimeContext'
import {
  invalidateForRealtimeEvent,
  REALTIME_EVENT_TYPES,
  type RealtimeEventType,
} from './eventMap'

interface RealtimeProviderProps {
  children: ReactNode
  /** Override URL base (tests). Por defecto `/events`. */
  url?: string
}

function isRealtimeEventType(value: string): value is RealtimeEventType {
  return (REALTIME_EVENT_TYPES as readonly string[]).includes(value)
}

/**
 * SSE con reconexión controlada (PS4).
 * EventSource reintenta solo; aquí reabrimos con backoff si queda CLOSED.
 */
export function RealtimeProvider({
  children,
  url = '/events',
}: RealtimeProviderProps) {
  const queryClient = useQueryClient()
  const { token } = useAuth()
  const [status, setStatus] = useState<RealtimeStatus>('closed')
  const [lastEventType, setLastEventType] = useState<string | null>(null)
  const [lastEventAt, setLastEventAt] = useState<string | null>(null)
  const [reconnectTick, setReconnectTick] = useState(0)
  const backoffRef = useRef(1_000)

  useEffect(() => {
    if (!token) {
      setStatus('closed')
      return
    }

    let closedByUs = false
    let reconnectTimer: number | undefined
    const sep = url.includes('?') ? '&' : '?'
    const sourceUrl = `${url}${sep}access_token=${encodeURIComponent(token)}`
    const source = new EventSource(sourceUrl)
    setStatus('connecting')

    source.onopen = () => {
      setStatus('open')
      backoffRef.current = 1_000
    }

    source.onerror = () => {
      if (closedByUs) return
      if (source.readyState === EventSource.CLOSED) {
        setStatus('error')
        const delay = backoffRef.current
        backoffRef.current = Math.min(delay * 2, 15_000)
        reconnectTimer = window.setTimeout(() => {
          setReconnectTick((n) => n + 1)
        }, delay)
      } else {
        setStatus('error')
      }
    }

    const onNamedEvent = (event: MessageEvent) => {
      const type = event.type
      if (!isRealtimeEventType(type)) return
      setLastEventType(type)
      setLastEventAt(new Date().toISOString())
      invalidateForRealtimeEvent(queryClient, type)
    }

    for (const type of REALTIME_EVENT_TYPES) {
      source.addEventListener(type, onNamedEvent as EventListener)
    }

    return () => {
      closedByUs = true
      if (reconnectTimer) window.clearTimeout(reconnectTimer)
      for (const type of REALTIME_EVENT_TYPES) {
        source.removeEventListener(type, onNamedEvent as EventListener)
      }
      source.close()
      setStatus('closed')
    }
  }, [queryClient, url, token, reconnectTick])

  const value = useMemo(
    () => ({ status, lastEventType, lastEventAt }),
    [status, lastEventType, lastEventAt],
  )

  return (
    <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>
  )
}
