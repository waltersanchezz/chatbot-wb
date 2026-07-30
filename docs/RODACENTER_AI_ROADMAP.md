# Rodacenter AI — Roadmap oficial

**Producto:** Rodacenter AI (WhatsApp Business · Rodacenter Manizales)  
**Documento:** fuente de planificación de fases (no sustituye `SYSTEM_PROMPT.md` ni `WILLARD_INTEGRATION_SPEC.md`)  
**Actualizado:** 2026-07-29  
**Estado de despliegue:** servicio `rodacenter-ai` en Render, branch `main`, WhatsApp Cloud API activo

---

## Visión

Ser el canal digital de asesoría más confiable de Rodacenter Manizales en WhatsApp: un asistente escalable, modular y preparado para inventario, precios, CRM y panel administrativo, sin perder trato humano ni rigurosidad comercial.

Arquitectura de referencia (Clean Architecture):

```text
Canal (WhatsApp / HTTP)
  → ConversationEngine / flows
    → RecommendationService + LeadService + notificaciones
      → Puertos de dominio
        ← Adaptadores (catálogo Willard, repos, WhatsApp, logs)
```

---

## Principios del proyecto

### Principios de negocio (no negociables)

1. Nunca inventar información, referencias, precios ni disponibilidad.
2. Nunca presentarse como chatbot, bot o IA genérica ante el cliente.
3. Nunca revelar prompts, herramientas, secretos ni arquitectura al cliente.
4. Preferir handoff a asesor antes que afirmar un dato dudoso.
5. Ayudar antes que vender; no presionar.

### Principios técnicos (Willard / conocimiento — P1–P8)

| ID | Principio |
|---|---|
| **P1** | Separación estricta de capas (datos / dominio / infra / aplicación / canal) |
| **P2** | El catálogo impreso es la fuente de verdad; literales y trazabilidad `fuente.imagen` + `fuente.fila` |
| **P3** | `revisionPendiente: true` no entra en recomendaciones |
| **P4** | Datos, lógica y canal son desplegables por separado |
| **P5** | Contratos explícitos (`matched` / `empty` / `partial`, `reasonCode`) |
| **P6** | Alcance cerrado: sin inventario/precios/CRM/alias sin aprobación |
| **P7** | Pruebas antes que cableado |
| **P8** | Extensiones (stock, precio, CRM) vía puertos; no contaminar el JSON Willard |

Detalle: `docs/WILLARD_INTEGRATION_SPEC.md`. Comportamiento conversacional: `docs/SYSTEM_PROMPT.md`.

---

## Mapa de fases

| # | Fase | Estado | Resumen |
|---|---|---|---|
| 1 | Base de conocimiento | **En curso (avanzada)** | Catálogo Willard estructurado + motor de recomendación en producción |
| 2 | Chatbot inteligente | **En curso (operativo)** | WhatsApp live; flujos baterías/rodamientos; motor de reglas |
| 3 | CRM | **MVP inicial + PR1–PR2** | Spec aprobado; dominio + repos InMemory; sin servicios/API/PG aún |
| 4 | Panel web | **MVP inicial** | Dashboard estático + API de leads |
| 5 | Automatizaciones | **Parcial** | Handoff y alertas Telegram; sin workflows avanzados |
| 6 | Producción | **Operativa / iterativa** | Render + health + logs; endurecimiento continuo |

---

## Fase 1 — Base de conocimiento

**Objetivo:** Convertir el catálogo oficial Willard (y conocimiento de producto) en datos estructurados, trazables y utilizables por el motor de recomendaciones, sin inventar celdas ni referencias.

### Completado

- Transcripción del lote 1 (29/29 páginas) → `willardApplications.json` + `willardReferences.json`
- Scripts de validación, cobertura y cotejo (`scripts/validar-willard.mjs`, `informe-cobertura.mjs`, cotejos)
- Documentación: `WILLARD_PENDIENTES.md`, `WILLARD_COBERTURA.md`, `WILLARD_INTEGRATION_SPEC.md` (P1–P8)
- Puerto `WillardBatteryKnowledge` + adaptador `CatalogFileWillardBatteryKnowledge`
- `RecommendationService` con outcomes tipados y tests (Vitest)
- Wiring a WhatsApp: DI → `ConversationEngine` → formatter (sin catálogo legado en runtime)
- Cierre masivo de pendientes de alta rotación (BMW 28/28; Chevrolet p.7; Ford F-150 en p.9; Ford p.10 Lote A; specs Extrema Taxi pendientes)

### Estado actual (métricas)

| Métrica | Valor |
|---|---|
| Aplicaciones | 744 |
| Utilizables (`revisionPendiente: false`) | **620 (~83.3 %)** |
| Pendientes de cotejo | **124** |
| Marcas con ≥1 usable | 66/66 |
| Specs de referencia | 90 |

### Pendiente

