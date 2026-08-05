# Certificación de producción — Rodacenter AI (Willard / WhatsApp)

**Rol del documento:** evidencia de go/no-go para vender baterías Willard con clientes reales.

**Fecha de cierre técnico:** 2026-08-03 (certificación post PS1–PS4 + fixes P0).

---

## Veredicto

### GO CONDICIONAL — listo para operar si se cumple el smoke en staging/producción

El código está **estable, seguro en boot, recuperable en disco y mantenible** para el canal WhatsApp → asesoría Willard → handoff → panel, **siempre que**:

1. En Render estén configurados todos los `sync: false` (JWT, admin, WA verify/app secret/token/phone id, Telegram).
2. Plan **Starter** (o superior) con disco `/var/data` montado.
3. Se ejecute el **smoke UAT** de la sección final (WA real + Telegram + panel).

Sin ese smoke en el entorno real, el veredicto baja a **NO-GO operativo** (el código no puede certificar tokens Meta/Telegram vivos).

---

## P0 encontrados y corregidos en esta certificación

| P0 | Riesgo | Corrección |
|----|--------|------------|
| WA stub `ok: true` sin credenciales | Cliente sin respuesta, `/health` verde | `WhatsAppCloudProvider` → `ok: false`; prod exige token+phone id |
| Boot prod sin Cloud API / Telegram / disco / auth | Canal muerto o APIs abiertas | `assertProductionReady` ampliado |
| Handoff silencioso (sin categoría) | “Asesor te contacta” sin lead/Telegram | `LeadService` crea lead en handoff; error path captura lead |
| Console messaging en prod | Stub local | DI lanza si faltan credenciales en production |
| `tsc` fallaba (`npm run build`) | Deploy Render imposible | Errores de tipos en engines/SQLite/HTTP corregidos (sin cambiar lógica de negocio) |

---

## Evidencia automatizada

```bash
npm run test:certification          # 50 tests PS1–PS4 + certificación P0
npx vitest run tests/willard tests/crm   # 501 tests OK (2026-08-03)
npm run build && npm run dashboard:build # tsc + Vite dist OK
```

Cobertura de guardrails: `productionGuard`, firma WA (PS1), CRM reopen (PS2), panel (PS3), Telegram retry (PS4), certificación P0.

---

## Checklist de negocio (roadmap §7)

| Criterio | Estado código | Estado ops |
|----------|---------------|------------|
| Asesoría baterías sin inventar refs | OK (orchestrator + catálogo) | Smoke WA |
| Redeploy no borra sesiones/leads | OK (disco + SQLite CRM) | Verificar volume Render |
| Webhook rechaza no firmados | OK | App Secret en Render |
| Handoff Telegram + panel | OK (retry + lead en handoff) | Tokens Telegram |
| Panel post-login con datos reales | OK (`/dashboard`) | Login admin fuerte |
| APIs CRM no públicas | OK (`AUTH_REQUIRED`) | No override `false` |
| Suite Willard en CI | OK (`.github/workflows/ci.yml`) | CI verde en main |

---

## Smoke UAT obligatorio antes del primer cliente (ops)

1. `GET /health` → 200  
2. Meta webhook verify → 200  
3. Mensaje real WhatsApp → respuesta con recomendación Willard  
4. Flujo hasta handoff → lead en panel + mensaje Telegram  
5. Redeploy → lead y conversación siguen  
6. Login `/dashboard` → Conversaciones/Clientes con datos  
7. POST webhook sin firma → 403  

---

## Fuera de alcance (aceptado para GO condicional)

- RBAC API 403 (solo UI Admin/Operador)  
- Multi-instancia / Redis  
- SaaS Billing/Marketplace  
- Postgres  

---

## Mantenibilidad

Arquitectura limpia (Domain → Application → Infrastructure → HTTP/DI). Motores Willard desacoplados del CRM SQLite y del panel. Runbooks: `PRODUCTION_RUNBOOK_PS1` … `PS4`.
