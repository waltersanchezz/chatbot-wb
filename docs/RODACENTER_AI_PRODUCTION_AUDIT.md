# Rodacenter AI — Auditoría de producción

**Fecha:** 2026-08-03  
**Alcance:** Auditoría integral (Product Manager Senior · QA Lead · Software Architect)  
**Producto:** Rodacenter AI — WhatsApp Business + Dashboard SaaS  
**Repositorio:** `chatbot-wb`  
**Despliegue actual:** Render (`rodacenter-ai`, plan free) + WhatsApp Cloud API  

**No incluye desarrollo de código.** Solo diagnóstico, madurez y plan priorizado.

---

## Resumen ejecutivo

Rodacenter AI tiene un **núcleo conversacional Willard maduro** (recomendación de baterías, orquestación, recovery, persistencia de sesión, pruebas amplias) y un **dashboard SaaS amplio** (Knowledge, Automations, Workflows, Billing, Marketplace, Copilot, Integrations, Observability, Developer) con APIs reales y cobertura Vitest alta por módulo.

Sin embargo, el producto **no está listo para un lanzamiento SaaS multi-tenant ni para producción comercial robusta**. Los bloqueantes principales son:

1. **CRM en memoria** (leads/clientes/conversaciones se pierden al reiniciar).
2. **Disco efímero en Render free** (SQLite + idempotencia WhatsApp se pierden en redeploy).
3. **Huecos de seguridad** (APIs públicas sensibles, sin firma Meta en webhook, secretos por defecto, API keys sin enforcement, tenancy spoofable).
4. **Dashboard Vite desconectado** del static que sirve Express; sin navegación móvil; RBAC no aplicado.
5. **Capas SaaS simuladas** (billing sin pagos, conectores mock, Copilot rule-based, acciones de automation sin side-effects reales).

| Escenario | Madurez global |
|-----------|----------------|
| Asesor WhatsApp single-tenant (baterías) en operación controlada | **~55%** |
| Dashboard interno / staging | **~50%** |
| SaaS multi-tenant listo para clientes de pago | **~28%** |

**Recomendación:** no salir a producción como plataforma SaaS. Mantener operación WhatsApp single-tenant solo con endurecimiento P0 de seguridad y persistencia. Completar backlog P0+P1 antes de comercializar el panel.

---

## Scorecard de madurez (0–100%)

| # | Área | Madurez | Veredicto |
|---|------|---------|-----------|
| 1 | Arquitectura | 72% | Sólida Clean Architecture; deuda en migraciones y CRM |
| 2 | Backend | 60% | APIs amplias; split brain memoria/SQLite |
| 3 | Frontend | 55% | Vite app rica; deploy y mobile rotos |
| 4 | Dashboard | 55% | Feature-complete MVP; no launch-ready |
| 5 | CRM | 40% | Dominio+API; persistencia in-memory |
| 6 | Chatbot | 78% | Fortaleza del producto |
| 7 | WhatsApp | 65% | Operativo; falta firma y escala |
| 8 | IA | 45% | Rule-based + stubs; Copilot mock |
| 9 | Base de conocimiento | 75% | Willard + Knowledge Manager |
| 10 | Flujo baterías | 85% | Mejor capa del sistema |
| 11 | Panel administrativo | 50% | Muchas secciones; roles/pipeline faltan |
| 12 | Autenticación | 45% | JWT existe; RBAC y aislamiento débiles |
| 13 | Seguridad | 35% | Bloqueante |
| 14 | Base de datos | 45% | SQLite ad-hoc; no Postgres |
| 15 | APIs | 70% | Superficie amplia; auth inconsistente |
| 16 | Integraciones | 35% | Hub mock; Telegram real parcial |
| 17 | UX | 55% | Flujos útiles; mocks y gaps |
| 18 | UI | 50% | Tokens inconsistentes; mobile pobre |
| 19 | Performance | 50% | OK single-node; no medido a escala |
| 20 | Escalabilidad | 30% | Single-process assumptions |

---

## 1. Arquitectura

