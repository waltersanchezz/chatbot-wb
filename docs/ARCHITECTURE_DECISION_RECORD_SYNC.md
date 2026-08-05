# ADR — Sincronización Dashboard ↔ canal WhatsApp (Opción 2)

| Campo | Valor |
|-------|--------|
| **Estado** | Aprobado para implementación (según este documento) |
| **Fecha** | 2026-08-04 |
| **Decisión** | Proyección automática `crm_conversations` → `persisted_sessions` |
| **Alcance** | Rodacenter AI v1.0 — operación comercial Willard / WhatsApp |
| **Documento** | **Única fuente** para implementar esta decisión. No requiere leer análisis previos. |

---

## 1. Contexto

Existen dos almacenes de conversación en el mismo SQLite:

| Store | Escritor actual | Lectores |
|-------|-----------------|----------|
| `crm_conversations` | `HandleIncomingMessage` → `SQLiteChatConversationRepository.save` | Canal WhatsApp / CRM |
| `persisted_sessions` | `ConversationEngine.persistProductSession` → `SQLitePersistenceRepository` | Dashboard (lista, detalle, clientes, tareas, analítica, home) + recovery (`load`) |

El canal **siempre** persiste en `crm_conversations`. El panel lee `persisted_sessions` (+ `learning_events`). Además, `persistProductSession` solo escribe si hay “progreso” y en caso contrario hace `delete`, por lo que conversaciones nuevas (p. ej. saludo) no aparecen en el Dashboard aunque WhatsApp funcione.

Hay stores relacionados que **no** unifica esta ADR:

- `crm_leads` / `crm_customers` — CRM de negocio  
- `learning_events` — analítica / señales  

Un lead en CRM puede no verse como “tarea” del panel si el estado no está en la proyección. Eso queda fuera de alcance (ver §11).

---

## 2. Decisión

**Opción 2 — Read model proyectado:**

1. **`crm_conversations`** es la fuente de verdad del **canal** (write model).  
2. **`persisted_sessions`** es el **read model** del Dashboard y soporte de recovery.  
3. Tras cada `save` exitoso del documento de conversación del canal, se proyecta **siempre** una fila en `persisted_sessions`.  
4. Un solo writer de `persisted_sessions` (save/delete). El motor de conversación **solo** puede hacer `load` para recovery.

**No se elige ahora:**

- Opción 1 (Dashboard lee solo CRM sin proyección) — deja dualismo y obliga a reescribir todos los repos del panel.  
- Opción 3 (eliminar `persisted_sessions`) — SSOT ideal a medio plazo; alto riesgo para v1.0. Queda como norte (§12).

---

## 3. Contratos obligatorios (no negociables)

Estos 10 requisitos son parte de la decisión. Cualquier PR que los viole es **NO-GO**.

### C1 — Snapshot post-outbound y post-save CRM

La proyección usa el objeto `Conversation` **después** de:

1. Append del mensaje `assistant` (outbound), y  
2. `ConversationRepository.save` exitoso.

Prohibido proyectar el estado intermedio dentro de `ConversationEngine.process` (aún no incluye la respuesta del bot).

### C2 — Writer único de `persisted_sessions`

- **Permitido en el motor:** `PersistenceRepository.load` (recovery).  
- **Prohibido en el motor (camino feliz / error del engine):** `save` y `delete` sobre `persisted_sessions`.  
- Save/delete de sessions solo vía el projector del write path del canal.

### C3 — Misma conexión SQLite (o política explícita)

Ideal: save CRM + save proyección sobre la **misma** conexión/`DatabaseSync` (unidad de trabajo).

Si no es viable en el primer PR:

- Reintento síncrono acotado (1–2) de la proyección, y  
- Métrica/log de fallo, **sin** tumbar el canal WhatsApp.

Queda prohibido asumir atomicidad cross-connection sin documentarlo en el PR.

### C4 — TTL alineado

