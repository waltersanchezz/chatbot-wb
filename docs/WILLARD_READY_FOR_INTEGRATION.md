# Willard — Ready for Integration

Estado de la base de conocimiento estructurada (`data/willardApplications.json` +
`data/willardReferences.json`) **antes** de conectar `WillardBatteryKnowledge` /
`RecommendationService`.

Fecha de corte: **2026-07-29**.
Fuente: lote 1 del catálogo oficial (29 páginas). Validación: `node scripts/validar-willard.mjs` OK.
Cobertura regenerable: `node scripts/informe-cobertura.mjs` → `docs/WILLARD_COBERTURA.md`.

**Alcance de este documento:** datos listos para un PR de integración backend.
**Fuera de alcance:** no modificar todavía el chatbot ni mezclar cambios de datos con cambios de `src/`.

---

## Cobertura final

| Métrica | Valor |
|---|---|
| Aplicaciones totales | 744 |
| Utilizables (`revisionPendiente: false`) | **537 (72.2 %)** |
| Pendientes de revisión | **207 (27.8 %)** |
| Marcas con ≥1 aplicación utilizable | **66 / 66 (100 %)** |
| Marcas 100 % cotejadas (0 pendientes) | **38** |
| Modelos distintos utilizables | ver `WILLARD_COBERTURA.md` |
| Páginas del lote transcritas | 29 / 29 |
| Maquinaria agrícola | 10 / 10 limpia |

### Marcas de alta rotación (estabilización 2026-07-29)

| Marca | Utilizable | Total | % | Nota |
|---|---|---|---|---|
| BMW | 28 | 28 | 100 % | Cerrada |
| MAZDA | 22 | 23 | 95.7 % | Solo `CX9 2.017` pendiente |
| KIA | 35 | 39 | 89.7 % | Sorento XM + 3 taxis |
| HYUNDAI | 42 | 50 | 84.0 % | Taxis + 3 buses dudosos |
| FORD | 17 | 32 | 53.1 % | Conflicto zoom p09–p10 |
| CHEVROLET | 25 | 85 | 29.4 % | p07 sombra + taxis/buses |

---

## Marcas completamente cubiertas (38)

AGRALE, ALFA ROMEO, BAIC, BMW, BRILLIANCE, BYD, CASE, CATERPILLAR, CHANA, CHANGAN, CHERY,
CHRYSLER, DFSK, DONG FENG, FORD NEW HOLLAND, GREAT WALL, HAFEI, HINO, IVECO, JBC, JINBEI, JMC,
JOHN DEERE, KUBOTA, LAND ROVER, LIFAN, MAHINDRA, MASSEY FERGUSON, MINI, RAM, SEAT, SKODA,
SSANG YONG, STEWART & STEVENSON, SUZUKI, VOLVO, ZNA, ZOTYE.

---

## Pendientes clasificados (207)

### 1. Sombra / desalineación vertical (mayor volumen)
- `lote1-img-07.jpeg` CHEVROLET: **41** filas (Luv → Zafira). Zoom del borde superior contradice el JSON fila a fila → no se corrigió por inferencia.
- `lote1-img-08.jpeg`: **25** filas (otras marcas).
- CHEVROLET taxis `lote1-img-21` (5) y buses `lote1-img-23` (14).
- FOTON `lote1-img-24` (16).

### 2. Conflicto JSON ↔ impreso (evidencia insuficiente para reasignar)
- FORD F-150 / Ecoboost / Ranger / Fusion / Laser / Mustang / V-8 Escape (p09–p10).
- KIA Sorento XM 2.2/3.5 (familia 27AD en print vs 34D/35 en JSON).
- MAZDA CX9 2.017 (recortes inconsistentes).
- HYUNDAI Aero City / Bus County / H350 (nombres partidos + Willard=Extrema).

### 3. Taxis con refs dudosas
- HYUNDAI y KIA en `lote1-img-22` (incl. `27-80 EFB(2)` en sedán 1.5).

### 4. Literales huérfanos vs lista maestra (filas ya utilizables o pendientes)
- `49-1200`, `65-1150`, `48-1000`/`48-900` sin polaridad, `4DBT-*`, `31H-1200P`, variantes `(2)`, NS40 con sufijos variables.
- El motor puede recomendar la referencia; el cruce a especificación técnica fallará hasta normalizar.