**Estado actual:** Clean Architecture (`domain` / `application` / `infrastructure` / `presentation`) con DI manual en `container.ts`. Capas SaaS desacopladas (Sprints 13–22) que consumen APIs públicas sin tocar motores Willard.

**Madurez:** 72%

**Funciona:**
- Separación clara de puertos/adaptadores.
- Orquestador de baterías desacoplado del canal.
- EventBus in-memory para automation/billing/realtime.
- Tests de wiring y módulos dashboard.

**Falta:**
- Migraciones versionadas (solo `CREATE TABLE IF NOT EXISTS` por repo).
- `schema.sql` Postgres aspiracional no ejecutado.
- Unificación CRM + sesión en un solo store persistente.
- Documentación de arquitectura actualizada al roadmap SaaS (roadmap a julio 2026 desfasado).

**Riesgos:**
- Dos mundos de datos (InMemory CRM vs SQLite dashboard/sesión).
- Duplicación de defaults `:memory:` en `createApp` vs container.

**Antes de producción:** congelar diagrama de despliegue, adoptar migraciones, eliminar dualidad memoria/SQLite para entidades de negocio.

---

## 2. Backend

**Estado actual:** Express + Node 24, Zod env, Helmet, CORS abierto, logger JSON + muchos `console.log`.

**Madurez:** 60%

**Funciona:**
- Use-case `HandleIncomingMessage` con timeouts y métricas.
- Hardening de errores controlados (`Result` / mensajes amigables).
- Cobertura Vitest fuerte en motores y APIs dashboard.

**Falta:**
- Rate limiting.
- OpenTelemetry / métricas exportables.
- Protección uniforme de todas las rutas sensibles.
- CI que ejecute suite completa + build dashboard.

**Riesgos:**
- Logs con PII (payload WhatsApp completo).
- Endpoints `/api/leads`, `/api/customers`, `/api/chat`, `/api/logs` públicos aunque `AUTH_REQUIRED=true`.

**Antes de producción:** cerrar superficie pública, rate limit, logging redacted, health/readiness reales.

---

## 3. Frontend

**Estado actual:** React 19 + Vite 8 + TanStack Query en `apps/dashboard`. AuthProvider, ProtectedRoute, OnboardingGate, SSE RealtimeProvider.

**Madurez:** 55%

**Funciona:**
- 15+ pantallas cableadas a APIs reales.
- Loading / empty / error en la mayoría de páginas.
- Proxy de desarrollo a `:3000`.

**Falta:**
- Tests frontend (casi 0%).
- Variables `VITE_*` para API base.
- Integración build → Express static (`dashboard/` legacy vs `apps/dashboard/dist`).
- Error boundary global y toasts.

**Riesgos:**
- README del dashboard desactualizado (“solo Home real”).
- OnboardingGate fail-open si falla `/api/onboarding`.
- Token en `localStorage` + SSE con token en query string.

**Antes de producción:** pipeline de build unificado, fail-closed onboarding, interceptor 401, tests smoke de auth.

---

## 4. Dashboard

**Estado actual:** Secciones: Inicio, Conversaciones, Clientes, Estadísticas, Conocimiento, Automatizaciones, Workflows, Facturación, Marketplace, Copilot, Integraciones, Operaciones, Developer, Configuración.

**Madurez:** 55%

**Funciona:**
- CRUD Knowledge / Automations / Workflows.
- Marketplace install/uninstall.
- Copilot generate/apply.
- Observability health check + logs.
- Developer API keys (UI).

**Falta:**
- Pipeline Kanban (API existe, UI no).
- Página Settings orfana (`SettingsPage` unrouted, mock).
- Indicador realtime visible.
- Home aún usa mocks en conversaciones recientes / top vehículos.

**Riesgos:**
- Sidebar “Fase 2 · MVP mock” en producción percibida.
- Tokens CSS `brand` / `surface-muted` usados sin definir en `@theme` (CTAs rotos potenciales).

**Antes de producción:** cerrar mocks Home, Kanban o quitar claim, unificar design tokens, quitar copy MVP.

---

## 5. CRM

