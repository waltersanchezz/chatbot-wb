import { QueryClient } from '@tanstack/react-query'

/** Defaults orientados a operación diaria (PS4): menos ruido HTTP, mutaciones sin retry. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
})
