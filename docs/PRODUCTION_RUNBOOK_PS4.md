# Production Runbook — Sprint 4 (Operación diaria)

## Handoff Telegram

1. Configurar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en Render.
2. Flujo WA → lead/handoff → `NotificationService` reintenta hasta 3 veces ante fallos transitorios.
3. Si credenciales vacías: no envía (fail-soft); el lead permanece en el panel.

## RBAC UI (Administrador / Operador)

| Rol JWT | Etiqueta panel | Configuración |
|---------|----------------|---------------|
| `ADMIN` | Administrador | Visible y editable |
| `ASESOR` / `LECTURA` | Operador | Oculta; ruta redirige a Inicio |

La UI oculta Configuración a Operador. No se cambiaron contratos de auth PS1.

## UAT baterías (checklist)

- [ ] Cliente escribe marca/modelo/año por WhatsApp.
- [ ] Recibe recomendación Willard sin inventar referencias.
- [ ] Handoff genera alerta Telegram (staging).
- [ ] Operador ve el caso en Conversaciones / Clientes tras login.
- [ ] Indicadores API / En vivo visibles en el topbar.
- [ ] En móvil, el menú drawer abre las 5–6 secciones del operador.

## CI

GitHub Actions (`.github/workflows/ci.yml`) ejecuta typecheck, PS1–PS4, suite Willard+CRM y builds.
