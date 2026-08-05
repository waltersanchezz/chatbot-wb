import { createContext } from 'react'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: string
  tone: ToastTone
  title: string
  description?: string
}

export interface ToastContextValue {
  toasts: ToastItem[]
  push: (toast: Omit<ToastItem, 'id'>) => void
  dismiss: (id: string) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
