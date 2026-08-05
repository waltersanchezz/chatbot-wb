# Product UX Review — Rodacenter AI v1.0 (Dashboard operador)

**Rol:** Product Designer / UX Lead / Product Owner  
**Fecha:** 2026-08-03  
**Alcance:** Solo presentación del Dashboard (`apps/dashboard`).  
**Fuera de alcance (sin cambios):** ConversationEngine, BatteryRecommendationEngine, SalesFlowEngine, CRM, autenticación, WhatsApp, Telegram, APIs nuevas, arquitectura.

---

## 1. Problemas encontrados

### Conversaciones / identidad del cliente
- Se mostraba el identificador crudo (`wa:…`, incluso valores no telefónicos como `wa:prod`).
- Nombre vacío se resolvía como “Sin nombre” sin contexto comercial.
- Prefijos técnicos y tipografía monoespaciada reforzaban aspecto de consola de desarrollo.

### Timeline
- Etiqueta “Bot” poco profesional para un asesor.
- Timeline vacío: una línea de texto pobre (“Sin mensajes registrados”).
- No había lectura comercial de hitos (recomendación, lead, handoff).
- `matchKind` y “Lead Score” numérico se exponían con jerga de motor.

### Estados (badges)
- `READY_FOR_ADVISOR` se leía como “Listo asesor” (ambiguo).
- `CLOSED` = “Cerrada” (poco comercial).
- Colores inconsistentes entre Inicio, Conversaciones, Clientes e Historial (a veces raw `salesFlowState`).

### Información técnica en UI
- Copys con “SQLite”, “tenant”, “White-label”, “API OK”, “datos persistentes”.
- Historial mostraba estado técnico en mono (`WAITING_CONFIRMATION`).
- Ficha de cliente mostraba IDs truncados de conversación.
- Login mencionaba SQLite.

### Consistencia visual
- Empty states desiguales (párrafo suelto vs componente).
- Prioridades de tarea sin el mismo sistema de anillo/color que los estados de flujo.
- Jerarquía débil en el drawer: datos técnicos al mismo nivel que vehículo/batería.

---

## 2. Mejoras realizadas

### Identidad del cliente
- Utilidad `operatorDisplay`: formatea teléfono (`+57 310 123 4567`), oculta `wa:`, detecta IDs técnicos → “Número no disponible”.
- Nombre: Meta si existe; si no → `Cliente (+57 310 *** *567)` o “Cliente sin nombre”.
- Botón WhatsApp deshabilitado cuando no hay número usable.

### Timeline y detalle
- Mensajes cronológicos con **Cliente** vs **Rodacenter AI**, fecha/hora y contraste visual.
- Empty state elegante si no hay mensajes.
- Bloque **Hitos comerciales** derivado de datos ya existentes:
  - Recomendación enviada (+ referencia Willard limpia)
  - Lead registrado
  - Handoff al operador
  - Alerta al equipo (Telegram, si aplica el handoff)
  - Sin coincidencia / Finalizado
- Resumen comercial: vehículo, batería Willard, badges de estado/interés/coincidencia.

### Badges unificados
| Estado interno | Etiqueta operador | Color |
|----------------|-------------------|--------|
| NEW | Nueva | Neutro |
| IDENTIFYING_VEHICLE | Identificando | Ámbar |
| RECOMMENDATION_READY | Recomendación | Acento |
| WAITING_CONFIRMATION | Esperando | Ámbar |
| READY_FOR_ADVISOR | Pendiente operador | Rojo (urgencia) |
| CLOSED | Finalizado | Verde |
| match none | Sin coincidencia | Rojo |
| Lead score | Interés Alto/Medio/Bajo | Verde / ámbar / neutro |

### Limpieza de lenguaje
- Eliminadas menciones a SQLite, tenant, white-label y “API OK” en pantallas del operador.
- Referencias `willard:XXX` → etiqueta limpia Willard.
- Subtítulos del layout orientados a operación diaria.

