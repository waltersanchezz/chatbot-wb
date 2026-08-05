import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { queryClient } from './lib/queryClient'
import { RealtimeProvider } from './realtime/RealtimeProvider'
import { ToastProvider } from './ui/toast/ToastProvider'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <RealtimeProvider>
            <App />
          </RealtimeProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
