# Production Runbook — Sprint 3 (Panel operador Vite)

## Despliegue

1. Build producción: `npm run build:production` (o en Render el `buildCommand` ya incluye `dashboard:build`).
2. Verificar que exista `apps/dashboard/dist/index.html`.
3. Arrancar API: `npm start`.
4. Abrir `https://<host>/dashboard/` → login → Inicio.

## Smoke E2E manual

- [ ] Sin token → redirige a `/dashboard/login`.
- [ ] Login con credenciales de producción (no defaults en prod).
- [ ] Menú: Inicio, Conversaciones, Clientes, Vehículos, Historial, Configuración.
- [ ] No aparecen módulos Beta (Copilot, Billing, etc.).
- [ ] Conversaciones / Clientes muestran datos SQLite (no mocks).
- [ ] 401 en API limpia sesión y vuelve a login.
- [ ] Móvil: botón menú abre drawer de navegación.

## Desarrollo local

```bash
# Terminal 1 — API
npm run dev

# Terminal 2 — Vite (proxy /api → :3000)
npm run dashboard:dev
# Abrir http://127.0.0.1:5173/dashboard/
```
