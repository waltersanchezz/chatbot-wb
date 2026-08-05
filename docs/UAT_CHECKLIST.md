# UAT Checklist — Rodacenter AI v1.0 (producción real)

**Rol del documento:** aceptación de producto (UAT) ejecutada por operador / negocio antes del primer cliente real.  
**Entorno:** producción Render (o equivalente) con WhatsApp Cloud API y Telegram reales.  
**Alcance v1.0:** canal WhatsApp → asesoría baterías Willard → handoff a asesor → panel operador + notificación Telegram.  
**Fuera de alcance v1.0:** Billing, Marketplace, Copilot, multi-tenant SaaS, RBAC API por rol, multi-instancia.

---

## 0. Cómo usar este checklist

| Campo | Instrucción |
|-------|-------------|
| Ejecutor | Operador Rodacenter + apoyo técnico (si aplica). Idealmente **dos personas**: una escribe por WhatsApp, otra observa panel/Telegram. |
| Marca | Cada caso: `PASS` / `FAIL` / `BLOCKED` / `N/A`. |
| Evidencia | Captura de pantalla o nota con hora, teléfono de prueba y URL del host. |
| Regla de paro | Cualquier **FAIL** en caso **P0** → detener UAT, no abrir a clientes, escalar a desarrollo. |
| Orden | Ejecutar en el orden de las secciones (infra → seguridad → canal → negocio → panel → recuperación). |
| Teléfono de prueba | Número WhatsApp **controlado** (no cliente real). Anotar: `________________`. |
| Host producción | `https://________________`. |
| Fecha / versión deploy | `____ / ____` · commit o deploy id: `________________`. |

**Firmas al final del documento** (sección 12).

---

## 1. Precondiciones (bloqueantes)

Completar **antes** de empezar los casos. Si alguna falla, UAT = **BLOCKED**.

| ID | Precondición | Cómo verificar | Estado |
|----|--------------|----------------|--------|
| PRE-01 | Servicio en plan Starter+ con disco `/var/data` | Render → Disk montado; `SQLITE_PATH=/var/data/rodacenter.sqlite` | ☐ |
| PRE-02 | Secretos de producción configurados (no defaults) | JWT, admin password, WA verify/app secret/token/phone id, Telegram token+chat | ☐ |
| PRE-03 | `NODE_ENV=production`, `AUTH_REQUIRED=true` | Variables en Render | ☐ |
| PRE-04 | Webhook Meta apunta a `https://<host>/webhook/whatsapp` | Meta Developer → WhatsApp → Configuration | ☐ |
| PRE-05 | Número WhatsApp Business suscrito al webhook | Mensajes entrantes llegan a la app | ☐ |
| PRE-06 | Bot Telegram del asesor recibe mensajes del chat configurado | Enviar `/start` o mensaje de prueba previo si aplica | ☐ |
| PRE-07 | Credenciales admin de panel conocidas por el ejecutor | Usuario/contraseña distintos de `admin123` | ☐ |
| PRE-08 | Catálogo Willard desplegado con el build | Deploy reciente exitoso; sin errores de boot en logs | ☐ |

---

## 2. Infraestructura y salud del servicio

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| INF-01 | P0 | Health público | Abrir o `GET https://<host>/health` | HTTP **200**, cuerpo indica servicio sano (sin stack trace) | ☐ |
| INF-02 | P0 | Servicio arrancó en prod | Revisar logs de Render del último deploy | Sin `Production security check failed`; proceso en ejecución | ☐ |
| INF-03 | P1 | Debug off | `GET https://<host>/api/debug` (y rutas hijas si se conocen) | **404** (no montado en production) | ☐ |
| INF-04 | P1 | Panel estático disponible | Abrir `https://<host>/dashboard/` | Carga login o app (no 502/404 blanco) | ☐ |

---

## 3. Seguridad (canal y APIs)

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| SEC-01 | P0 | Webhook sin firma | `POST https://<host>/webhook/whatsapp` con body JSON válido de Meta **sin** header `X-Hub-Signature-256` | HTTP **403** | ☐ |
| SEC-02 | P0 | Webhook con firma inválida | Mismo POST con firma inventada | HTTP **403** | ☐ |
| SEC-03 | P0 | API CRM sin token | `GET https://<host>/api/leads` sin `Authorization` | HTTP **401** | ☐ |
| SEC-04 | P0 | API clientes sin token | `GET https://<host>/api/customers` sin auth | HTTP **401** | ☐ |
| SEC-05 | P1 | Login panel con password incorrecta | En `/dashboard/login` usar password errónea | Error de credenciales; **no** entra al panel | ☐ |
| SEC-06 | P1 | Sesión inválida | Con token basura en storage (o cookie/localStorage) forzar llamada API | Vuelve a login / sesión expirada; no datos filtrados | ☐ |
| SEC-07 | P1 | Verify token Meta | En Meta, re-verificar webhook (o GET challenge con token correcto) | Meta muestra webhook verificado / challenge OK | ☐ |

