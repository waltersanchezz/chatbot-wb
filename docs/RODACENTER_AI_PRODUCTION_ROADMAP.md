# Rodacenter AI — Roadmap de Producción

**Fecha:** 2026-08-03  
**Enfoque:** Producción operativa para **venta de baterías Willard por WhatsApp** (Rodacenter Manizales)  
**No es:** construcción de SaaS multi-tenant mundial  
**Fuente:** `RODACENTER_AI_PRODUCTION_AUDIT.md` + re-priorización arquitectónica  
**Regla:** cero features nuevas · cero módulos nuevos · cero APIs comerciales nuevas  

---

## 1. Norte del producto (producción)

### Qué debe funcionar de punta a punta

```text
Cliente WhatsApp
  → Webhook seguro + idempotencia durable
    → ConversationEngine / Orchestrator (baterías)
      → Recomendación Willard + handoff asesor
        → Persistencia de sesión + CRM durable
          → Panel del operador (conversaciones, clientes, tareas)
            → Alerta Telegram al asesor
```

### Qué NO entra en este roadmap

| Excluido | Motivo |
|----------|--------|
| Multi-tenant SaaS / login por tenant comercial | Un solo negocio: Rodacenter |
| API Keys enforcement / Developer Platform | No aporta a la venta WA |
| Stripe / Billing de cobro | No bloquea asesorar baterías |
| Marketplace / Copilot LLM / Integration Hub real | Beta; no críticos |
| Pipeline Kanban / Workflow DnD / OpenAPI | No indispensables |
| Escala horizontal / Redis / workers | Single-instance basta |
| MFA / SSO / i18n / búsqueda semántica | Versiones futuras |

Estas piezas **pueden quedarse en el código** (congeladas), pero **no se invierte sprint** en ellas hasta que el canal de baterías esté sólido.

---

## 2. Principios de priorización

1. **Supervivencia de datos** antes que polish UI.
2. **Integridad del canal WhatsApp** antes que features de panel.
3. **Cambios contenidos y testeables** antes que migraciones grandes.
4. **Un solo tenant, un solo proceso Node** — asumir límites y documentarlos.
5. **Operador mínimo viable**: ver conversación, lead y handoff — no 14 módulos.

---

## 3. Fases de producción

### FASE 1 — Infraestructura crítica

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Que un redeploy / reinicio **no borre** SQLite, logs de idempotencia ni configuración; arranque de producción a prueba de secretos débiles. |
| **Riesgo que elimina** | Pérdida total de sesiones/learning/dashboard SQLite y de wamids procesados en Render free; arranque con JWT/admin por defecto. |
| **Tiempo estimado** | **2–3 días** |
| **Prioridad** | **P0 — Bloqueante** |
| **Archivos afectados** | `render.yaml`, `src/infrastructure/config/env.ts`, `.env.example`, `src/main.ts` (validación boot), posiblemente `docs/` runbook |
| **Dependencias** | Cuenta Render con **disco persistente** (o plan con volume) o path externo montado; variables `SQLITE_PATH`, `LOG_DIR`, JWT, WhatsApp |
| **Pruebas necesarias** | Boot con secretos débiles → debe fallar en `NODE_ENV=production`; restart del servicio conserva archivo SQLite e idempotencia; `/health` OK |
| **Criterio de terminado** | Disco/volumen documentado y cableado; `SQLITE_PATH` y archivo de wamids en path persistente; producción **rechaza** JWT/admin por defecto; checklist de env completo en `.env.example` |

---

### FASE 2 — Seguridad del canal y perímetro

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | WhatsApp solo acepta payloads firmados por Meta; APIs sensibles dejan de ser públicas; logs no vuelcan PII cruda. |
| **Riesgo que elimina** | Spoofing de webhook, lectura/escritura abierta de leads/clientes/chat/logs, fuga de datos en consola. |
| **Tiempo estimado** | **3–4 días** |
| **Prioridad** | **P0 — Bloqueante** |
| **Archivos afectados** | `src/presentation/http/routes/whatsappRoutes.ts`, `createApp.ts`, `whatsappAuditRoutes.ts`, `env.ts` (`WHATSAPP_APP_SECRET`), logger/middleware HTTP |
| **Dependencias** | Fase 1 (env/secretos); App Secret de Meta configurado en Render |
| **Pruebas necesarias** | POST sin firma → 401/403; firma válida → 200; rutas `/api/leads`, `/customers`, `/chat`, `/logs` requieren auth (o deshabilitadas en prod); `/api/debug` off en prod; tests unitarios de verificación de firma |
| **Criterio de terminado** | Firma `X-Hub-Signature-256` obligatoria en prod; superficie pública reducida a `/health` + `/webhook/whatsapp`; payload WA no se loguea completo |