### Pantallas tocadas
1. **Inicio** — KPIs sin jerga; tareas y recientes con badges; empty states.
2. **Conversaciones** — lista + drawer rediseñados.
3. **Clientes** — directorio + ficha comercial.
4. **Vehículos** — ranking y directorio sin IDs crudos.
5. **Historial** — actividad con badges y teléfonos legibles.
6. **Configuración** — copy de empresa profesional.
7. **Login / Topbar / SystemStatus** — tono operador.

---

## 3. Descripción de pantallas (sin capturas adjuntas)

### Inicio
Vista de mando: 5 métricas del día, centro de tareas con prioridad, conversaciones recientes con badge de estado, top vehículos. Sin textos de infraestructura.

### Conversaciones (lista)
Tabla: Cliente (nombre + teléfono formateado), Vehículo, Batería Willard, Estado, Interés, Última actividad.

### Conversaciones (detalle / drawer)
Cabecera con nombre y teléfono → resumen con badges → hitos comerciales → hilo de mensajes Cliente / Rodacenter AI → CTA “Contactar por WhatsApp”.

### Clientes
Directorio alineado al mismo sistema de badges; ficha sin IDs técnicos; historial por referencia Willard + estado.

### Historial / Vehículos
Listados limpios, empty states consistentes, enlaces a bandeja/directorio.

---

## 4. Justificación UX

1. **Confianza:** un asesor no debe ver identificadores internos; reduce dudas (“¿esto es un bug?”) y acelera la llamada.
2. **Orden:** un solo sistema de badges evita interpretar estados distintos en cada pantalla.
3. **Acción:** el drawer prioriza “a quién llamo, qué vehículo, qué batería, qué hito falta”.
4. **Honestidad:** hitos solo se muestran si hay señal en los datos actuales; no se inventan mensajes de chat.
5. **Profesionalismo:** “Rodacenter AI” y empty states cuidan la percepción de producto terminado (v1.0).

---

## 5. Lista de cambios (archivos)

| Archivo | Cambio |
|---------|--------|
| `apps/dashboard/src/lib/operatorDisplay.ts` | **Nuevo** — formato teléfono, nombre, badges, hitos |
| `apps/dashboard/src/components/StatusBadge.tsx` | **Nuevo** — badges reutilizables |
| `apps/dashboard/src/pages/ConversationsPage.tsx` | UX lista + drawer + timeline |
| `apps/dashboard/src/pages/ClientsPage.tsx` | UX directorio + ficha |
| `apps/dashboard/src/pages/HomePage.tsx` | UX inicio operador |
| `apps/dashboard/src/pages/HistoryPage.tsx` | UX historial |
| `apps/dashboard/src/pages/VehiclesPage.tsx` | UX vehículos |
| `apps/dashboard/src/pages/CompanyPage.tsx` | Copy sin jerga técnica |
| `apps/dashboard/src/pages/LoginPage.tsx` | Copy de acceso |
| `apps/dashboard/src/layouts/DashboardLayout.tsx` | Subtítulos comerciales |
| `apps/dashboard/src/components/SystemStatus.tsx` | “Servicio activo” |
| `apps/dashboard/src/components/Topbar.tsx` | Tipografía de rol |
| `apps/dashboard/src/api/conversationsApi.ts` | `wa.me` seguro si no hay dígitos |
| `docs/PRODUCT_UX_REVIEW.md` | Este reporte |

---

## 6. Lo que no se hizo (a propósito)

- No se agregaron APIs ni campos nuevos de timeline/Telegram.
- No se modificaron motores de conversación ni CRM.
- No se eliminó el archivo `mocks/data.ts` (no está en el menú operador; evita scope creep).
- No se cambió el modelo de autenticación ni roles.

---

## 7. Criterio de aceptación UX (operador)

Un asesor puede, en menos de 30 segundos:

1. Ver **quién** escribe (nombre o fallback profesional + teléfono legible).  
2. Ver **qué vehículo y qué Willard** se recomendó.  
3. Ver si está **Pendiente operador**.  
4. Abrir WhatsApp o entender que el número no está disponible.  
5. No encontrar la palabra SQLite, `wa:prod`, ni estados en inglés crudo.

Si eso se cumple en producción con datos reales → Dashboard v1.0 apto para uso diario.
