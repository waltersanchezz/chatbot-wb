# Rodacenter Dashboard (Fase 2 · MVP)

Proyecto web independiente (Fase 2).

- **Inicio**: métricas reales vía `GET /api/dashboard` (proxy → backend Express).
- **Resto de páginas**: datos mock.

## Stack

- React + TypeScript
- Vite
- Tailwind CSS v4
- React Router
- TanStack Query

## Cómo ejecutar

1. Backend (raíz del monorepo):

```bash
npm run dev
```

2. Dashboard:

```bash
cd apps/dashboard
npm install
npm run dev
```

Abrir `http://localhost:5173` (proxy `/api` → `http://127.0.0.1:3000`).

## Build

```bash
npm run build
npm run preview
```