`PersistedSession.expiresAt` = `conversation.expiresAt` (misma semántica que `expires_at_ms` del CRM).

`cleanupExpired` no debe eliminar sesiones que el CRM aún considera vigentes por TTL de sesión.

### C5 — Release atómico del cambio de writers

Retirar write/delete del motor y activar el projector es **un solo release** (R2). Prohibido desplegar solo “quitar el delete” o solo “apagar el motor” sin projector.

### C6 — Rollback y feature flag

Modos permitidos:

| Modo | Comportamiento |
|------|----------------|
| **Legacy** | Binario anterior a R2 (deuda conocida: panel incompleto / delete-on-greeting). |
| **Projected** | R2 completo: motor solo `load`; projector ON post-save. |

No existe modo “a medias” (motor sin write + projector OFF, o projector ON + delete del motor activo).

- Rollback de binario a Legacy **reintroduce** `delete` on no-progress → puede borrar filas de `persisted_sessions` en el siguiente saludo.  
- Preferir **fix forward**. Si hay rollback: smoke inmediato “saludo no borra sesión” + backfill desde CRM si hace falta.  
- Flag (si se usa): interruptor del **paquete R2 completo** en staging→prod, no interruptores parciales.

### C7 — GO separados: canal vs proyección

| Severidad | Criterio |
|-----------|----------|
| **P0 canal** | WhatsApp responde; no duplicados; CRM `crm_conversations` se guarda; handoff/Telegram no regresionan. Un fallo aquí aborta el release. |
| **P0 proyección** | Staging: 0 fallos de proyección en N mensajes de prueba. Prod: alerta si fail rate &gt; 0 en ventana de 15 min post-deploy. Fallo de proyección **no** debe tumbar el reply WA (tras reintentos). |

### C8 — Test anti-regresión delete-on-greeting

Debe existir prueba automatizada que falle si un saludo / turno sin “progreso comercial” vuelve a **borrar** `persisted_sessions`.

### C9 — Concurrencia del webhook

Mantener procesamiento **secuencial** de mensajes en el handler WhatsApp (como hoy: `await` en el loop).

Prohibido paralelizar el procesamiento de mensajes del mismo (o distinto) `externalId` sin locking por `externalId`.

Nota P2 (no bloquea v1.0): PK histórica de `persisted_sessions` por `wa_id` y multi-tenant — deuda conocida; no ampliar el problema.

### C10 — Fuera de alcance explícito

Esta ADR **no** unifica:

- Lectura de `crm_leads` / `crm_customers` en el Dashboard  
- Eliminación de `learning_events`  
- Opción 3 (borrar `persisted_sessions`)  
- Cambios a ConversationEngine de venta, BatteryRecommendationEngine, SalesFlowEngine, auth, Meta, Telegram  

---

## 4. Diseño del projector

### 4.1 Responsabilidad

Dado un `Conversation` de dominio ya persistido en CRM, construir un `PersistedSession` (reutilizar `buildPersistedSession` / reglas equivalentes) y hacer upsert en `persisted_sessions`.

### 4.2 Claves

- `waId` = `conversation.externalId` (p. ej. `whatsapp:+57…`)  
- `conversationId` = `conversation.id`  
- Mensajes y `context` = snapshot completo del documento CRM  
- `expiresAt` = `conversation.expiresAt` (C4)

### 4.3 Fallos

1. Reintento síncrono 1–2 veces (misma UoW/conexión si aplica).  
2. Si sigue fallando: log estructurado (conversationId, waId enmascarado, error) + métrica; **no** lanzar al cliente WhatsApp.  
3. El save CRM ya committed sigue siendo la verdad del canal.

### 4.4 Ownership en código (orientación)

Preferido: decorator/wrapper de `ConversationRepository` o paso explícito en `HandleIncomingMessage` **después** del save exitoso (caminos feliz y error que persisten conversación).

El projector vive en application/infrastructure; **no** dentro de la lógica de recomendación Willard.