**Estado actual:** Dominio + servicios + APIs HTTP + pantallas Conversaciones/Clientes/Tasks. Persistencia de leads/customers/conversations/interactions **InMemory**.

**Madurez:** 40%

**Funciona:**
- Modelo de leads, perfiles, vehículos, interacciones.
- Dashboard lista/detalle con búsqueda.
- Spec CRM documentada.

**Falta:**
- Persistencia durable (Postgres/SQLite tenant-aware).
- Wiring completo WhatsApp → snapshot CRM.
- Multi-tenant en repos CRM.
- Notificaciones in-app.

**Riesgos:**
- Pérdida total de CRM al reiniciar proceso.
- Inconsistencia con sesiones SQLite del chatbot.

**Antes de producción:** migrar CRM a store persistente tenant-scoped; pruebas de restart; sync WA→CRM.

---

## 6. Chatbot

**Estado actual:** `ConversationEngine` + `ConversationOrchestrator` + SalesFlow + recovery + learning + knowledge FAQ.

**Madurez:** 78%

**Funciona:**
- Flujos baterías y rodamientos.
- Handoff a asesor / Telegram.
- Recovery y persistencia de sesión.
- Principios de negocio (no inventar datos) alineados con `SYSTEM_PROMPT.md`.

**Falta:**
- Reducir tamaño/complejidad de `ConversationEngine` (aún concentra welcome/rodamientos).
- Observabilidad de turns en panel operativo (parcial).
- A/B o métricas de conversión comerciales.

**Riesgos:**
- Regresiones por archivo monolítico (~1200 líneas).
- Dependencia de catálogo estático sin inventario/precio (by design, pero limita promesas comerciales).

**Antes de producción:** suite de regresión Willard en CI obligatorio; monitoreo de handoff rate.

---

## 7. WhatsApp

**Estado actual:** Webhook GET verify + POST async ACK; `WhatsAppCloudProvider`; idempotencia por archivo; audits de delivery.

**Madurez:** 65%

**Funciona:**
- Envío Cloud API.
- Idempotencia wamid (single-process).
- Verificación de token en GET.

**Falta:**
- Validación `X-Hub-Signature-256`.
- Idempotencia distribuida (Redis).
- Mapeo teléfono → tenant (SaaS).
- Redacción de PII en logs.

**Riesgos:**
- Webhook falsificable.
- Pérdida de archivo de idempotencia en Render free.
- Debug endpoints con verify token en query.

**Antes de producción:** firma Meta, volumen persistente o Redis, cerrar `/api/debug` en prod.

---

## 8. IA

**Estado actual:** `AI_PROVIDER=rule-based` por defecto; `OpenAIProviderStub` no produce respuestas reales; Copilot usa `LocalPromptProvider` (keywords → blueprints).

**Madurez:** 45%

**Funciona:**
- Detección de preguntas técnicas / reglas de negocio.
- Puerto `AIProvider` y `AiProvider` (copilot) intercambiables.
- Copilot aplica configs vía APIs públicas.

**Falta:**
- Integración real OpenAI/Azure/Anthropic/Gemini.
- Guardrails de costo y timeout LLM.
- Evaluación de calidad de respuestas.

**Riesgos:**
- Expectativa de “AI Copilot” vs mock.
- Costos no controlados si se enchufa LLM sin límites.

**Antes de producción:** decidir go-to-market (rule-based vs LLM); si LLM, proveedor real + budget + logs.

---

## 9. Base de conocimiento

**Estado actual:** Catálogo Willard (JSON + puerto) + Knowledge Manager SQLite (FAQ CRUD, CSV, search).

**Madurez:** 75%

**Funciona:**
- Fuente de verdad tipada con trazabilidad.
- KnowledgeEngine + admin dashboard.
- Seeds / import export.

**Falta:**
- Proceso continuo de actualización de catálogo (ops).
- Versionado de artículos FAQ.
- Búsqueda semántica (solo lexical).

**Riesgos:**
- Cobertura incompleta de páginas Willard (pendientes históricos en docs).
- Divergencia entre FAQ tenant y catálogo global.

**Antes de producción:** checklist de cobertura mínima comercial; ownership de actualizaciones.