---

## 4. Canal WhatsApp — humo y latencia

Usar el **teléfono de prueba**. Cronometrar primera respuesta.

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| WA-01 | P0 | Primer mensaje recibido | Enviar “Hola” al número Business | Recibe respuesta automática en WhatsApp (no silencio > 30 s) | ☐ |
| WA-02 | P0 | Respuesta sale por Cloud API | Observar mensaje entrante en el teléfono | Mensaje legible del bot (no error Meta “No se pudo enviar”) | ☐ |
| WA-03 | P1 | Latencia aceptable | Medir desde envío hasta primera burbuja | ≤ **15 s** en condiciones normales (anotar: _____ s) | ☐ |
| WA-04 | P1 | Mensaje vacío / emoji solo | Enviar solo “👍” o espacios | Bot no se cae; responde o pide aclaración; conversación sigue usable | ☐ |
| WA-05 | P1 | Texto largo | Pegar párrafo > 500 caracteres | Respuesta controlada; sin error permanente de canal | ☐ |
| WA-06 | P2 | Fuera de horario / volumen | Enviar 3 mensajes seguidos rápidos | No hay 3 respuestas idénticas absurdas por duplicado de webhook; conversación coherente | ☐ |

---

## 5. Flujo de negocio — baterías Willard (camino feliz)

**Vehículo de referencia sugerido** (ajustar si el catálogo local exige otro): marca/modelo/año conocidos del catálogo Willard desplegado.  
Ejemplo de trabajo: **Chevrolet Spark ~2018** (confirmar en catálogo si aplica). Anotar vehículo usado: `________________`.

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| BIZ-01 | P0 | Inicio de asesoría | Indicar intención de batería / seguir el menú o preguntas del bot | Bot guía a datos de vehículo (marca/modelo/año) sin inventar proceso de cierre | ☐ |
| BIZ-02 | P0 | Captura de vehículo | Responder marca, modelo y año cuando los pida | Bot confirma o resume el vehículo de forma coherente | ☐ |
| BIZ-03 | P0 | Pregunta planta de sonido (si aplica) | Responder sí/no según el flujo | Avanza sin bloqueo; no pide datos absurdos | ☐ |
| BIZ-04 | P0 | Recomendación Willard | Completar hasta recomendación | Menciona referencia(s) **Willard** creíbles (ej. formato tipo `75D23L` / catálogo); **no** inventa marca competidora como si fuera Willard | ☐ |
| BIZ-05 | P0 | Referencia no inventada | Comparar ref. mostrada con catálogo interno / conocimiento del asesor | La referencia existe en el catálogo de producto desplegado | ☐ |
| BIZ-06 | P1 | Confirmación de interés | Aceptar / mostrar interés en la recomendación | Bot cierra o deriva a asesor según diseño; tono comercial claro | ☐ |
| BIZ-07 | P1 | Segunda consulta mismo número | Tras cerrar o reiniciar, preguntar por otro vehículo o “otra batería” | Flujo usable; no mezcla datos del vehículo anterior de forma confusa | ☐ |

---

## 6. Casos de borde — asesoría (calidad de producto)

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| EDGE-01 | P0 | Vehículo desconocido / sin match | Indicar marca/modelo/año improbable (ej. auto muy raro o año absurdo) | **No** inventa batería; pide aclaración o deriva a asesor | ☐ |
| EDGE-02 | P1 | Corrección de datos | Dar marca incorrecta y luego corregir (“no, es Chevrolet”) | Bot acepta corrección; no se queda atrapado | ☐ |
| EDGE-03 | P1 | Ambigüedad de modelo | Dar solo marca o modelo incompleto | Pide el dato faltante; no recomienda a ciegas | ☐ |
| EDGE-04 | P1 | Pedido de precio / stock | Preguntar “¿cuánto vale?” o “¿tienen en stock?” | No inventa precio/stock si no hay fuente; ofrece asesor o respuesta honestamente limitada | ☐ |
| EDGE-05 | P2 | Tema fuera de baterías | Preguntar por algo no Willard (ej. llantas genéricas) | Redirige o handoff; no inventa catálogo | ☐ |
| EDGE-06 | P2 | Insulto / spam | Mensaje agresivo o irrelevante | Respuesta controlada; opcional handoff; canal no se rompe | ☐ |

