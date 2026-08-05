import { createContext } from 'react'

export type RealtimeStatus = 'connecting' | 'open' | 'closed' | 'error'

export interface RealtimeContextValue {
  status: RealtimeStatus
  lastEventType: string | null
  lastEventAt: string | null
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null)