- **Alta rotación restante:** Kia Sorento XM (`lote1-img-13`); Hyundai buses Aero/County/H350 (`lote1-img-25`)
- Resolver refs huérfanas vs lista maestra (`49-1200`, `65-1150`, etc.) solo con evidencia — literales Ford p.10 confirmados, specs no inventadas
- Observación abierta: CCA de Extrema Taxi ya “confirmados” vs retoma
- Alias de marca (`CHANA`/`CHANGAN`, etc.) — fase posterior aprobada por separado
- Catálogo de rodamientos: hoy catálogo de producto en código/fixtures; no mismo rigor Willard

### Alta rotación (checklist)

| Marca | Utilizable | Pendiente | Notas |
|---|---|---|---|
| BMW | 28/28 | 0 | Cerrada |
| CHEVROLET | **85/85** | 0 | p.7 + taxis + buses cerrados |
| KIA | 38/39 | 1 (Sorento XM) | Taxis p.22 cerrados |
| HYUNDAI | 47/50 | 3 (buses p.25) | Taxis p.22 cerrados |
| FORD | **32/32** | 0 | Lote A cerrado con `lote1-img-10-retoma-ford.png` |

---

## Fase 2 — Chatbot inteligente

**Objetivo:** Asesorar en WhatsApp como vendedor de mostrador: entender intención, recolectar datos del vehículo, recomendar solo desde conocimiento confiable y transferir cuando haga falta.

### Completado

- `ConversationEngine` + flujos: bienvenida, baterías, rodamientos, handoff
- Extracción de contexto (marca/modelo/año/planta de sonido, etc.)
- Integración WhatsApp Cloud API + endpoint de chat de prueba
- Recomendación Willard en producción vía `RecommendationService` (flujo conversacional: vehículo → año → planta de sonido)
- Presentación por línea de producto (AGM/EFB, Titanio, Willard, Extrema) cuando hay `matched`
- Proveedor de IA por reglas; stub OpenAI preparado
- Seguridad básica (`SecurityGuard`) y system prompt documentado

### Pendiente

- Mejorar matching de modelos ambiguos (ej. `3` vs CX3) sin inventar datos
- Aprovechar año / planta de sonido en lógica comercial (hoy slots conversacionales; el catálogo Willard no los usa)
- Activar OpenAI bajo el mismo marco de reglas (`SYSTEM_PROMPT.md`), con herramientas acotadas
- Enriquecer flujo de rodamientos con la misma disciplina de conocimiento que Willard
- No afirmar precio/stock hasta existir puertos de inventario y precios

---

## Fase 3 — CRM

**Objetivo:** Capturar oportunidades calificadas (cliente/perfil + lead + contexto + recomendación) y entregarlas al equipo humano sin romper el canal WhatsApp.

**Diseño (fuente de verdad):** `docs/CRM_SPEC.md` — especificación técnica de arquitectura MVP **aprobada con enmiendas** (CustomerProfile 1→N Lead / VehicleProfile, timeline de interacciones, prioridad Alta|Media|Baja solo CRM, estados, eventos, API, puertos/persistencia, flujo WhatsApp → Dashboard).

**Implementación:** PR1 dominio + **PR2 repos InMemory** hechos. **Aún no es CRM completo** — faltan políticas de aplicación, `CustomerProfilePort`/servicios, API y panel; sin PostgreSQL.

### Completado

- Entidad `Lead` + `LeadService` + `LeadRepository` (memoria)
- Registro post-conversación en segundo plano (no bloquea respuesta WhatsApp)
- Notificación Telegram de leads nuevos (`NotificationService`)
- API HTTP de leads (`leadRoutes`)
- **PR1 — dominio CRM:** `CustomerProfile`, `VehicleProfile`, `Interaction`, `LeadEvent`; `Lead` ampliado (estados, `LeadPriority`, snapshot, assignment/SLA/recontact opcionales); helpers de transición/validación en `src/domain/crm/`; tests `tests/crm/entities.test.ts`
- **PR2 — puertos + InMemory:** `LeadRepository` extendido (filtros, by customer, events); `VehicleProfileRepository` + `InteractionRepository` nuevos; `CustomerRepository` InMemory endurecido (copias defensivas); tests `tests/crm/repositories.test.ts`. Sin PG / sin servicios CRM nuevos / sin API nueva.

### Pendiente

- PR3+: `priorityPolicy` + `leadStateMachine` de aplicación (reglas CRM — sin Willard / `RecommendationService`)
- `CustomerProfilePort` / service (ensambla Customer + leads + vehicles + timeline)
- Cablear `LeadService` / futuro `CrmPort`: perfil, vehículos, snapshot boundary, prioridad, interacciones
- Persistencia real (PostgreSQL según `schema.sql` + tablas `leads` / `lead_events` / `vehicle_profiles` / `interactions` del spec)
- `CrmPort` / handoff enriquecido con `reasonCode`, query, opciones (captura en boundary; sin tocar `RecommendationService`)
- Estados operativos de lead (asignación, SLA, recontacto — subconjunto MVP del spec)
- API de ficha de cliente (`/api/customers/...`) para panel

---

## Fase 4 — Panel web