---

## 5. Plan de releases y fases

### Mapa release ↔ fase

| Release | Fases | ¿Prod? |
|---------|-------|--------|
| **R0** | Fase 0 — Baseline | N/A (calidad) |
| **R1** | Fase 1 — Projector + tests (sin wiring prod) | Opcional / staging |
| **R2** | Fase 2 + Fase 3 — atómicas | Staging → Prod |
| **R3** | Fase 4 — Ajuste lectores (solo si gap medido) | Solo si GO lo exige |
| **R4** | Fase 5 — Hardening, runbook, anti-regresión | Prod |

```
R0 → R1 → R2 (Fase 2+3 juntas) → R3 si gap → R4
```

---

### Fase 0 — Baseline (R0)

**Objetivo**  
Congelar comportamiento actual y verificar suites verdes antes de cambiar persistencia.

**Archivos**  
- Ninguno de producto obligatorio.  
- Ejecutar suites de referencia.

**Riesgo**  
Ninguno.

**Validación**  
- `npm run test:certification`  
- `npx vitest run tests/willard tests/crm`  
- Smoke: WA responde; panel abre.

**GO**  
Baseline verde + equipo alineado con contratos C1–C10.

**NO-GO**  
Suites rotas o desacuerdo sobre writer único / release R2 atómico.

---

### Fase 1 — Projector puro (R1)

**Objetivo**  
Implementar proyección `Conversation` → `PersistedSession` + tests unitarios. **Sin** cablear al DI de producción (o detrás de código no referenciado).

**Archivos previstos**  
- `src/domain/persistence/persistedSession.ts` (reutilizar; solo ampliar si el mapeo lo exige)  
- Nuevo módulo projector, p.ej. `src/application/persistence/ConversationSessionProjector.ts` (nombre orientativo)  
- `tests/willard/conversationSessionProjector.test.ts` (o ruta equivalente)

**Riesgo**  
Bajo.

**Validación**  
- Saludo sin vehículo → sesión proyectable con mensajes y `waId` = `externalId`.  
- Con `salesFlow` / referencia → campos denormalizados correctos.  
- `expiresAt` = `conversation.expiresAt`.  
- Metadata de nombre de cliente preservada.  
- Suite Willard existente verde.

**GO**  
Proyección determinística y cubierta por tests; cumple C1 (a nivel de función) y C4.

**NO-GO**  
Necesidad de modificar motores de venta/orquestador para inventar datos ausentes en el documento CRM.

---

### Fase 2 + Fase 3 — Writer único + cableado (R2, atómico)

Tratar como **una sola unidad de entrega**. No hay deploy intermedio entre 2 y 3.

#### Fase 2 (parte de R2) — Motor sin write/delete

**Objetivo**  
`ConversationEngine` deja de llamar `persistence.save` / `persistence.delete`. Solo `load` para recovery (`maybeRestoreFromPersistence`).

**Archivos previstos**  
- `src/application/services/ConversationEngine.ts` (`persistProductSession` / call sites)  
- Posible ajuste de inyección en `src/infrastructure/di/container.ts`  
- Tests de persistencia/recovery existentes (`tests/willard/sqlitePersistence.test.ts`, etc.)  
- Test C8: saludo no borra `persisted_sessions`

#### Fase 3 (parte de R2) — Projector en write path

**Objetivo**  
Tras cada `save` CRM exitoso (turno OK y camino de error que persiste conversación), ejecutar projector (C1, C2, C3, C7).

**Archivos previstos**  
- `src/application/use-cases/HandleIncomingMessage.ts` **y/o** wrapper de `ConversationRepository`  
- Projector (Fase 1)  
- `src/infrastructure/persistence/SQLitePersistenceRepository.ts` / `SQLiteChatConversationRepository.ts` / `crmSqlite.ts` — solo si hace falta compartir conexión  
- `src/infrastructure/di/container.ts`  
- Tests de integración: CRM save → fila en `persisted_sessions` → `GET /api/conversations` lista el caso  
- Test anti-regresión C8

