import type { QueryClient } from '@tanstack/react-query'

export const REALTIME_EVENT_TYPES = [
  'conversation.created',
  'conversation.updated',
  'client.created',
  'pipeline.updated',
  'task.updated',
  'analytics.updated',
] as const

export type RealtimeEventType = (typeof REALTIME_EVENT_TYPES)[number]

/**
 * Cada evento invalida solo las queries de su pantalla.
 * No hace reload de la app.
 */
export function invalidateForRealtimeEvent(
  queryClient: QueryClient,
  type: RealtimeEventType,
): void {
  switch (type) {
    case 'conversation.created':
    case 'conversation.updated':
      void queryClient.invalidateQueries({ queryKey: ['api', 'conversations'] })
      void queryClient.invalidateQueries({
        queryKey: ['api', 'conversation-detail'],
      })
      void queryClient.invalidateQueries({ queryKey: ['api', 'clients'] })
      void queryClient.invalidateQueries({ queryKey: ['api', 'client-detail'] })
      void queryClient.invalidateQueries({ queryKey: ['api', 'dashboard'] })
      break
    case 'client.created':
      void queryClient.invalidateQueries({ queryKey: ['api', 'clients'] })
      void queryClient.invalidateQueries({ queryKey: ['api', 'client-detail'] })
      void queryClient.invalidateQueries({ queryKey: ['api', 'dashboard'] })
      break
    case 'pipeline.updated':
      void queryClient.invalidateQueries({ queryKey: ['api', 'pipeline'] })
      break
    case 'task.updated':
      void queryClient.invalidateQueries({ queryKey: ['api', 'tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['api', 'dashboard'] })
      break
    case 'analytics.updated':
      void queryClient.invalidateQueries({ queryKey: ['api', 'analytics'] })
      break
  }
}