---

## 7. Handoff humano + Telegram + CRM

**Crítico para vender mañana:** el cliente nunca debe oír “un asesor te contacta” sin que exista lead + alerta.

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| HO-01 | P0 | Handoff explícito | Pedir hablar con un asesor / humano | Bot confirma handoff; no deja al usuario en limbo | ☐ |
| HO-02 | P0 | Lead creado | Tras HO-01, abrir panel → Conversaciones / Clientes / leads visibles | Existe lead o cliente del **mismo teléfono** de prueba | ☐ |
| HO-03 | P0 | Telegram llega | Revisar chat Telegram del asesor | Notificación de lead nuevo con datos útiles (teléfono y/o vehículo/resumen) | ☐ |
| HO-04 | P0 | Handoff temprano (sin terminar catálogo) | En mitad del flujo pedir asesor **antes** de tener categoría completa | Igual: respuesta al cliente + lead + Telegram (no handoff silencioso) | ☐ |
| HO-05 | P1 | Prioridad / urgencia | Observar lead de handoff en panel | Marcado como handoff / prioridad alta si el producto lo muestra | ☐ |
| HO-06 | P1 | Datos útiles para el asesor | Leer notificación + ficha en panel | Asesor puede llamar sin releer todo el chat a ciegas (teléfono + contexto mínimo) | ☐ |
| HO-07 | P2 | Doble handoff | Pedir asesor dos veces | No crea spam infinito de Telegram idéntico; estado coherente (1 lead actualizado o política clara) | ☐ |

---

## 8. Panel operador (`/dashboard`)

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| UI-01 | P0 | Login producción | Entrar con admin real | Acceso a Inicio; no password de desarrollo | ☐ |
| UI-02 | P0 | Menú operador | Revisar navegación | Solo: **Inicio, Conversaciones, Clientes, Vehículos, Historial, Configuración**. Sin módulos Beta (Billing, Copilot, etc.) | ☐ |
| UI-03 | P0 | Datos reales post-WA | Tras WA-01 / BIZ / HO, abrir Conversaciones y Clientes | Aparece la conversación/cliente de prueba (no listas vacías “mock”) | ☐ |
| UI-04 | P1 | Inicio / estado | Abrir Inicio | Métricas o estado del sistema sin error permanente; retry si falla red | ☐ |
| UI-05 | P1 | Vehículos | Abrir Vehículos | Vehículo consultado en la prueba aparece o la vista indica vacío real (no error 500) | ☐ |
| UI-06 | P1 | Historial | Abrir Historial | Timeline o listado usable; datos coherentes con la prueba | ☐ |
| UI-07 | P1 | Configuración (Admin) | Abrir Configuración con rol Administrador | Página carga; guardar un cambio menor (si aplica) o al menos lectura OK | ☐ |
| UI-08 | P2 | Móvil | Abrir panel en teléfono (ancho estrecho) | Menú accesible (drawer); login y Conversaciones usables | ☐ |
| UI-09 | P2 | Logout | Cerrar sesión | Vuelve a login; rutas protegidas ya no muestran datos | ☐ |

---

## 9. Recuperación, persistencia e idempotencia

| ID | Prioridad | Caso | Pasos | Resultado esperado | Resultado |
|----|-----------|------|-------|--------------------|-----------|
| REC-01 | P0 | Persistencia post-redeploy | Anotar lead/conversación de prueba → **Manual Deploy** o restart del servicio → esperar health 200 | Mismo lead/cliente/conversación **sigue existiendo** en el panel | ☐ |
| REC-02 | P0 | Disco no efímero | Tras restart, enviar nuevo “Hola” desde el mismo número | Sesión/historial no parte de cero de forma inexplicable (o recovery coherente según TTL) | ☐ |
| REC-03 | P1 | Idempotencia webhook | (Técnico) Reenviar el mismo evento Meta / mismo `wamid` si se puede | **No** doble respuesta idéntica al cliente | ☐ |
| REC-04 | P1 | Continuidad de chat | Tras 2–3 minutos idle, continuar la misma conversación | Bot recuerda contexto reciente (marca/modelo) dentro del TTL de sesión | ☐ |

---

## 10. Criterios de negocio / experiencia (aceptación cualitativa)

Marcar PASS solo si el producto es **vendible** ante un cliente real.