**Riesgo**  
Medio (recovery, latencia, doble write si se deja el motor a medias). Mitigado por atomicidad del release y C2.

**Validación automatizada**  
- “Hola” → fila CRM + fila `persisted_sessions` (mismo `conversationId` / `waId`).  
- Timeline del detalle incluye inbound y outbound.  
- Recovery post-restart con sesión que tiene progreso.  
- Handoff → lead + Telegram sin regresión.  
- Certificación PS1–PS4 / `test:certification` verde.  
- Motor: tests o inspección garantizan no-`save`/no-`delete` en sessions.

**Validación manual (staging)**  
1. WA real → respuesta.  
2. Panel Conversaciones → aparece el saludo.  
3. Detalle → mensajes Cliente / Rodacenter AI.  
4. Flujo batería + handoff → lead + Telegram.  
5. Redeploy/restart → datos siguen; recovery coherente con TTL.  
6. N mensajes de prueba con **0** fallos de proyección.

**GO R2 → prod**  
- P0 canal PASS.  
- P0 proyección PASS en staging (0 fallos en N).  
- C1–C9 verificados.  
- Plan de rollback (§6) comunicado.

**NO-GO**  
- Silencio WA / duplicados.  
- CRM deja de guardarse.  
- Panel vacío tras saludo en staging.  
- Recovery roto.  
- Motor aún escribe/borra sessions.  
- Proyección antes del outbound.  
- Deploy solo de “mitad” de R2.

---

### Fase 4 — Lectores Dashboard (R3, condicional)

**Objetivo**  
Ajustar mapeos de repos del panel **solo** si UAT mide gaps de shape (estados, teléfono, tareas).

**Archivos previstos (solo si aplica)**  
- `SQLiteConversationRepository.ts`  
- `SQLiteConversationDetailRepository.ts`  
- `SQLiteClientRepository.ts`  
- `SQLiteTaskRepository.ts`  

**Gate cuantitativo**  
Ejecutar 20 conversaciones UAT (saludo, batería, handoff). Si **0 gaps** de listado/detalle → **skip R3**.

**GO**  
Operador ve saludo + flujo + handoff sin datos técnicos rotos.

**NO-GO**  
Cambios que requieran tocar engines Willard.

---

### Fase 5 — Hardening (R4)

**Objetivo**  
Operabilidad en producción y cierre de deuda de observación.

**Archivos previstos**  
- Logs/métricas de proyección (ok/fail)  
- Runbook operativo (este ADR + sección runbook si se añade)  
- Test de certificación “webhook path → dashboard list”  
- Checklist/backfill **opcional** para CRM históricos sin sesión (no bloquea GO de conversaciones nuevas)  
- Mantener test C8 en CI  

**Validación**  
- Alerta fail rate proyección post-deploy.  
- Redeploy: conversaciones siguen.  
- Smoke rollback documentado (aunque se prefiera fix forward).

**GO cierre Opción 2**  
UAT Conversaciones + persistencia post-redeploy PASS; contratos C1–C10 vigentes en código y CI.

---

## 6. Rollback

| Situación | Acción |
|-----------|--------|
| P0 canal en R2 | Revertir release R2; priorizar restauración del canal. Aceptar regresión conocida del panel. |
| Solo proyección fallando, canal OK | Preferir **fix forward** (arreglar projector). |
| Rollback a Legacy | Ejecutar smoke: saludo no debe dejar el panel en estado peor sin monitoreo; si delete reaparece, backfill desde `crm_conversations` y planear re-deploy R2. |
| Flag | Solo ON/OFF del modo Projected completo; no modos parciales. |

---

## 7. Concurrencia y datos