---

### FASE 3 — Persistencia de negocio (CRM + canal)

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Leads, clientes, conversaciones CRM, perfiles de vehículo e interacciones **sobreviven reinicios**, alineados con el panel y el flujo WhatsApp. |
| **Riesgo que elimina** | “CRM fantasma”: el bot recuerda sesión SQLite pero el operador pierde leads/clientes al redeploy. |
| **Tiempo estimado** | **5–8 días** |
| **Prioridad** | **P0 — Bloqueante** |
| **Archivos afectados** | `container.ts`; nuevos o adaptados repos SQLite para Customer/Lead/Conversation/Interaction/VehicleProfile (puertos en `domain/ports`); tests `tests/crm/*`, `tests/willard/*` de wiring; posiblemente sync con `SQLiteClientRepository` / `SQLiteConversationRepository` del dashboard |
| **Dependencias** | Fase 1 (disco); idealmente Fase 2 ya en curso o hecha |
| **Pruebas necesarias** | CRUD CRM + restart simulado (reabrir DB); tenant único `rodacenter`; regresión `HandleIncomingMessage` + lead/handoff; conversaciones/clientes API siguen respondiendo con datos persistidos |
| **Criterio de terminado** | Cero `InMemory*Repository` de CRM en el path de producción; prueba documentada “reiniciar proceso → lead y conversación siguen ahí”; suite CRM + willard verde |

**Nota de diseño:** Preferir **SQLite en el mismo archivo** ya persistente (menor riesgo) sobre migrar a Postgres ahora. Postgres queda fuera de este roadmap.

---

### FASE 4 — Dashboard de producción (operador mínimo)

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | El asesor usa un panel **realmente desplegado** con: login seguro, Conversaciones, Clientes, Tareas/handoff, Configuración básica. Módulos Beta ocultos o claramente marcados y no bloqueantes. |
| **Riesgo que elimina** | Panel Vite inaccesible en prod; operadores sin visibilidad; módulos mock confundidos con producto. |
| **Tiempo estimado** | **4–6 días** |
| **Prioridad** | **P0/P1** (P0 el deploy; P1 el recorte de nav) |
| **Archivos afectados** | `createApp.ts` / `dashboardRoutes.ts` (servir `apps/dashboard/dist`), `apps/dashboard` build scripts, root `package.json`, `Sidebar.tsx` (nav mínimo), `AuthProvider` / OnboardingGate (fail-closed + 401), login UI (sin credenciales demo) |
| **Dependencias** | Fase 3 (datos reales); Fase 2 (auth en APIs) |
| **Pruebas necesarias** | Build dashboard + servir bajo la misma origin; login → conversaciones con datos post-restart; 401 limpia sesión; módulos Beta no rompen el flujo si fallan |
| **Criterio de terminado** | URL de producción abre el panel Vite; menú operador = Inicio, Conversaciones, Clientes, Tareas (o equivalente), Configuración; resto oculto o carpeta “Experimental”; smoke E2E manual documentado |

**Fuera de fase:** Kanban, Developer, Marketplace, Copilot, Integraciones, Observability completa, Billing — no se desarrollan; solo se ocultan o se dejan inaccesibles en prod.

---

### FASE 5 — Experiencia del operador y cierre comercial

| Campo | Contenido |
|-------|-----------|
| **Objetivo** | Handoff confiable a Telegram/asesor; Home sin mocks; RBAC mínimo (asesor vs admin); mobile usable para conversaciones; regresión Willard en CI. |
| **Riesgo que elimina** | Handoff silencioso; KPIs falsos; asesores con permisos de admin; imposibilidad de operar desde el teléfono; regresiones del motor de baterías. |
| **Tiempo estimado** | **4–6 días** |
| **Prioridad** | **P1** |
| **Archivos afectados** | `NotificationService` / Telegram wiring, `HomePage.tsx` (quitar mocks), `authMiddleware` + Sidebar por rol, layout móvil mínimo (drawer solo nav operador), CI (GitHub Actions o script), tests willard en pipeline |
| **Dependencias** | Fases 1–4 |
| **Pruebas necesarias** | Handoff genera notificación Telegram en staging; rol LECTURA/ASESOR no ve configuración sensible; CI corre `test:willard` + build; checklist UAT baterías (marca/modelo → recomendación → handoff) |
| **Criterio de terminado** | UAT firmado por negocio: “puedo vender/atender baterías por WA y el asesor ve el caso en el panel”; CI verde en main |