---

## 10. Flujo de recomendación de baterías

**Estado actual:** VehicleInterpreter → BatteryRecommendationEngine → RecommendationPresenter vía ConversationOrchestrator / SalesFlowEngine.

**Madurez:** 85%

**Funciona:**
- Contratos matched/empty/partial.
- Tests unitarios e integración.
- No inventa referencias (`revisionPendiente` fuera).

**Falta:**
- Precio/stock (explícitamente fuera de alcance).
- UX de selección de modelo pendiente más rica en canal.

**Riesgos:**
- Expectativa de “cotización completa” sin inventario.

**Antes de producción:** messaging comercial claro (“asesoría de aplicación, no stock”); handoff cuando falte dato.

---

## 11. Panel administrativo

**Estado actual:** Dashboard multi-módulo + onboarding wizard + company white-label.

**Madurez:** 50%

**Funciona:**
- Operación diaria de conversaciones/clientes/KB.
- Configuración de empresa.
- Herramientas avanzadas (WF, marketplace, ops).

**Falta:**
- Gestión de usuarios/roles en UI.
- Pipeline Kanban.
- Settings de producto (TTL, canales).
- Aplicar `primaryColor` en runtime CSS.

**Riesgos:**
- Usuarios LECTURA ven acciones destructivas.
- Complejidad de nav (14 ítems) sin agrupación.

**Antes de producción:** RBAC UI+API; Kanban o retiro del claim; IA de navegación por rol.

---

## 12. Autenticación

**Estado actual:** Login JWT HS256 custom, scrypt passwords, logout denylist in-memory, seed admin.

**Madurez:** 45%

**Funciona:**
- Login / me / logout.
- Onboarding crea admin.
- Middleware `requireAuth` en rutas dashboard.

**Falta:**
- Refresh tokens / rotación.
- Password reset.
- Login tenant-scoped (`email` global hoy).
- Revocación distribuida.
- MFA.

**Riesgos:**
- Defaults `rodacenter-dev-jwt-secret-change-me` / `admin123`.
- Roles en JWT sin `requireRole`.

**Antes de producción:** secretos fuertes obligatorios, RBAC, login por tenant, logout durable.

---

## 13. Seguridad

**Estado actual:** Helmet+CSP en API; CORS `*`; sin rate limit; API keys hasheadas pero no usadas; webhook sin firma.

**Madurez:** 35%

**Funciona:**
- Hash de passwords y API keys.
- SecurityGuard básico anti prompt-leak en chat.
- Auth en superficie dashboard principal.

**Falta:**
- Firma WhatsApp.
- Enforcement API keys + permisos.
- CORS allowlist.
- Auditoría de accesos sensibles.
- Hardening headers del frontend estático.

**Riesgos:** ver tabla P0 abajo (bloqueantes).

**Antes de producción:** threat model + checklist OWASP mínimo + pentest ligero.

---

## 14. Base de datos

**Estado actual:** SQLite (`node:sqlite`) único archivo; muchas tablas por módulo; tenant_id en la mayoría de repos dashboard.

**Madurez:** 45%

**Funciona:**
- Persistencia sesión chatbot + learning + dashboard modules.
- WAL en file-backed.
- Seeds de planes/templates/SDKs.

**Falta:**
- Postgres (o volumen persistente managed).
- Migraciones versionadas.
- Backups / PITR.
- PK compuestos tenant+wa_id.

**Riesgos:**
- Render free = pérdida de datos.
- Sin estrategia de backup documentada en `render.yaml`.

**Antes de producción:** disco persistente o Postgres; backups; migraciones.

---

## 15. APIs

**Estado actual:** Amplia superficie REST + SSE `/events`.

**Madurez:** 70%

**Funciona:**
- Contratos consistentes JSON.
- Tests HTTP por módulo SaaS.
- Documentación implícita vía Developer SDK examples.

**Falta:**
- OpenAPI/Swagger formal.
- Versionado `/v1`.
- Auth API key en runtime.
- Idempotency keys en writes públicos.

**Riesgos:**
- APIs legacy CRM públicas.
- Breaking changes sin versionado.