- Webhook: ACK temprano a Meta se mantiene; procesamiento de ítems **secuencial**.  
- Una fila `persisted_sessions` por `wa_id` (= `externalId`): last-write-wins coherente con una sesión activa por número.  
- No paralelizar handlers del mismo número sin lock.  
- Multi-tenant / PK `wa_id`: deuda P2; no empeorar en esta ADR.

---

## 8. Criterios globales de aborto (cualquier release)

Abortar y no promover a prod (o revertir) si:

1. WhatsApp deja de responder o responde duplicado.  
2. Deja de persistirse `crm_conversations`.  
3. Handoff deja de crear lead / Telegram.  
4. Boot prod falla.  
5. `test:certification` o smoke P0 de canal en rojo.  
6. Se detecta que el motor vuelve a `save`/`delete` sessions en R2+.  
7. Proyección usa snapshot pre-outbound.

---

## 9. Definición de terminado (Opción 2)

Un mensaje WhatsApp **nuevo** (incluido saludo) implica:

1. Fila en `crm_conversations`.  
2. Fila en `persisted_sessions` en el mismo ciclo de request, **después** del save CRM, con outbound incluido.  
3. Visible en `GET /api/conversations` / panel Conversaciones.  
4. `expiresAt` alineado al TTL de la conversación.  
5. Sin `delete` por saludo.  
6. Canal, handoff y panel sin regresiones P0.

---

## 10. Orden de implementación para el equipo

1. Leer **solo** este documento.  
2. Ejecutar Fase 0.  
3. Implementar R1 (Fase 1); merge cuando GO.  
4. Implementar R2 (Fases 2+3) en un PR o PRs mergeados al mismo deploy; validar staging; prod con monitoreo C7.  
5. R3 solo si el gate de 20 conversaciones muestra gaps.  
6. R4 hardening y cierre.

No iniciar R2 hasta GO de R1 y checklist C1–C10 revisada en el PR de R2.

---

## 11. Fuera de alcance

- Unificar Dashboard con `crm_leads` / `crm_customers`  
- Eliminar `persisted_sessions` (Opción 3)  
- Hacer que el Dashboard lea únicamente `crm_conversations` sin read model  
- Cambios de producto/UX no relacionados  
- Paralelización del webhook  
- Migración a Postgres / multi-instancia  

---

## 12. Norte (post v1.0) — Opción 3

Cuando Opción 2 esté estable en producción:

1. Mover recovery a leer el documento CRM (o vista).  
2. Reapuntar repos del Dashboard al SSOT CRM (o mantener proyección como caché opcional).  
3. Eliminar escritura dual y, eventualmente, la tabla `persisted_sessions`.  

Eso será un ADR aparte. **No** mezclar con R2.

---

## 13. Referencias internas de código (ancla, no requisito de lectura previa)

| Pieza | Ubicación típica |
|-------|------------------|
| Webhook | `src/presentation/http/routes/whatsappRoutes.ts` |
| Caso de uso canal | `src/application/use-cases/HandleIncomingMessage.ts` |
| CRM conversaciones | `src/infrastructure/persistence/SQLiteChatConversationRepository.ts` |
| Sessions | `src/infrastructure/persistence/SQLitePersistenceRepository.ts` |
| Build sesión | `src/domain/persistence/persistedSession.ts` |
| Gate actual (a retirar en R2) | `ConversationEngine.persistProductSession` |
| Lista Dashboard | `SQLiteConversationRepository` ← `/api/conversations` |

---

## 14. Historial de la decisión

- Se evaluaron: (1) Dashboard lee CRM, (2) proyección sessions ← CRM, (3) eliminar sessions.  
- Se eligió (2) para producción inmediata.  
- Revisión crítica incorporó: snapshot post-outbound, writer único, conexión/reintentos, TTL, release atómico 2+3, rollback/flag, GO dual canal/proyección, test anti-delete, concurrencia webhook, fuera de alcance leads/clientes.  

**Este archivo es el único documento fuente para implementar la sincronización.**