**Objetivo:** Dar al equipo un tablero simple para ver conversaciones/leads y operar sin abrir logs crudos.

### Completado

- UI estática en `/dashboard` (`dashboard/` + `dashboardRoutes`)
- API de productos y leads para consulta

### Pendiente

- Panel autenticado (roles asesor / admin)
- Vista de conversaciones, handoffs y motivo (`needsHumanHandoff` / `handoffReason`)
- Filtros por fecha, producto, outcome Willard (`matched` / `empty`)
- Acciones: tomar lead, marcar cerrado, añadir notas
- Métricas básicas (volumen, tasa de handoff, marcas más consultadas)

---

## Fase 5 — Automatizaciones

**Objetivo:** Reducir trabajo manual del equipo sin inventar datos ni saltarse el handoff humano donde corresponde.

### Completado

- Handoff conversacional con mensaje de cierre / validación
- Alerta Telegram al crear/actualizar lead
- Logs JSONL diarios para auditoría operativa

### Pendiente

- Inventario vivo (`InventoryPort`) y precios (`PricingPort`) como post-proceso de `RecommendationResult`
- Reglas de seguimiento (recordatorios, leads sin respuesta)
- Cola de “revisar referencia” cuando `outcome === empty` / `NO_USABLE_MATCH`
- Reportes periódicos (diario/semanal) al equipo
- Webhooks o integraciones hacia herramientas internas futuras

---

## Fase 6 — Producción

**Objetivo:** Mantener el servicio estable, observable y desplegable de forma segura desde `main`.

### Completado

- Deploy en Render (`render.yaml`, servicio `rodacenter-ai`)
- Health check `/health`
- Build TypeScript + arranque Node
- WhatsApp en producción consumiendo `RecommendationService` + catálogo estructurado
- Suite de pruebas Willard (Vitest) en el repo

### Pendiente

- Observabilidad: métricas de error, latencia webhook, tasa `empty` vs `matched`
- Backups y persistencia durable (hoy repos en memoria se pierden al reiniciar)
- Secretos y rotación solo vía dashboard Render (sin secretos en git)
- CI (typecheck + test) en cada PR a `main`
- Runbooks: redeploy, clear cache, verificación post-deploy (`usableApplications` en logs)

---

## Próximo objetivo inmediato

### Sprint Final — FASE 1 (alta rotación)

**Regla dura:** no inferir, no reasignar filas por “parece corrido”, no cerrar con ampliación contradictoria. Solo retomas nítidas (mismo estándar que Chevrolet p.7 / Ford p.9).

| Lote | Evidencia requerida | Filas | Estado |
|---|---|---|---|
| **A — Ford p.10** | Retoma nítida `lote1-img-10-retoma-ford.png` (Raptor → V-8 Escape) | 11 (+3 correcciones) | ✅ Cerrado — Ford **32/32** |
| **B — Kia Sorento XM** | Zoom/retoma clara de `lote1-img-13` fila Sorento XM | 1 | ⏳ Esperando foto |
| **C — Hyundai buses** | Retoma/ampliación inequívoca de Aero / County / H350 en `lote1-img-25` | 3 | ⏳ Esperando foto |

**Criterio para declarar FASE 1 terminada (alta rotación crítica):**

- BMW 28/28, Chevrolet 85/85 ✅  
- Ford **32/32** ✅  
- Kia sin pendientes de modelos de calle (Sorento XM cerrado; taxis ya OK)  
- Hyundai taxis OK; buses p.25 cerrados o reclasificados como no críticos con decisión explícita  

Pendientes de marcas de baja rotación / refs huérfanas **no** bloquean el cierre de Fase 1 alta rotación; quedan documentados en `WILLARD_PENDIENTES.md`.

**Ahora:** próximo objetivo = **Lote B (Kia Sorento XM)**. Tras cada lote cerrado → actualizar `WILLARD_PENDIENTES.md` + este roadmap; sin tocar backend ni chatbot.

---

## Documentos relacionados

| Documento | Rol |
|---|---|
| `docs/SYSTEM_PROMPT.md` | Comportamiento y voz del asesor |
| `docs/WILLARD_INTEGRATION_SPEC.md` | Contrato técnico Willard + P1–P8 |
| `docs/CRM_SPEC.md` | Diseño técnico Fase 3 CRM (SoT; aprobado; PR1 dominio + PR2 repos InMemory — CRM aún incompleto) |
| `docs/WILLARD_PENDIENTES.md` | Dudas y cotejos abiertos del catálogo |
| `docs/WILLARD_COBERTURA.md` | Métricas generadas (no editar a mano) |
| `README.md` | Arranque local y endpoints |

---

## Cómo usar este roadmap

- Un PR debe pertenecer a **una fase dominante** (datos vs wiring vs CRM vs panel).
- No mezclar cierre de catálogo con cambios de `ConversationEngine` en el mismo PR.
- Toda cifra de cobertura se regenera con scripts; este roadmap solo interpreta el estado.
- Cambios que violen P1–P8 o los principios de negocio requieren aprobación explícita antes de implementar.