**Antes de producción:** OpenAPI + auth unificada + deprecar rutas públicas.

---

## 16. Integraciones

**Estado actual:** Telegram handoff/alertas; WhatsApp Cloud; Integration Hub 100% mock; Stripe/etc. solo en catálogo de providers.

**Madurez:** 35%

**Funciona:**
- Telegram notificaciones.
- WhatsApp send/receive.
- Hub con connect/test/logs simulados.

**Falta:**
- Conectores reales (al menos Webhook + Email o Slack).
- Pagos (Stripe/MercadoPago).
- Inventario externo (futuro).

**Riesgos:**
- Market perception de “Integraciones” como listas cuando son mock.

**Antes de producción:** etiquetar Hub como “Beta/simuladas” o implementar 1–2 conectores reales.

---

## 17. UX

**Estado actual:** Flujos claros en español; empty states; wizards onboarding.

**Madurez:** 55%

**Funciona:**
- Conversaciones/clientes usables.
- Knowledge/automations productivos.
- Copilot con preview JSON.

**Falta:**
- Feedback realtime.
- Toasts consistentes.
- Onboarding fail UX.
- Guías in-app / empty→CTA en módulos avanzados.

**Riesgos:**
- Frustración mobile.
- Expectativas SaaS vs MVP.

**Antes de producción:** recorrido crítico usuario (login→onboarding→conversación→handoff) en staging.

---

## 18. UI

**Estado actual:** Tailwind v4 + tokens parciales; DM Sans; sidebar fija.

**Madurez:** 50%

**Funciona:**
- Look coherente en CRM core.
- Cards/tables compartidas.

**Falta:**
- Design system único (eliminar `slate-*` vs tokens).
- Definir `brand` / `surface-muted`.
- Mobile drawer.
- Accesibilidad (focus traps, skip nav).

**Riesgos:**
- CTAs invisibles/rotos por clases undefined.
- Sidebar inutilizable en móvil.

**Antes de producción:** pass de UI tokens + mobile nav.

---

## 19. Performance

**Estado actual:** Single Node process; SQLite sync; EventBus in-memory; Query staleTime 30s.

**Madurez:** 50%

**Funciona:**
- Latencia aceptable en single-tenant bajo volumen.
- Timeouts en pipeline conversacional.

**Falta:**
- Load tests.
- Índices auditados bajo volumen.
- Caché / read replicas.
- Profiling SSE fan-out.

**Riesgos:**
- Contención SQLite bajo writes concurrentes.
- Memory growth EventBus/Metrics in-memory.

**Antes de producción:** load test webhook + dashboard concurrente; límites de tamaño DB.

---

## 20. Escalabilidad

**Estado actual:** Diseñado para un proceso. File idempotency, InMemory EventBus/CRM/JWT denylist.

**Madurez:** 30%

**Funciona:**
- Escala vertical limitada OK para un negocio local.

**Falta:**
- Horizontal scaling (sticky sessions o Redis).
- Multi-instance WhatsApp idempotency.
- Tenant routing a escala.
- Colas para jobs (workflows largos).

**Riesgos:**
- Dos instancias = doble procesamiento / estado inconsistente.

**Antes de producción SaaS:** Redis + Postgres + workers; o limitar explícitamente a single-instance.

---

## Tabla de prioridades

