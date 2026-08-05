import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Servido por Express en /dashboard (misma origin que las APIs).
export default defineConfig({
  base: '/dashboard/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
      '/events': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
