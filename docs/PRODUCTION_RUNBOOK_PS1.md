# Production Runbook — Sprint 1 (Supervivencia + canal WhatsApp seguro)

Checklist operativo para desplegar Rodacenter AI en Render (o equivalente) **sin perder SQLite/idempotencia** y **con webhook firmado**.

## 1. Requisitos previos

1. Plan Render **Starter** (o superior) — el plan Free **no** soporta Persistent Disk.
2. App de Meta (WhatsApp Cloud API) con:
   - Verify Token propio
   - **App Secret** (Settings → Basic)
   - Access Token + Phone Number ID
3. Secretos fuertes generados (no defaults de desarrollo).

## 2. Variables obligatorias en producción

| Variable | Regla |
|----------|--------|
| `NODE_ENV` | `production` |
| `DATA_DIR` | Mount del disco, p.ej. `/var/data` |
| `SQLITE_PATH` | `/var/data/rodacenter.sqlite` |
| `LOG_DIR` | `/var/data/logs` |
| `WHATSAPP_IDEMPOTENCY_PATH` | `/var/data/whatsapp-processed-wamids.json` |
| `JWT_SECRET` | ≥32 caracteres, **no** el default de `.env.example` |
| `AUTH_ADMIN_PASSWORD` | **no** `admin123` |
| `AUTH_REQUIRED` | `true` |
| `WHATSAPP_VERIFY_TOKEN` | distinto del default `rodacenter_verify_token` |
| `WHATSAPP_APP_SECRET` | App Secret de Meta (firma `X-Hub-Signature-256`) |
| `WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Cloud API |

El proceso **falla al boot** si JWT/admin/verify/app secret no cumplen estas reglas (`assertProductionReady`).

## 3. Deploy (Render Blueprint)

1. Aplicar `render.yaml` (plan starter + disk `rodacenter-data` en `/var/data`).
2. En el dashboard, rellenar todos los `sync: false`.
3. Deploy → verificar `GET /health` → 200.
4. En Meta, webhook URL: `https://<host>/webhook/whatsapp` y el mismo Verify Token.
5. Enviar mensaje de prueba desde WhatsApp.

## 4. Checklist post-redeploy (volumen)

Tras un **Manual Deploy** o restart:

- [ ] `GET /health` responde 200.
- [ ] El archivo SQLite sigue en `/var/data/rodacenter.sqlite` (no se recreó vacío sin motivo).
- [ ] `whatsapp-processed-wamids.json` sigue en el disco (idempotencia).
- [ ] Un mensaje WhatsApp con el mismo `wamid` no genera doble respuesta.
- [ ] Un POST al webhook **sin** firma válida → 403.
- [ ] `GET /api/leads` sin Bearer → 401.
- [ ] `GET /api/debug` → 404 (deshabilitado en production).

## 5. Qué no hace este sprint

- CRM InMemory → SQLite (Production Sprint 2).
- Dashboard Vite en producción (PS3).
- Features SaaS nuevas.

## 6. Pruebas locales

```bash
npm run test:production-sprint1
```

Cubre firma HMAC, fail-fast de secretos, rutas protegidas y path durable de idempotencia.