| ID | Prioridad | Pendiente | Módulo | Esfuerzo est. | Impacto |
|----|-----------|-----------|--------|---------------|---------|
| P0-01 | **P0** | Persistencia durable (volumen o Postgres) + backups | DB / Deploy | 3–5 días | Evita pérdida total de datos |
| P0-02 | **P0** | Migrar CRM (leads/customers/conversations) de InMemory a store persistente tenant-aware | CRM | 5–8 días | Continuidad operativa |
| P0-03 | **P0** | Verificar firma Meta `X-Hub-Signature-256` en webhook | WhatsApp / Seguridad | 1–2 días | Impide spoofing |
| P0-04 | **P0** | Proteger `/api/leads`, `/api/customers`, `/api/chat`, `/api/logs`; cerrar `/api/debug` en prod | APIs / Seguridad | 1–2 días | Expone datos |
| P0-05 | **P0** | Forzar secretos fuertes (JWT, admin); eliminar defaults inseguros en prod | Auth | 0.5–1 día | Compromiso total |
| P0-06 | **P0** | Login/tenancy aislados (email+tenant); impedir spoof `x-tenant-id` sin auth | Auth / Multi-tenant | 2–4 días | Cross-tenant |
| P0-07 | **P0** | Wire dashboard Vite → deploy (static/CDN) + SPA fallback + env API | Frontend / Deploy | 2–3 días | Panel no servido |
| P0-08 | **P0** | Navegación móvil (drawer) | UI / UX | 1–2 días | Usuarios móvil |
| P0-09 | **P0** | Fix design tokens rotos (`brand`/`surface-muted`) | UI | 0.5 día | CTAs rotos |
| P0-10 | **P0** | Interceptor 401 + OnboardingGate fail-closed | Frontend / Auth | 1 día | Sesiones rotas / bypass |
| P0-11 | **P0** | RBAC mínimo API+UI (LECTURA read-only) | Auth / Panel | 2–3 días | Acciones indebidas |
| P0-12 | **P0** | Idempotencia WhatsApp en store durable (no solo archivo efímero) | WhatsApp | 2–3 días | Duplicados post-redeploy |
| P1-01 | **P1** | Enforcement API keys + permisos en rutas públicas | Developer | 2–3 días | Developer Platform incompleta |
| P1-02 | **P1** | CORS allowlist + rate limiting | Seguridad | 1–2 días | Abuse |
| P1-03 | **P1** | JWT revocation durable (Redis/DB) | Auth | 1–2 días | Logout inútil multi-instance |
| P1-04 | **P1** | Pipeline Kanban UI o retirar claim | Dashboard / CRM | 3–5 días | Promesa rota |
| P1-05 | **P1** | Home 100% datos reales (quitar mocks) | UX | 1–2 días | Credibilidad |
| P1-06 | **P1** | PK sesión `tenant_id+wa_id`; routing WA→tenant | Multi-tenant | 2–4 días | Colisiones SaaS |
| P1-07 | **P1** | Migraciones versionadas + `.env.example` completo | DB / Ops | 2–3 días | Operabilidad |
| P1-08 | **P1** | Redacción PII en logs webhook/HTTP | Seguridad | 1 día | Cumplimiento |
| P1-09 | **P1** | Automation side-effects reales (tasks/notificaciones) | Automation | 3–5 días | Valor de reglas |
| P1-10 | **P1** | Billing: pagos reales o copy “manual/honor system” + límites claros | Billing | 5–10 días (Stripe) / 0.5 día (copy) | Expectativa comercial |
| P1-11 | **P1** | Etiquetar Integration Hub / Copilot como Beta-mock o conectar LLM/conectores | IA / Integraciones | 0.5 día label / 1–3 sem real | Honestidad producto |
| P1-12 | **P1** | CI: test backend + build dashboard + typecheck | QA / Ops | 1–2 días | Regresiones |
| P1-13 | **P1** | Error boundary + toasts + indicador SSE | UX | 1–2 días | Resiliencia UI |
| P1-14 | **P1** | OpenAPI + ejemplos Developer alineados a prod | APIs | 2–3 días | DX |
| P2-01 | **P2** | Design system unificado + white-label runtime colors | UI | 3–5 días | Polish |
| P2-02 | **P2** | User management (invite/roles) | Admin | 3–5 días | Multi-usuario |
| P2-03 | **P2** | Audit UX (filtros/export) | Observability | 2–3 días | Compliance UX |
| P2-04 | **P2** | Tests frontend (auth + páginas críticas) | QA | 3–5 días | Calidad |
| P2-05 | **P2** | Load testing webhook + SQLite | Performance | 2–3 días | Capacidad |
| P2-06 | **P2** | Workflow editor visual (DnD) | Workflows | 1–2 sem | Usabilidad |
| P2-07 | **P2** | Búsqueda semántica KB | Knowledge | 1–2 sem | Relevancia |
| P2-08 | **P2** | Settings de producto (TTL, canales) | Panel | 2–3 días | Operación |
| P3-01 | **P3** | LLM real (OpenAI/Azure/Anthropic) en chat y Copilot | IA | 2–4 sem | Diferenciación |
| P3-02 | **P3** | Conectores reales (Webhook, Slack, Email, Sheets) | Integraciones | 3–6 sem | Ecosistema |
| P3-03 | **P3** | Escala horizontal (Redis, workers, multi-instance) | Escalabilidad | 3–6 sem | Crecimiento |
| P3-04 | **P3** | Inventario/precios vía puertos | Chatbot / Catálogo | 4–8 sem | Monetización |
| P3-05 | **P3** | MFA, SSO, password reset | Auth | 2–4 sem | Enterprise |
| P3-06 | **P3** | i18n / multi-idioma | UX | 2–3 sem | Expansión |
| P3-07 | **P3** | Marketplace pagos / revenue share | Marketplace | 4–8 sem | Plataforma |