### 5. Decisiones de negocio (no son `revisionPendiente`)
- `CHANA` / `CHANGAN`, `CHERRY` / `CHERY`
- `CHRYSLER Town & Country` bajo encabezado DODGE
- HAFEI vs GEELY mismos nombres de modelo
- `Cupra` bajo HYUNDAI; `Asahi / Matsuri` bajo MAZDA; `Lexus` bajo TOYOTA

Detalle fila a fila: `docs/WILLARD_PENDIENTES.md`.

---

## Riesgos conocidos

1. **Recomendar sobre filas marcadas** → batería incorrecta. Mitigación: filtrar `revisionPendiente === true` en el adaptador.
2. **Chevrolet aún débil** (29 % usable) → muchos clientes de esa marca caerán a asesor. Esperado hasta nueva foto de p07.
3. **Refs sin ficha técnica** (`49-1200`, `65-1150`, `(2)`, etc.) → la recomendación por referencia funciona; dimensiones/polaridad pueden faltar.
4. **Naming de marca inconsistente** → búsqueda por marca incompleta si el cliente dice “Changan” y el índice tiene “CHANA”.
5. **Doble batería `(2)`** embebida en el string → matching exacto contra `willardReferences.json` falla.
6. **Catálogo legado** `data/willard-batteries.json` sigue vivo en runtime hasta el PR de backend; no mezclar ambas fuentes en la misma respuesta.
7. **No inventar** filas sin nombre (Chevy p07/p23, Ford p10): no están en el JSON a propósito.

---

## Recomendaciones para la integración

1. **PR 1 (datos, este corte):** solo `data/willard*.json` + docs. Sin tocar `src/`.
2. **PR 2 (backend, siguiente):** adaptador `WillardBatteryKnowledge` que lea `willardApplications.json`.
3. En el adaptador:
   - Ignorar siempre `revisionPendiente: true`.
   - Si no hay match usable → derivar a asesor (mensaje claro).
   - Resolver referencia → especificación vía `willardReferences.json` con alias opcional para `(2)` y polaridad faltante.
4. Indexar búsqueda por `marca` + `modelo` + `textoCatalogo` (literal), con normalización suave (mayúsculas, espacios).
5. Decidir naming (`CHANA`/`CHANGAN`, etc.) **antes** o en el mismo PR de backend como mapa de alias, no alterando el literal del catálogo.
6. Smoke tests: BMW 320i, Kia Picanto, Mazda CX3, Hyundai Creta, Ford Edge Titanium, Chevrolet Alto; más un Chevrolet Luv (debe ir a asesor mientras p07 esté marcada).
7. No borrar registros pendientes: son el registro oficial del impreso.

---

## Checklist de validación

### Datos (antes del merge del PR de datos)
- [ ] `node scripts/validar-willard.mjs` → OK
- [ ] `node scripts/informe-cobertura.mjs` regenera sin errores
- [ ] Totales: 744 apps, 66 marcas, ≥1 usable por marca
- [ ] Utilizables ≥ 537 (o el número actual tras sync)
- [ ] Toda fila tiene `fuente.imagen` + `fuente.fila`
- [ ] No hay refs inventadas en el diff (solo literales / clears documentados)

### Backend (PR independiente, después de aprobación)
- [ ] Adaptador lee solo `willardApplications.json` + `willardReferences.json`
- [ ] Filtro `revisionPendiente` cubierto por test unitario
- [ ] Caso sin match → deriva a asesor
- [ ] Caso con match → devuelve líneas de producto sin inventar celdas vacías
- [ ] Alias de marca (si aplica) documentado
- [ ] `FileWillardBatteryKnowledge` legado retirado o detrás de flag, no en paralelo silencioso
- [ ] Smoke tests de las 6 marcas de alta rotación

### Operación
- [ ] `docs/WILLARD_PENDIENTES.md` y este archivo actualizados en el PR de datos
- [ ] Aprobación explícita antes de empezar el PR de `WillardBatteryKnowledge`

---

## Siguiente paso

Cuando este informe se apruebe:

1. Abrir **PR de datos** (si aún no está mergeado) sin código de chatbot.
2. Abrir **PR independiente** para adaptar `WillardBatteryKnowledge` y `RecommendationService`.