| ID | Prioridad | Criterio | PASS si… | Resultado |
|----|-----------|----------|----------|-----------|
| EXP-01 | P0 | Confianza de marca | El bot se presenta / opera como Rodacenter / Willard de forma clara | ☐ |
| EXP-02 | P0 | No inventa producto | Ninguna recomendación “fantasma” en las pruebas P0 de negocio | ☐ |
| EXP-03 | P0 | Cierre humano confiable | Todo handoff generó rastro operable (panel + Telegram) | ☐ |
| EXP-04 | P1 | Tono comercial usable | Respuestas entendibles para cliente de taller/retail (sin jerga técnica rota) | ☐ |
| EXP-05 | P1 | Operador puede trabajar | Un asesor sin mirar logs puede tomar el lead y contactar al cliente | ☐ |

---

## 11. Matriz de severidad y decisión

| Severidad | Definición | Acción |
|-----------|------------|--------|
| **P0** | Impide vender o rompe seguridad/datos/canal | UAT **FAIL** global → **NO GO** |
| **P1** | Degrada operación pero hay workaround | Documentar; GO solo con plan de mitigación firmado |
| **P2** | Cosmético / raro | Backlog; no bloquea v1.0 |

**Regla oficial:**

- Cualquier **P0 = FAIL** → **NO se declara v1.0 listo**.
- Más de **2 P1 = FAIL** sin mitigación escrita → **NO GO**.
- **P2** no bloquean.

---

## 12. Criterios exactos para declarar Rodacenter AI v1.0 listo para producción

Marcar **todos** los siguientes. Solo entonces el Product Owner puede firmar el GO oficial.

### 12.1 Obligatorios (100 % PASS)

- [ ] **INF-01, INF-02** — servicio sano en producción  
- [ ] **SEC-01, SEC-02, SEC-03, SEC-04, SEC-07** — webhook firmado + APIs no públicas + Meta verify  
- [ ] **WA-01, WA-02** — WhatsApp real bidireccional  
- [ ] **BIZ-01 … BIZ-05** — asesoría Willard con referencia de catálogo real  
- [ ] **EDGE-01** — no inventa batería ante sin-match  
- [ ] **HO-01 … HO-04** — handoff + lead + Telegram (incluye handoff temprano)  
- [ ] **UI-01, UI-02, UI-03** — panel operador con menú correcto y datos reales  
- [ ] **REC-01** — redeploy no borra leads/conversaciones  
- [ ] **EXP-01, EXP-02, EXP-03** — confianza, no inventar, handoff operable  

### 12.2 Condiciones de entorno

- [ ] Secretos de producción distintos de defaults de desarrollo  
- [ ] Disco persistente activo (`/var/data`)  
- [ ] Ejecutores UAT distintos del “cliente real” del día 1 (teléfono de prueba)  
- [ ] Evidencias (capturas / notas) adjuntas o enlazadas para HO-03, BIZ-04, REC-01  

### 12.3 Declaración formal

```
Producto:     Rodacenter AI
Versión:      v1.0
Entorno:      Producción (________________)
Fecha UAT:    ________________
Resultado:    ☐ GO oficial   ☐ NO-GO   ☐ GO con excepciones P1 documentadas

Excepciones P1 (si aplica):
1. ________________________________________________
2. ________________________________________________

Ejecutor UAT (nombre / firma):     ________________
Product Owner (nombre / firma):    ________________
Responsable técnico (nombre / firma): ________________
```

**Definición de “listo para producción” (v1.0):**  
Rodacenter AI v1.0 se declara listo cuando **todos los ítems de §12.1 y §12.2 están PASS**, no exista ningún P0 abierto, y el Product Owner firme **GO oficial** en §12.3. A partir de ese momento el número Business puede atender clientes reales para asesoría de baterías Willard con handoff a asesores humanos.

**Si falta un solo ítem P0 de §12.1:** el estado oficial es **NO-GO**, aunque el deploy esté verde y las pruebas automatizadas pasen.

---

## 13. Registro rápido de evidencias

| Caso | Hora | Evidencia (ruta / nota) |
|------|------|-------------------------|
| WA-01 | | |
| BIZ-04 | | |
| HO-03 | | |
| UI-03 | | |
| REC-01 | | |
| SEC-01 | | |

---

## 14. Referencias

- Certificación técnica: `docs/PRODUCTION_CERTIFICATION.md`  
- Runbooks: `docs/PRODUCTION_RUNBOOK_PS1.md`, `PS3.md`, `PS4.md`  
- Variables: `.env.example` (sección producción)

---

*Documento UAT — sin desarrollo de nuevas funcionalidades. Cualquier defect P0 descubierto durante la ejecución debe escalarse y corregirse antes de re-ejecutar la sección afectada y firmar el GO.*