---

## Escenarios de salida

### A) WhatsApp single-tenant (Rodacenter Manizales)

**Viable tras P0 de seguridad + persistencia (aprox. 2–3 semanas).**  
No vender como SaaS. Operar un solo tenant, disco persistente, firma Meta, secretos fuertes, CRM durable.

### B) Dashboard interno para asesores

**Viable tras P0 frontend deploy + RBAC + mobile (aprox. +1–2 semanas sobre A).**

### C) SaaS multi-tenant comercial

**No viable.** Requiere P0+P1 casi completos + Postgres + tenant routing WA + billing real ≈ **2–3 meses** con equipo pequeño.

---

## Riesgo de salir a producción (hoy)

| Dimensión | Nivel | Comentario |
|-----------|-------|------------|
| Pérdida de datos | **Crítico** | CRM memoria + Render free |
| Seguridad | **Crítico** | Webhook/APIs/secretos |
| Cumplimiento / PII | **Alto** | Logs sin redacción |
| Continuidad WhatsApp | **Alto** | Idempotencia efímera |
| Experiencia panel | **Medio-Alto** | Mobile/deploy/RBAC |
| Escalabilidad | **Alto** si >1 instancia | Single-process |
| Expectativa IA/SaaS | **Alto** | Features mock presentadas como producto |

**Riesgo global de lanzamiento SaaS hoy: ALTO / NO RECOMENDADO.**  
**Riesgo de operación single-tenant endurecida: MEDIO** (aceptable con P0 cerrados).

---

## Recomendación final

1. **Congelar nuevas features SaaS** (Sprints 23+) hasta cerrar P0.
2. **Ejecutar sprint de producción** de 2–3 semanas enfocado solo en P0.
3. **Definir go-to-market honesto:** “Asesor WhatsApp Willard para Rodacenter” vs “Plataforma SaaS multi-tenant” — hoy solo el primero es alcanzable.
4. **Etiquetar como Beta** Copilot, Integration Hub y Billing en UI.
5. **Reauditar** tras P0 con checklist de smoke (webhook firmado, restart sin pérdida, login roles, dashboard en prod URL).

---

## Evidencia clave (rutas)

| Hallazgo | Evidencia |
|----------|-----------|
| CRM InMemory | `src/infrastructure/di/container.ts` |
| Webhook sin firma | `src/presentation/http/routes/whatsappRoutes.ts` |
| APIs públicas | `src/presentation/http/createApp.ts` |
| Render free | `render.yaml` |
| Copilot mock | `src/infrastructure/ai/LocalPromptProvider.ts` |
| Connectors mock | `src/infrastructure/integrations/mockConnectors.ts` |
| API keys sin middleware | `DeveloperService.verifySecret` sin uso HTTP |
| Dashboard Vite vs static | `apps/dashboard` vs `getDashboardStaticPath()` → `dashboard/` |
| Roadmap desfasado | `docs/RODACENTER_AI_ROADMAP.md` (2026-07-29) |

---

*Documento generado por auditoría profesional. No sustituye pentest ni certificación legal.*