---

## 4. Vista temporal consolidada

```text
Semana 1        FASE 1 + FASE 2 (inicio)
Semana 2        FASE 2 (cierre) + FASE 3 (inicio)
Semana 3–4      FASE 3 (cierre) + FASE 4
Semana 5        FASE 5 + UAT
```

**Total estimado a producto operable:** **~4–5 semanas** (1 engineer full-time) o **~3 semanas** (2 engineers).

---

## 5. Primer sprint de producción (ejecutar ahora)

### Nombre

**Production Sprint 1 — Supervivencia del sistema y canal WhatsApp seguro**

### Por qué es el primero (máximo impacto / menor riesgo)

| Criterio | Evaluación |
|----------|------------|
| Impacto | Sin disco + sin firma + APIs abiertas, **cualquier cliente real está en riesgo inmediato** (pérdida de datos y ataques). |
| Riesgo de cambio | Cambios **contenidos** en config, webhook y middleware — **no** toca ConversationEngine ni motores Willard. |
| Dependencias | No requiere migrar CRM todavía. |
| Valor de negocio | Permite seguir operando WA con confianza mientras se prepara la Fase 3. |

Migrar el CRM completo **antes** de asegurar disco y webhook sería alto esfuerzo y seguiría perdiendo datos/seguridad en cada deploy.

### Alcance del Sprint 1 (IN)

1. Disco/volumen persistente + `SQLITE_PATH` / idempotencia en path durable (`render.yaml`, env).
2. Fail-fast en producción si JWT/admin son defaults inseguros (`env.ts` / boot).
3. `.env.example` y runbook mínimo de variables de producción.
4. Verificación `X-Hub-Signature-256` en POST webhook (con `WHATSAPP_APP_SECRET`).
5. Cerrar o proteger `/api/leads`, `/api/customers`, `/api/chat`, `/api/logs`; deshabilitar `/api/debug` en prod.
6. Dejar de loguear el body completo del webhook (redacción).
7. Pruebas automatizadas de firma + auth de rutas + checklist de restart con volumen.

### Explicitamente OUT del Sprint 1

- Migración CRM InMemory → SQLite (Fase 3).
- Deploy del dashboard Vite (Fase 4).
- RBAC fino, mobile, Home mocks (Fase 5).
- Cualquier feature SaaS / Copilot / Billing / Marketplace.

### Resultado esperado al cerrar Sprint 1

> “El bot de baterías en WhatsApp puede recibir mensajes de forma segura; los datos SQLite e idempotencia no se pierden al redeploy; no hay APIs CRM abiertas a internet; el arranque de producción exige secretos reales.”

### Estimación Sprint 1

**3–5 días hábiles** · Prioridad **P0** · Dependencia: acceso a Render + App Secret de Meta.

---

## 6. Orden de sprints siguientes (preview)

| Sprint | Fase | Foco |
|--------|------|------|
| **PS1** (este) | 1 + 2 | Supervivencia + canal seguro |
| **PS2** | 3 | CRM durable en SQLite |
| **PS3** | 4 | Panel operador desplegado (nav mínima) |
| **PS4** | 5 | Handoff, UAT baterías, CI, RBAC mínimo |

---

## 7. Criterio global de “listo para clientes reales”

Checklist de negocio (todos deben ser sí):

- [ ] Cliente escribe por WhatsApp y recibe asesoría de baterías sin inventar referencias.
- [ ] Redeploy no borra sesiones ni leads.
- [ ] Webhook rechaza requests no firmados.
- [ ] Asesor recibe handoff (Telegram o panel) y puede abrir el caso.
- [ ] Panel de producción muestra conversaciones/clientes reales tras login.
- [ ] No hay endpoints CRM públicos sin autenticación.
- [ ] Suite Willard + pruebas de firma/auth en CI o script de release.

Cuando ese checklist esté completo, Rodacenter AI está en **producción operativa de venta de baterías** — no en SaaS mundial, y eso es suficiente para el objetivo actual.

---

*Documento vivo de la fase PRODUCCIÓN. Congelar features hasta cerrar PS1–PS4.*
