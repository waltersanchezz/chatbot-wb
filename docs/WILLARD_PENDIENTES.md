# Willard — Pendientes de revisión

Registro de dudas detectadas al transcribir el catálogo oficial Willard.
Ninguna de estas dudas fue corregida automáticamente. El catálogo impreso es la fuente de verdad.

Convención de origen: las imágenes del lote 1 se renombraron a `lote1-img-01.jpeg` … `lote1-img-29.jpeg`
siguiendo el orden cronológico del envío original de WhatsApp.

Estado del lote 1: **las 29 páginas están transcritas**, 744 aplicaciones, de las cuales **207**
quedan marcadas con `revisionPendiente: true` a la espera de cotejo manual contra el impreso. El
reparto página por página está en `docs/WILLARD_COBERTURA.md`. La herramienta de ampliación para
cotejo está documentada en `docs/AMPLIAR_PAGINA.md`.

**Hito de cobertura por marca (2026-07-29):** las 66 marcas del catálogo tienen al menos una
aplicación utilizable. Quedan filas pendientes dentro de marcas ya cubiertas; no hay marcas en cero.

**Estabilización alta rotación (2026-07-29):** BMW 28/28, MAZDA 22/23, KIA 35/39, HYUNDAI 42/50,
FORD 17/32, CHEVROLET 25/85. Detalle y checklist de integración en
`docs/WILLARD_READY_FOR_INTEGRATION.md`.

---

## Criterio de uso en producción

Decisión de negocio vigente, para que la tome cualquiera que conecte esta base al chatbot:

1. **El motor de recomendación ignora las aplicaciones con `revisionPendiente: true`** al responder a
   un cliente. Son datos leídos del catálogo pero sin cotejar, y recomendar sobre ellos puede terminar
   en una batería que no encaja en el vehículo.
2. **Los registros marcados no se borran.** Se conservan como registro oficial del catálogo y se
   filtran en el momento de consultar. Perder una aplicación oficial es peor que tenerla marcada.
3. **Cuando una fila se coteja, se corrige si hace falta y se pone `revisionPendiente: false`.** Con eso
   entra a producción sin reprocesar nada más. La ruta de vuelta al impreso está en `fuente.imagen` y
   `fuente.fila` de cada registro.
4. **Si no hay ninguna aplicación utilizable para el vehículo del cliente, el chatbot deriva a un
   asesor** en vez de responder con un dato marcado.

**Consecuencia hoy:** la regla deja **537 de 744** aplicaciones utilizables (**72.2 %**), y **las 66
marcas** tienen al menos una recomendación posible. Siguen pendientes **207** filas; la cola está en
`docs/WILLARD_COBERTURA.md`. Tras la estabilización de marcas de alta rotación (2026-07-29), ver
`docs/WILLARD_READY_FOR_INTEGRATION.md`.

**Estado del código:** todavía no hay nada que aplicar esta regla, porque ningún archivo de `src/` lee
`willardApplications.json`. El chatbot sigue recomendando desde `data/willard-batteries.json` a través
de `src/infrastructure/catalog/FileWillardBatteryKnowledge.ts`. El filtro se implementa cuando se
construya el adaptador que conecte esta base al puerto `WillardBatteryKnowledge`. **No iniciar esa
integración hasta aprobación explícita.** Un PR de backend debe ir separado del PR de datos.

---

## Reemplazo de fotografías del 2026-07-28: qué se recuperó y qué sigue pendiente

Se recibieron **dos** tomas nuevas y legibles, que sustituyen a `lote1-img-12.jpeg` y
`lote1-img-28.jpeg` en el repositorio. La segunda es de maquinaria agrícola y corresponde a la
**página 28** (CATERPILLAR, FORD NEW HOLLAND, CASE), **no** a la 29 (JOHN DEERE, KUBOTA,
MASSEY FERGUSON, STEWART & STEVENSON): **la página 29 no tiene fotografía nueva**. Se transcribió
ampliando su foto original a 6x, que alcanzó para leer los valores, y sus filas dudosas quedaron
marcadas.

Las dos fotos nuevas llegan a 899x1599, poca resolución para una tabla tan densa, así que cada bloque
se recortó y amplió entre 4x y 12x antes de transcribirlo.

### Recuperado gracias a la toma nueva de la página 12

31 aplicaciones que **no existían** en la base, con la marca JEEP entrando por primera vez al
catálogo. 25 de las 31 quedaron confirmadas y sin marca; es el porcentaje de filas marcadas más bajo
de toda la sección de autos y camionetas (19,4 % contra 44 % a 100 % en el resto).

| Sección | Filas | Confirmadas | Marcadas |
|---|---|---|---|
| HYUNDAI (`Santro 1.0` … `Veracruz Diesel`) | 10 | 10 | 0 |
| JAC (`B-cross` … `E 10X Electrico`) | 6 | 3 | 3 |
| JEEP (`Cherokee Laredo /Renegade` … `Wrangler V-6 2.014`) | 15 | 12 | 3 |

La toma nueva también cerró dos dudas que la anterior había dejado abiertas: el bloque HYUNDAI
completo, que era ilegible, y la celda Titanio de `JAC E 10X Electrico`, que ahora se lee
`NS60D-750 PD`.

### Recuperado gracias a la toma nueva de la página 28

No hay filas nuevas: las 4 ya estaban transcritas. Lo que la toma nueva aportó fue **confirmar** la
asignación serie-referencia de FORD NEW HOLLAND, que estaba marcada por duda:

| Registro | Valor confirmado | Antes | Ahora |
|---|---|---|---|
| `Tractores series 57/67/77/82/87/TW` | Willard `4DBT-1450`, Extrema `4DBT-1350` | marcado | confirmado |
| `Tractores series 80/90/94/TS` | Extrema `31H-1250 P`, Willard vacío | marcado | confirmado |

Con eso `lote1-img-28.jpeg` es la única página de aplicaciones del lote con **0 filas marcadas**.

### ~~Sigue pendiente: página 29~~ — RESUELTO (cotejo 2026-07-29)

La página no tiene toma nueva; se cotejó ampliando la foto original. Las seis filas quedaron con
`revisionPendiente: false`. Se conservó el literal `31H-1250 P` en Willard y Extrema donde el
impreso lo muestra así (KUBOTA Series M4000 y MASSEY FERGUSON).

| Registro | Estado | Nota |
|---|---|---|
| JOHN DEERE `Tractores` | Confirmado | Sin cambio |
| STEWART & STEVENSON `Bombas 55P3500` | Confirmado | Sin cambio |
| KUBOTA `L3600/L4000/L4200` | Confirmado | Lectura literal de las cuatro columnas |
| KUBOTA `M110/ M120` | Confirmado | Willard `4DBT-1450`, Extrema `4DBT-1350` |
| KUBOTA `Series M4000/series M5000` | Confirmado | `31H-1250 P` en Willard y Extrema (literal del impreso) |
| MASSEY FERGUSON `Tractores` | Confirmado | `31H-1250 P` en Willard y Extrema (literal del impreso) |

**Nota abierta (no bloquea cobertura):** `31H-1250 P` solo figura en Extrema Equipo Pesado de la
lista maestra; en Willard la equivalente listada es `31H-1300 P`. Se dejó el texto impreso.

---

## Lote 1 — páginas transcritas con sombra: revisar fila por fila

Estas páginas se transcribieron completas por decisión de negocio: es preferible tener el registro
marcado que perder la aplicación oficial. Todas las filas afectadas quedaron con
`revisionPendiente: true` y conservan su `textoCatalogo` literal. La duda no es el nombre del
vehículo, que se lee bien, sino **a qué fila corresponde cada referencia**.

### ~~`lote1-img-07.jpeg` — CHEVROLET (continuación), 41 filas~~ — RESUELTO con retoma nítida (2026-07-29)
- **Motivo del cierre:** la retoma confirma asignación fila a fila de `Jimny` a `Zafira`. La transcripción previa estaba corrida ~1 fila (p. ej. `Jimny` tenía datos de `Lumina`).
- **Correcciones literales:** `Jimny` → Extrema `NS40IST-670 PD`; `Luv D-Max Diésel` (acento); `Luv D-Max 2.5 Diesel` sin Extrema (el `34D-950` pertenece a `3.0`); `Spark GTI 1.2LT` / `Spark 1.0…`; `Trailblazer 2.8 Diesel ltz 2.013>` (antes `Trailbrazer…2.012>`).
- **Estado:** 41/41 con `revisionPendiente: false`. Siguen pendientes solo Chevrolet taxis (`lote1-img-21`) y buses (`lote1-img-23`).
- **Nota:** la duda de “fila sin nombre” con `NS40IST-670 PD` era en realidad la Extrema de `Jimny`.

### `lote1-img-08.jpeg` — CITROEN — COTEJO parcial con ampliación (2026-07-29)
Se confirmaron **10 de 17** filas. Corrección de lectura fiel: el modelo `C-6 2.2` es en realidad
**`C-8 2.2`** (confirmado a 8×–10×). `DS3` con Willard `49-1200` y `Jumper`/`Saxo`/`Zx` con
`L1-750 / 36D-750` quedaron confirmados tal como estaban.

**Siguen marcadas 7 filas** (no se reasignó nada entre ellas):

| Registro | Motivo |
|---|---|
| `C-3 1.4` | un recorte acerca `L1-750 / 36D-750` a la frontera con `C3 1.4`; otro lo deja en esta fila |
| `C-4 1.6 /2.0` | la base tiene familia 24BD; varios recortes leen familia 48D |
| `C-4 1.6.16 V DIESEL` | la base tiene familia 48D; varios recortes leen familia 24BD (espejo del anterior) |
| `C4 1.6 VTI 16V Aut` | orden y valores respecto a `C4 Picasso` no coinciden entre recortes |
| `C4 Picasso 2.0 Aut` | un recorte le pone Extrema `24BD-750` junto a Titanio/Willard 48D |
| `Super Nova` | un recorte le da Titanio `24BD-900` completo; otro lo acerca a `L1-750` |
| `Xsara / Picasso 2.0` | la base tiene 24BD; un recorte de la cola lee solo `L1-750 / 36D-750` |

Una fotografía más nítida del bloque C-3 a Xsara cerraría estas siete sin inferencia.

### `lote1-img-08.jpeg` — DAIHATSU, 16 filas
- **Campo con duda:** contenido de las columnas Titanio y Willard
- **Valor leído:** las 16 filas están transcritas, de `Aplause` a `Terios OKII Aut/Mec`
- **Motivo:** la sombra cubre el bloque central. En `Feroza`, `Materia`, `Rocki Gasolina` y `Rocki Diessel` no se puede confirmar si las celdas de Titanio y Willard están vacías o tienen contenido. Dos filas quedaron legibles y sin marca: `F-20` y `F50-Diesel`.
- **Caso adicional:** `Rocki Diessel` quedó con `31H-1250 P` en Extrema, que es una referencia de equipo pesado, algo raro para una camioneta liviana. Y `Rocky` quedó con `48I-900` en Willard y `24BI-750` en Extrema, dos familias que no se corresponden.

### `lote1-img-08.jpeg` — DAIHATSU: `Terios Gasolina` aparece dos veces
- **Campo con duda:** nombre de modelo
- **Valor leído:** dos filas consecutivas con el texto idéntico `Terios Gasolina` y la misma referencia `NS40D PD 670`
- **Motivo:** puede ser una repetición real del catálogo impreso, o una de las dos filas puede tener un texto distinto que la sombra no deja leer. No se colapsaron porque son filas distintas del catálogo; ambas quedaron marcadas.

### `lote1-img-08.jpeg` — DFM: `Pick Up 1.3` y `Pick Up 1.0`
- **Campo con duda:** columnas AGM/EFB y EXTREMA
- **Valor leído:** `Pick Up 1.3` sin AGM/EFB ni Extrema; `Pick Up 1.0` con `27-80 EFB` y `NS40D PD 670`
- **Motivo:** los valores `27-80 EFB` y `NS40D PD 670` están verticalmente entre las dos filas y podrían pertenecer a `Pick Up 1.3`. Además llama la atención que la versión 1.0 lleve una batería mayor que la 1.3.

### ~~`lote1-img-12.jpeg` — HYUNDAI, JAC, JEEP~~ — RESUELTO con la toma del 2026-07-28
El desplazamiento vertical de esta página es de media fila, así que la asignación no se resolvió a ojo
sino contando valores por columna: en las tres secciones el número de valores más el de celdas vacías
coincide exactamente con el número de filas, y el emparejamiento resultante es coherente con la lógica
del catálogo (las versiones Diésel reciben las familias 27AD y 27AI, las Gasolina la 34D). Las seis
dudas que quedaron son de contenido, no de legibilidad, y se detallan más abajo.

### `lote1-img-29.jpeg` — MAQUINARIA AGRÍCOLA — transcrita sin toma nueva, 4 de 6 filas marcadas
Ver el desglose fila por fila al comienzo de este documento y el detalle campo por campo más abajo.

---

## Lote 1 — referencias que no existen en la lista maestra

La lista maestra son las tablas de especificación de `lote1-img-01` a `lote1-img-03` (79 referencias).
Las siguientes referencias aparecen en las páginas de aplicaciones pero **no** figuran en ninguna tabla de especificación.

### AUDI / BMW / CHEVROLET — referencia `49-1200`
- **Campo con duda:** referenciaWillard, columna WILLARD
- **Valor leído:** `49-1200`
- **Motivo:** no existe en las tablas de especificación. La lista maestra tiene `48-1100`, `48D-1000`, `48I-1000`, `34D-1200`, `34I-1200`, `27AD-1200` y `27AI-1200`, pero ninguna `49-...`. Puede ser una referencia real ausente de las páginas de especificación que tengo, o una mala lectura. Aparece en muchas filas, así que conviene confirmarla una sola vez.
- **Filas afectadas:** AUDI A3 2.0 TFSI, A4 2.0 TFSI MU Luxury, A4 Avant 1.8 TFSI MU Comfort, A6 2.8 FSI MU Elegance, Q3 2.0, Q5 2.0 TFSI S-tronic, Q7 3.0 TDI; toda la serie BMW desde `220i` hasta `Z4`; CHEVROLET Trailbrazer 2.8 Diesel (página 7, no incluida)
- **Origen:** `lote1-img-04.jpeg`, `lote1-img-05.jpeg`

### CHERRY / CHEVROLET — referencia `NS40DST-670PS`
- **Campo con duda:** referenciaWillard, columna EXTREMA
- **Valor leído:** `NS40DST-670PS`
- **Motivo:** la lista maestra tiene `NS40DST-670 PD` y `NS40DST-670 PG`. El sufijo `PS` no existe. Posible confusión entre `PG`, `PD` y `PS` a esta resolución.
- **Filas afectadas:** CHERRY QQ 3 (0.8 SE, 0.8 ST, 1.1 SE), CHEVROLET 7/24 Chronos Taxi
- **Origen:** `lote1-img-06.jpeg`

### DODGE / FORD — referencia `65-1150`
- **Campo con duda:** referenciaWillard, columna WILLARD y EXTREMA
- **Valor leído:** `65-1150`
- **Motivo:** la lista maestra tiene `65I-1150` con la `I` de polaridad invertida. En estas páginas se lee sin la `I`. Aparece en varias filas, conviene confirmarla una sola vez.
- **Filas afectadas:** DODGE Dakota (2006-2012), DODGE Ram Diesel, FORD Edge Limited 2.011, FORD Expedition 5.4L, FORD F-150, FORD F-150/F-350 (<88) F-351, FORD Ranger, FORD Ranger 2012, FORD Ranger Raptor
- **Origen:** `lote1-img-09.jpeg`, `lote1-img-10.jpeg`

### DODGE / FORD — referencias `48-1000` y `48-900`
- **Campo con duda:** referenciaWillard, columnas INCREIBLE TITANIO y WILLARD
- **Valor leído:** `48-1000` y `48-900`
- **Motivo:** la lista maestra tiene `48D-1000` y `48I-1000` en Titanio, y `48D-900` y `48I-900` en Willard, siempre con la letra de polaridad. Estas filas se leen sin la `D` ni la `I`. Podría ser pérdida de la letra por la resolución, o una referencia genérica del catálogo.
- **Filas afectadas:** DODGE Ram Todas / Durango, FORD F-150 / Explorer (>88), FORD Laser, FORD Mustang i-90i, FORD Ranger Hi-Rider Diesel Doble Cab 4x4 2.5
- **Origen:** `lote1-img-09.jpeg`, `lote1-img-10.jpeg`

### CHEVROLET Epica 2.5 AUT. y Trailblazer — referencia `48I-850`
- **Campo con duda:** referenciaWillard, columna EXTREMA
- **Valor leído:** `48I-850`
- **Motivo:** la lista maestra de Extrema Titanio tiene `48D-850` y `48-850`, pero no `48I-850`. Las filas son coherentes en el resto (`48I-1000/48-1100` en Titanio y `48I-900` en Willard, ambas polaridad invertida), así que una `48I-850` sería lo lógico. Puede ser una referencia real ausente de la tabla de especificación, o una mala lectura de `48-850`. Se repite en dos páginas distintas, lo que refuerza que sea real.
- **Filas afectadas:** CHEVROLET Epica 2.5 AUT., CHEVROLET Trailblazer
- **Origen:** `lote1-img-06.jpeg` fila 33, `lote1-img-07.jpeg` fila 33

### DAIHATSU — referencia `NS40DST-670PG` sin espacio
- **Campo con duda:** referenciaWillard, columna EXTREMA
- **Valor leído:** `NS40DST-670PG`
- **Motivo:** la lista maestra tiene `NS40DST-670 PG` con espacio antes del sufijo. Aquí se lee pegado. Es el mismo problema de formato que `NS40DST-670PS` en CHERRY, y basta con decidir una vez cómo se normaliza el sufijo en toda la base.
- **Filas afectadas:** DAIHATSU Feroza, DAIHATSU Terios Black and White, DAIHATSU Terios OKII Aut/Mec
- **Origen:** `lote1-img-08.jpeg`

### CHEVROLET Gran Vitara — referencia `24R-75 EFB`
- **Campo con duda:** referenciaWillard, columna WILLARD AGM / EFB
- **Valor leído:** `24R-75 EFB`
- **Motivo:** la lista maestra tiene `24-75 EFB` y `24AD-75 EFB`. Existe `27R-80 EFB` con `R`, así que el patrón `R` es plausible, pero `24R-75 EFB` no está en especificaciones.
- **Origen:** `lote1-img-06.jpeg`, fila 36

---

## Lote 1 — alineación de filas dudosa

### ~~ALFA ROMEO — las 4 filas~~ — RESUELTO (cotejo 2026-07-29)
- **Valor confirmado:** `159 2.2` → Titanio `24BD-900`, Willard `24BD-850`; `159 3.2` → AGM/EFB `W-L3-70AH / 48D-70 EFB`, Titanio `48D-1000/48-1100`, Willard `48D-900`; `GIULIETTA 1.4` → AGM/EFB `W-L2-60AH / 47-60 EFB`, Titanio `24BD-900`, Willard `24BD-850`, Extrema `24BD-750`; `MITO 1.4` → Willard `L1-750 / 36D-750`
- **Motivo del cierre:** ampliación de `lote1-img-04.jpeg` confirma la asignación fila a fila; sin cambios de referencia. Las 4 filas con `revisionPendiente: false`.
- **Origen:** `lote1-img-04.jpeg`, filas 1 a 4

### ~~CHANA — las 4 filas~~ — RESUELTO (cotejo 2026-07-29)
- **Valor confirmado:** Extrema `NS40D PD 670` en las cuatro filas (literal del impreso).
- **Motivo del cierre:** cotejo del bloque; las 4 filas con `revisionPendiente: false`.
- **Origen:** `lote1-img-06.jpeg`, filas 1 a 4

### CHEVROLET Astra
- **Campo con duda:** columna EXTREMA
- **Valor leído:** `42D-900`
- **Motivo:** `42D-900` pertenece a la línea Titanio según especificaciones, no a Extrema (donde la equivalente sería `42D-750`). Puede ser desplazamiento de columna o una excepción real del catálogo.
- **Origen:** `lote1-img-06.jpeg`, fila 14

### CHEVROLET Blazer K5 ( I 6, V8)
- **Campo con duda:** columna INCREIBLE TITANIO
- **Valor leído:** `24BI-900`
- **Motivo:** las columnas Willard y Extrema de esa fila son `34I-1100` y `34I-950`, de la familia 34. Un Titanio `24BI-900` rompe la progresión; en la fila de arriba (`Blazer`) el Titanio es `34I-1200`. Posible desplazamiento vertical.
- **Origen:** `lote1-img-06.jpeg`, fila 20

### CHEVROLET Captiva Sport 3.0 LT F.E.
- **Campo con duda:** columna INCREIBLE TITANIO
- **Valor leído:** `34D-1200`
- **Motivo:** las filas `Captiva` y `Captiva Sport 3.0 LT` traen `48D-1000/48-1100`, y las columnas Willard y Extrema de esta fila siguen siendo `48D-900` y `48D-850`. Un Titanio de la familia 34 no encaja.
- **Origen:** `lote1-img-06.jpeg`, fila 27

---

## Lote 1 — inconsistencias entre secciones

### GEELY y HAFEI comparten los tres mismos modelos
- **Campo con duda:** nombres de modelo de la sección HAFEI *(duda de negocio abierta; filas HAFEI ya cotejadas)*
- **Valor leído:** `LC 5p 1.3`, `New CK 5p 1.5 GL`, `New CK 7 sedan` en ambas marcas
- **Motivo:** las dos secciones de `lote1-img-10.jpeg` listan exactamente los mismos tres nombres, pero con referencias distintas: GEELY lleva la familia 24BD y HAFEI lleva `NS40D PD 670`. Que dos marcas distintas usen los mismos nombres de modelo es posible, pero coincidir en los tres y en el mismo orden sugiere un error de armado del catálogo impreso. Conviene confirmar cuáles son los modelos reales de HAFEI.
- **Cotejo 2026-07-29:** HAFEI 3/3 confirmadas con Extrema `NS40D PD 670`; `revisionPendiente: false`. La duda de nombres compartidos permanece como decisión de negocio.
- **Origen:** `lote1-img-10.jpeg`, filas 19 a 26

### CHRYSLER Town & Country aparece dentro de la sección DODGE
- **Campo con duda:** marca *(duda de negocio abierta; fila ya cotejada)*
- **Valor leído:** el texto de la fila dice `Chrysler Town & Country` pero está impresa bajo el encabezado `DODGE`
- **Motivo:** se registró con marca `CHRYSLER` porque es lo que dice el texto de la celda, no `DODGE` que es la sección. Si prefieres respetar la sección por encima del texto, hay que cambiarlo. Es el único caso de este tipo hasta ahora.
- **Cotejo 2026-07-29:** referencias confirmadas; `revisionPendiente: false`. La marca permanece `CHRYSLER` por el texto de fila.
- **Origen:** `lote1-img-09.jpeg`, fila 2

### FORD — filas sin nombre de vehículo al inicio de `lote1-img-10.jpeg`
- **Campo con duda:** modelo
- **Valor leído:** dos filas con valor `65-1150` en la columna WILLARD y sin nombre de vehículo visible
- **Motivo:** son la continuación de la sección FORD que viene de la página anterior y el nombre quedó fuera del recorte de la foto. No se crearon registros para ellas porque inventar el nombre del vehículo sería inaceptable.
- **Origen:** `lote1-img-10.jpeg`, filas 1 y 2
- **Estado (2026-07-29):** la retoma de Ford p.9 cubre hasta `F-351`; **no** incluye el inicio de p.10. Sigue haciendo falta retoma ancha de `lote1-img-10`.

### ~~FORD F-150 / F-150 Ecoboost / F-150 Explorer / F-351~~ — RESUELTO con retoma p.9 (2026-07-29)
- **Valor confirmado:**
  - `F-150` → AGM `27-80 EFB`, Tit `27AI-1250`, Wil `27AI-1150`, Ext `27AI-1000`
  - `F-150 Ecoboost` → AGM `27-80 EFB`, Tit `27AI-1250`, Wil `65-1150`, Ext `65-1150`
  - `Ford F-150 / Explorer (>88)` → Tit `48I-1000/48-1100`, Wil `48I-900`, Ext `48I-850`
  - `Ford F-150 / F-350 (<88) F-351` → AGM `27-80 EFB`, Tit `27AI-1250`, Wil `65-1150/27AI-1150`
- **No se tocaron** filas Ford ya confirmadas en la misma página (Eco Sport…Focus, etc.).
- **Origen:** retoma `lote1-img-09-retoma-ford.jpeg` (sección FORD de p.9)

### FORD V-8 Escape sin ninguna referencia
- **Campo con duda:** las cuatro columnas de referencia
- **Valor leído:** todas vacías
- **Motivo:** la fila existe en el catálogo con nombre de vehículo pero no se alcanza a leer ninguna referencia. Puede que el catálogo la traiga vacía, o que los valores estén fuera del recorte.
- **Origen:** `lote1-img-10.jpeg`, fila 17
- **Estado:** sigue pendiente; la retoma entregada no cubre p.10.

### `CHERRY` y `CHERY` conviven como dos marcas
- **Campo con duda:** marca
- **Valor leído:** `CHERRY` en la sección de autos de `lote1-img-06.jpeg`, `CHERY` en la sección de taxis de `lote1-img-21.jpeg`
- **Motivo:** es la misma marca escrita de dos formas en el catálogo impreso. No se unificó porque cada encabezado se transcribió tal como aparece. Hay que decidir cuál es la forma canónica; mientras no se decida, una búsqueda por marca devuelve resultados parciales.
- **Origen:** `lote1-img-06.jpeg`, `lote1-img-21.jpeg`

### `CHANA` y `CHANGAN` pueden ser la misma marca
- **Campo con duda:** marca
- **Valor leído:** `CHANA` como sección propia en `lote1-img-06.jpeg`; `Changan CS15` como fila dentro de la sección `VARIOS` de `lote1-img-20.jpeg`
- **Motivo:** Chana y Changan son nombres comerciales relacionados. Se registraron separadas porque el catálogo las presenta separadas. Requiere decisión de negocio.
- **Origen:** `lote1-img-06.jpeg`, `lote1-img-20.jpeg`

### Sección `VARIOS` desglosada en marcas individuales
- **Campo con duda:** marca
- **Valor leído:** el encabezado dice `VARIOS` y cada fila trae el nombre de marca en el texto: `Mahindra Scorpio / Pick up`, `Brilliance V5`, `Baic Kembo K7`, `Changan CS15`, `DFSK Glory 580`
- **Motivo:** se aplicó el mismo criterio que en `CHRYSLER Town & Country`: la marca se tomó del texto de la fila, no del encabezado de sección. Esto creó cinco marcas nuevas (MAHINDRA, BRILLIANCE, BAIC, CHANGAN, DFSK) con una sola aplicación cada una. Si prefieres una marca `VARIOS`, hay que revertirlo.
- **Origen:** `lote1-img-20.jpeg`, filas 24 a 28

### `Lexus` figura como modelo de TOYOTA
- **Campo con duda:** marca
- **Valor leído:** fila `Lexus` dentro de la sección `TOYOTA`
- **Motivo:** Lexus es una marca, no un modelo Toyota. El catálogo la lista como fila, así que se conservó como modelo de TOYOTA. Si Lexus debe ser marca propia, hay que separarla.
- **Origen:** `lote1-img-19.jpeg`, fila 23

### `Cupra` figura como modelo de HYUNDAI
- **Campo con duda:** marca o modelo
- **Valor leído:** fila `Cupra` dentro de la sección `HYUNDAI`, con Willard `L1-750 / 36D-750`
- **Motivo:** Cupra es una marca del grupo Volkswagen, no un modelo Hyundai. Puede ser un error del catálogo impreso o un modelo local con ese nombre.
- **Origen:** `lote1-img-11.jpeg`, fila 18

### `Asahi / Matsuri` figura como modelo de MAZDA
- **Campo con duda:** modelo
- **Valor leído:** `Asahi / Matsuri`
- **Motivo:** ninguno de los dos es un modelo Mazda conocido en el mercado colombiano. Conviene confirmar si son nombres de línea de otra época o un error de armado.
- **Origen:** `lote1-img-14.jpeg`, fila 1

### FOTON aparece en tres bloques separados de la misma página
- **Campo con duda:** estructura de la sección
- **Valor leído:** tres encabezados `FOTON` distintos en `lote1-img-24.jpeg`, con referencias distintas para modelos de igual nombre
- **Motivo:** `BJ 1133 Cummins`, `Camión Cummins`, `Van Carga`, `Dobletroque Auman BJ 3253` y `Volqueta 4x2` aparecen en dos bloques con valores diferentes. Por ejemplo `Van Carga` sale con `4DT-1500 / 4DT-1400` en un bloque y con `31H-1250 P` en el otro, y `Dobletroque Auman BJ 3253` sale con y sin la marca `(2)`. Las filas se conservaron todas, sin colapsar, porque son filas oficiales distintas. Lo que falta es saber qué distingue a cada bloque, probablemente una submarca o un rango de años que quedó fuera del recorte.
- **Origen:** `lote1-img-24.jpeg`

### ~~PEUGEOT `206` aparece dos veces y falta `208`~~ — RESUELTO (2026-07-29)
Ampliación a 5×–7×: la tercera fila se lee **`208`**. Se corrigió `textoCatalogo`/`modelo`
(fila 10). Las tres filas `206`/`207`/`208` comparten el bloque homogéneo
`24BD-900/850/750`.

---

## Lote 1 — páginas 11 a 29: alineación desplazada

En todas estas páginas los valores impresos aparecen desplazados verticalmente respecto a la línea
del vehículo, con el primer bloque de valores a la altura del encabezado de sección. Las filas
afectadas quedaron con `revisionPendiente: true` conservando el texto literal. Donde los valores de
una sección son idénticos en todas sus filas, el desplazamiento no cambia el dato y solo se marcaron
las filas del borde superior e inferior.

### `lote1-img-11.jpeg` — HONDA, 14 filas
- **Campo con duda:** asignación de referencia a fila
- **Motivo:** el bloque está impreso con muy poco contraste. Se marcaron cuatro filas: `New LX Civic` (Titanio `34D-1200` junto a Willard `NS60D-620`, dos familias que no se corresponden), `Odyssey EXL Aut` y `Pilot EXL 3.5 V6 Sunroof` (donde `34D-950` podría leerse `340-950`), y `Ridgeline RTL` (única fila con `35-65 EFB` y `35-800`, sin Titanio ni Extrema).

### `lote1-img-11.jpeg` — HYUNDAI, 26 filas
- **Campo con duda:** asignación de referencia a fila
- **Motivo:** sombra sobre el bloque central, entre `Génesis Coupé Turbo 2.0` e `i45`. Casos concretos que no cuadran: `Accent Vision GLS 4P` mezcla familia 24BD en Titanio y Willard con `42D-750` en Extrema; `i-30 2.000 C.C.` queda con un único valor `24BD-900` mientras `i30` (fila anterior) solo trae AGM. Se marcaron 17 filas; quedaron limpias `Accent / Verna`, `Creta`, `Elantra Avante`, `i30`, `i35`, `Nueva Santa Fe`, `Santa Fe Gasolina` y `Santamo`.

### `lote1-img-12.jpeg` — HYUNDAI `Santro 1.0`: valor impreso a la altura del encabezado
- **Campo con duda:** columna EXTREMA
- **Valor leído:** `NS40D PD 670`
- **Motivo:** el valor está impreso al nivel de la banda gris `HYUNDAI`, por encima de la línea de `Santro 1.0`. Se asignó a `Santro 1.0` porque la columna EXTREMA tiene exactamente 10 valores para las 10 filas de la sección, así que no hay otra fila posible: la anterior (`Santamo`, página 11) ya tiene sus cuatro valores y la secuencia alfabética entre páginas es continua. La referencia sí existe en la lista maestra con ese formato exacto.
- **Estado:** la fila quedó **sin** `revisionPendiente` por lo anterior. Se documenta como observación de alineación, no como duda abierta.
- **Origen:** `lote1-img-12.jpeg`, fila 1

### `lote1-img-12.jpeg` — JAC `B-cross` y `J6`: familias mezcladas entre columnas
- **Campo con duda:** columnas INCREIBLE TITANIO, WILLARD y EXTREMA
- **Valor leído:** Titanio `24BD-900`, Willard `48D-900`, Extrema `48D-850` en las dos filas
- **Motivo:** cada valor está en una columna válida para su línea, pero el salto de la familia 24BD en Titanio a la 48D en Willard y Extrema no aparece en ninguna otra fila del catálogo: lo habitual sería `24BD-850` y `24BD-750`. La alineación de la sección está confirmada por conteo, así que esto no es un corrimiento de fila sino una posible errata del impreso.
- **Origen:** `lote1-img-12.jpeg`, filas 11 y 15

### `lote1-img-12.jpeg` — JAC `J3 / Veloce J3`: referencia de Extrema en la columna Willard
- **Campo con duda:** columna WILLARD
- **Valor leído:** `24BD-750`
- **Motivo:** `24BD-750` figura en la lista maestra como referencia de la línea Extrema Titanio, no de la línea Willard, donde la equivalente sería `24BD-850`. El valor está claramente bajo el encabezado WILLARD y la celda de EXTREMA está vacía. Puede ser una errata del impreso o un desplazamiento horizontal de esa única celda.
- **Origen:** `lote1-img-12.jpeg`, fila 12

### `lote1-img-12.jpeg` — JEEP `Gand Cherokee 2.015`: nombre y fila casi vacía
- **Campo con duda:** modelo y columnas INCREIBLE TITANIO, WILLARD, EXTREMA
- **Valor leído:** el texto impreso dice `Gand Cherokee 2.015`; la única celda con dato es AGM/EFB con `W-L3-70AH / 48D-70 EFB`
- **Motivo:** dos dudas en la misma fila. Primera: `Gand` es con toda probabilidad una errata de `Grand`, y la fila siguiente ya es `Grand Cherokee Laredo 3.6/ 5.7`, así que podrían ser el mismo vehículo. No se corrigió el nombre ni se colapsaron las filas. Segunda: es la única fila del bloque JEEP sin valores en las otras tres columnas, y el conteo por columna confirma que la celda está vacía en el impreso, no que el valor se haya perdido.
- **Origen:** `lote1-img-12.jpeg`, fila 22

### `lote1-img-12.jpeg` — JEEP `Liberty` y `Wrangler V-6 2.014`: polaridad inconsistente dentro de la fila
- **Campo con duda:** letra de polaridad entre las columnas INCREIBLE TITANIO, WILLARD y EXTREMA
- **Valor leído:** `Liberty` → Titanio `48D-1000/48-1100`, Willard `48I-900`, Extrema `48I-850`. `Wrangler V-6 2.014` → Titanio `48I-1000/48-1100`, Willard `48D-900`, Extrema `48D-850`
- **Motivo:** en las dos filas la polaridad cambia a mitad de camino, cuando el resto del bloque es consistente (`Patriot`, `Renegade` y `Rubicon` son `48D` en las tres columnas; `Grand Cherokee Laredo` y `Sport X` son `48I` en las tres). Las letras se leen con nitidez en la toma nueva a 6x, así que no es un problema de resolución: o el impreso trae la errata, o estas dos filas admiten las dos polaridades. Conviene confirmarlo con Willard porque la polaridad determina si la batería entra en el compartimiento.
- **Origen:** `lote1-img-12.jpeg`, filas 24 y 31

### `lote1-img-13.jpeg` — KIA — COTEJO parcial (2026-07-29)
En la cola de la página se confirmaron `Sportage Revolution Diesel.` y
`Sportage Revolution Gasolina.` a 6×. **Siguen marcadas 16 filas** de esta página
(polaridad incompleta, mezcla de familias, Extrema=Willard, celdas dudosas, etc.):
`Besta`, `Cadenza`, `Dectra`, `Epsilon`, `Grand Pregio`, `Magnetis`, `Mohave 3.0 /3.8`,
`New Mohave`, `Optima 2.4 16V Aut`, `Picanto / GT / X-LINE`, `Picanto ION 1.0`, `Rio`,
`Rio 2.018`, `Sorento XM 2.2/3.5`, `Sportage Gasolina 2.0L  2017+`, `Stonic`.

### ~~`lote1-img-13.jpeg` — LAND ROVER, 9 filas~~ — RESUELTO con ampliación (2026-07-29)
Las 9 filas se confirmaron a 6×–10×. Extrema queda inequívoca:
`Defender 110SW` / `Discovery` / `Santana` → `27AI-1000`;
`Defender 90` y el bloque Freelander/Range Rover (5 filas) → `31H-1250 P`.
Correcciones: Supercargada Extrema `27AI-1000`→`31H-1250 P`; Santana Extrema
`[]`→`27AI-1000`. Todas con `revisionPendiente: false`.

### `lote1-img-14.jpeg` — MAZDA, 23 filas
- **Campo con duda:** asignación de referencia a fila
- **Motivo:** los valores están desplazados hacia arriba y hay un `55DD-800` suelto entre `BT-50 PROFESSIONAL` y `CX3`. Ocho filas terminan con `55DD-800` como único valor, en la columna WILLARD, sin Titanio ni Extrema. Quedaron limpias `CX30`, `CX30 Hybrid`, `Mazda 626` y `Miata`.

### `lote1-img-14.jpeg` — MERCEDES BENZ `SPRINTER`
- **Campo con duda:** columna WILLARD
- **Valor leído:** `49-1250`
- **Motivo:** la lista maestra tiene `49-1200`, no `49-1250`. Es la única fila de la sección con un valor fuera de la columna AGM/EFB. En la sección de buses de `lote1-img-27.jpeg` el `Sprinter 313` sí aparece con `49-1200`, lo que sugiere que este `49-1250` es una mala lectura, pero no se corrigió.
- **Origen:** `lote1-img-14.jpeg`, fila 35

### `lote1-img-15.jpeg` — MITSUBISHI `Space Wagon`
- **Campo con duda:** columna INCREIBLE TITANIO
- **Valor leído:** `24B-900`
- **Motivo:** falta la letra de polaridad entre `24B` y `-900`. Podría ser `24BD-900` o `24BI-900`; la Extrema de la misma fila es `24BI-750`, lo que apunta a `24BI-900`, pero no se corrigió.
- **Origen:** `lote1-img-15.jpeg`, fila 19

### `lote1-img-15.jpeg` — NISSAN, referencia `34-850`
- **Campo con duda:** columna EXTREMA
- **Valor leído:** `34-850`
- **Motivo:** la lista maestra no tiene `34-850`; tiene `34I-950`, `34D-950` y `34D-850`. Falta la letra de polaridad. Aparece en dos filas, lo que sugiere que es un valor real del impreso y no un borrón puntual.
- **Filas afectadas:** NISSAN Frontier, NISSAN Frontier NP300 2.4 Gasolina 4x2 <2015
- **Origen:** `lote1-img-15.jpeg`, filas 22 y 25

### `lote1-img-16.jpeg` — NISSAN (continuación) — COTEJO parcial (2026-07-29)
Se confirmaron **6 de 7** filas a 5×–8×. Corrección: `Vanette` Extrema
`24BD-750` → `27AI-1000` (coherente con Titanio/Willard 27AI). **Sigue marcada 1:**

| Registro | Motivo |
|---|---|
| `Urvan` | Titanio/Willard familia 34D con Extrema `48D-850` (salto de familia) |

### `lote1-img-16.jpeg` — PEUGEOT — COTEJO parcial (2026-07-29)
Se confirmaron **9 de 10** filas. Corrección `206`→`208` (fila 10). Bloque homogéneo
`206`–`308` con familia 24BD; `408`/`508` familia 48D; `2008`/`3008` con `47-60 EFB`.
**Sigue marcada 1:**

| Registro | Motivo |
|---|---|
| `Expert L3 2.0 HDI Diesel` | AGM/EFB leído `48-70 EFB` (falta polaridad `D` vs lista maestra `48D-70 EFB`); no se inventó la letra |

### ~~`lote1-img-16.jpeg` — RAM `2500 SLT Diesel`~~ — RESUELTO (2026-07-29)
Referencias con `(2)` confirmadas a 5×: `27-80 EFB(2)` / `27AI-1250 (2)` /
`65-1150` + `27AI-1150 (2)`. `revisionPendiente: false`.

### `lote1-img-17.jpeg` — RENAULT — COTEJO parcial (2026-07-29)
Se confirmaron **18 de 27** filas a 5×–8× donde el bloque era homogéneo y sin conflicto
entre recortes. **Siguen marcadas 9:**

| Registro | Motivo |
|---|---|
| `Duster 1.6` | frontera con filas vecinas; recortes no coinciden en asignación |
| `Fluence` | Titanio/Willard familia 48D con Extrema `24BD-750` (salto de familia) |
| `Gran Scenic II` | conflicto de frontera entre recortes |
| `Kangoo` | conflicto de frontera entre recortes |
| `Kangoo Z.E.` | conflicto de frontera entre recortes |
| `Koleos 2.017` | conflicto de frontera / lectura del año |
| `Megane I 1.4/1.6` | conflicto de frontera entre recortes |
| `Megane III` | Titanio/Willard familia 48D con Extrema `24BD-750` (salto de familia) |
| `Twingo` | conflicto de frontera entre recortes |

`Zoe` se confirmó vacía en las cuatro columnas (celdas vacías del impreso, no error de lectura).

### ~~`lote1-img-17.jpeg` — SEAT, 7 filas~~ — RESUELTO con ampliación (2026-07-29)
Las 7 filas se confirmaron a 5×–8×. Corrección de asignación fila↔referencia:
`Ibiza` queda sin AGM/EFB y con Titanio/Willard/Extrema `24BD-900/850/750`;
`León` lleva `W-L3-70AH / 48D-70 EFB` + familia 48D;
`Toledo` lleva `W-L2-60AH / 47-60 EFB` + Titanio `24BD-900/42D-900`.
Todas con `revisionPendiente: false`.

### ~~`lote1-img-17.jpeg` — SKODA, 5 filas~~ — RESUELTO con ampliación (2026-07-29)
Las 5 filas se confirmaron a 5×: `Octavia` es la única con AGM `W-L3-70AH / 48D-70 EFB`;
`Roomster` usa familia 24BD; el resto familia 48D sin AGM. Todas con
`revisionPendiente: false`.

### ~~`lote1-img-18.jpeg` — SSANG YONG, 8 filas~~ — RESUELTO con ampliación (2026-07-29)
Las 8 filas se confirmaron a 5×–10×. Las seis primeras comparten el bloque homogéneo
`27-80 EFB` / `27AI-1250` / `27AI-1150` / `27AI-1000`. `Stavic 2.7 Turbo Diesel` cambia a Titanio
`24BD-900` y Willard `24BD-850` (conserva AGM `27-80 EFB`). `Tivoli` queda solo con AGM
`W-L2-60AH / 47-60 EFB`. Todas con `revisionPendiente: false`.

### `lote1-img-18.jpeg` — SUBARU — COTEJO parcial (2026-07-29)
Se confirmaron 6 de 8 filas (`Forester`, `GL 2000 / GX`, `Impreza`, `Outback 2.5 / 3.0 /3.6`,
`Tribeca  3.6`, `XV`). **Siguen marcadas 2:**

| Registro | Motivo |
|---|---|
| `Forester Hybrid` | el impreso usa la conjunción `y` (`55DD-800 y NS60I-620` o `NS60L-620`); un recorte deja Extrema vacío y otro acerca `24BD-750` |
| `Legacy` | un recorte le asigna Extrema `24BD-750`; la transcripción actual la tiene vacía |

No se reasignó Extrema ni se normalizó la `y` a barra.

### ~~`lote1-img-18.jpeg` — SUZUKI, 15 filas~~ — RESUELTO con ampliación (2026-07-29)
Las 15 filas se confirmaron a 5×–8× contra el impreso: los valores coinciden con la transcripción
y la asignación fila↔referencia es inequívoca (no hay conflicto entre recortes). Corrección de
lectura fiel: el modelo `Dzere` es en realidad **`Dzire`**. Todas las filas quedaron con
`revisionPendiente: false`. SSANG YONG y SUBARU de la misma página no se tocaron.

### `lote1-img-19.jpeg` — TOYOTA — COTEJO con `ampliar-pagina.ps1` (2026-07-29)
La sección se amplió por bloques a 5×–12×. **28 de 34 filas** quedaron confirmadas y con
`revisionPendiente: false`. No se inventó ningún valor: donde varios recortes coincidían con la
transcripción y la familia era coherente, se levantó la marca. Siguen marcadas 6 filas:

| Registro | Motivo que permanece |
|---|---|
| `Fortuner 2.7L` | Titanio `27AD-1250` con Willard `34D-1100` / Extrema `34D-950`; recortes a 10× asignan esos `34D` a la frontera con `FJ Cruiser` |
| `Fortuner 3.9` | Willard `27AD-1150` con Extrema `34D-950`, cambio de familia |
| `Hilux 2018` | única celda `49-1200` (huérfana respecto a la lista maestra) |
| `Hilux 4X2 / 4X4` | Extrema = Willard `48D-900` |
| `Land Cruiser` | Extrema = Willard `27AI-1150` en un bloque; otro recorte deja Extrema vacío |
| `Lexus` | marca listada como modelo de TOYOTA (ver inconsistencias entre secciones) |

Nota: `Crown Royal` Extrema `34I-850` **sí** está en la lista maestra (Extrema Titanio); se desmarcó.

También se corrigió el texto `RAV 4 Life 4x4 Auf` → `RAV 4 Life 4x4 Aut.` tras leerlo a 8×.

### ~~`lote1-img-19.jpeg` — VOLKSWAGEN `Cross Fox`~~ — RESUELTO con ampliación
- **Valor corregido:** `L1-750 / 36D-750` (antes se había leído `36D-250`)
- **Motivo del cierre:** el bloque VW ampliado a 5× muestra `36D-750`, que coincide con el par habitual del catálogo y con la lista maestra. Las 9 filas VW de esta página quedaron confirmadas.
- **Origen:** `lote1-img-19.jpeg`, fila 38

### `lote1-img-20.jpeg` — VOLKSWAGEN (continuación) — COTEJO parcial con ampliación (2026-07-29)
Se confirmaron 4 de 9 filas (`New Jetta`, `Saveiro 1.6`, `T Cross`, `Tiguan`). **Siguen
marcadas 5 filas** porque los recortes a 5×–10× no coinciden en la asignación de la cola:

| Registro | Valor actual en la base | Conflicto observado al ampliar |
|---|---|---|
| `Tiguan 1.4 Trendline 2.018` | Willard `L1-750 / 36D-750` | un recorte acerca `W-L2-60AH / 47-60 EFB` a esta línea |
| `Tiguan 2.0 All Space 2.018` | AGM `W-L2-60AH / 47-60 EFB` + Willard `49-1200` | otro recorte deja solo el AGM aquí y mueve `49-1200` a `Touareg` |
| `Touareg` | Extrema `31H-1250 P` | un bloque lo lee como Willard `49-1200`; otro como Extrema `31H-1250 P` |
| `Transporter GP 2.0 TDI` | Titanio `42D-900`, Willard `L1-750 / 36D-750` | un bloque le asigna Extrema `31H-1250 P` y deja las baterías livianas a `Voyage` |
| `Voyage` | sin ninguna referencia | un bloque le asigna `42D-900` y `L1-750 / 36D-750` |

**No se reasignó nada por inferencia.** Hace falta una fotografía más nítida de esas cinco filas
(sin reflejo y con la hoja plana) para cerrarlas. No es ilegibilidad total: los valores se leen;
lo que no se resuelve es a qué fila pertenece cada uno.

### ~~`lote1-img-20.jpeg` — VOLVO `XV 90`~~ — RESUELTO con ampliación
- **Valor confirmado:** AGM/EFB `W-L5-95AH / W-L6-105AH`, sin Titanio/Willard/Extrema
- **Motivo del cierre:** a 8×–12× el valor queda sobre la línea `XV 90` (texto literal del
  catálogo; no se normalizó a XC 90). Las otras nueve filas VOLVO ya estaban confirmadas.
- **Origen:** `lote1-img-20.jpeg`, fila 19

### ~~`lote1-img-20.jpeg` — ZOTYE, 2 filas~~ — RESUELTO con ampliación
- **Valor confirmado:** Extrema `NS40D PD 670` en `Duna 1.6 4x2` y en `Nomada 1.6 D.H. A.A`
- **Motivo del cierre:** ambas celdas se leen sobre su propia línea a 5×–10×; no hay conflicto
  de asignación entre las dos filas.

### ~~`lote1-img-20.jpeg` — sección VARIOS, 5 filas~~ — RESUELTO (valores); marca sigue documentada
Se confirmaron los valores de `Mahindra Scorpio / Pick up`, `Brilliance V5`, `Baic Kembo K7`,
`Changan CS15` y `DFSK Glory 580`. La decisión de negocio de desglosar `VARIOS` en marcas
individuales sigue documentada más arriba; eso no es una duda de lectura.

### `lote1-img-21.jpeg` — CHEVROLET sección Taxis, 5 filas
- **Campo con duda:** asignación de referencia a fila
- **Motivo:** es el desplazamiento más claro de todo el lote. `Taxi 7.24` queda con Willard `34D-1100` y Extrema `NS40D PD 670`, dos familias sin relación; `Optra 1.6 Serv. Esp.` queda con Titanio `24BI-900` y Extrema `34D-950`, también sin relación; `Chevrotaxi Swift` queda solo con Extrema. Las cinco filas quedaron marcadas.

### `lote1-img-22.jpeg` — referencia `24BDST-750`
- **Campo con duda:** columna EXTREMA
- **Valor leído:** `24BDST-750`
- **Motivo:** el sufijo `ST` corresponde a la línea Extrema Taxi, y la lista maestra de esa línea tiene `24BDST-750` — conviene confirmar que la especificación está cargada, porque el cruce automático no la encuentra. Aparece en ocho filas de taxis de cinco marcas.
- **Filas afectadas:** GEELY CK 1.3 GL, GEELY CK 1.5 GL, HYUNDAI Accent, KIA Taxi S-5, KIA Ekotaxi II, LIFAN 520 LX Sedán, RENAULT R9, RENAULT Symbol, RENAULT Clio
- **Origen:** `lote1-img-22.jpeg`

### `lote1-img-22.jpeg` — KIA `Taxi S-5 1.5 RS sedán A.A D.H.` con `27-80 EFB(2)`
- **Campo con duda:** columna WILLARD AGM / EFB
- **Valor leído:** `27-80 EFB(2)`
- **Motivo:** dos baterías `27-80 EFB` en un taxi sedán de 1.5 no tiene sentido técnico; el `(2)` es la notación que el catálogo usa para buses y camiones. Puede ser un valor desplazado desde otra tabla.
- **Origen:** `lote1-img-22.jpeg`, fila 10

### `lote1-img-22.jpeg` — HYUNDAI sección Taxis, 5 filas
- **Campo con duda:** asignación de referencia a fila
- **Motivo:** `i25` queda con AGM `35-65 EFB`, Titanio `24BD-900` y Willard `35-800`, sin Extrema, mientras las demás filas del bloque solo traen Extrema. Las cinco filas quedaron marcadas.

### `lote1-img-23.jpeg` — CHEVROLET buses, 14 filas y fila sin nombre
- **Campo con duda:** asignación de referencia a fila; modelo en la primera fila
- **Valor leído:** la primera fila del bloque muestra `4DT-1500` en WILLARD y `4DT-1400` en EXTREMA sin nombre de vehículo
- **Motivo:** el nombre quedó fuera del recorte o viene de la página anterior. No se creó registro. Además `FVR Forward 7.8` es la única fila del bloque con familia `4DT` en vez de `27AI`, lo que puede ser consecuencia del desplazamiento. Las 14 filas con nombre quedaron marcadas.
- **Origen:** `lote1-img-23.jpeg`

### ~~`lote1-img-24.jpeg` — DONG FENG 7 filas~~ — RESUELTO (cotejo 2026-07-29); FOTON sigue pendiente
- **DONG FENG:** las 7 filas confirmadas con Extrema `31H-1250 P` únicamente; `revisionPendiente: false`. El valor extra a altura de encabezado no se reasignó a ninguna fila.
- **FOTON:** las 16 filas siguen marcadas (bloqueo de `Volqueta 4x2` sin refs / posible desplazamiento).
- **Origen:** `lote1-img-24.jpeg`

### ~~`lote1-img-25.jpeg` — HINO, 13 filas~~ — RESUELTO (cotejo 2026-07-29)
- **Correcciones aplicadas:** `BUS RK8J` solo Willard `55DD-800 (2)` (se quitó AGM `35-65 EFB(2)` mal asignado); `Dutro Pro Euro IV 2016` recibió AGM `35-65 EFB(2)`; modelo `FC8J` corregido a `FC9J`.
- **Notas abiertas (no bloquean cobertura):** `4DT-1400` huérfano a altura de encabezado HINO no reasignado; `GB Minibuseta` conserva `31H-1200P` literal (ausente en lista maestra).
- **Estado:** 13/13 con `revisionPendiente: false`.
- **Origen:** `lote1-img-25.jpeg`

### `lote1-img-25.jpeg` — HYUNDAI buses: nombres de modelo partidos en dos líneas
- **Campo con duda:** modelo
- **Valor leído:** `H350/Furgon/Estacas` seguido de `/Cabinas 4 Toneladas`; `Nuevo Porter TCI Turbocargado` seguido de `intercooler`
- **Motivo:** son nombres largos que el catálogo parte en dos líneas. Se unieron en un solo registro cada uno, asumiendo que no son dos vehículos distintos. Hay que confirmarlo. Además `H350...` quedó con `27AI-1150` repetido en Willard y en Extrema, y `Bus County` con `24AD-900` repetido en las mismas dos columnas.
- **Origen:** `lote1-img-25.jpeg`, filas 16 y 22

### ~~`lote1-img-26.jpeg` — IVECO, 13 filas~~ — RESUELTO (cotejo 2026-07-29)
- **Correcciones aplicadas:** `Buseta` tomó el bloque 27AI completo (continuación de impresión); `Chasis Volqueta` → Willard `4DT-1500` / Extrema `4DT-1400` (antes mal como `31H`); CNG `60C14G` → `65C14G` con Willard `31H-1300 T` / Extrema `31H-1250 T`.
- **Estado:** 13/13 con `revisionPendiente: false`.
- **Origen:** `lote1-img-26.jpeg`

### `lote1-img-26.jpeg` — JAC buses, 5 filas
- **Campo con duda:** asignación de referencia a fila
- **Motivo:** `Veloce 1.3` quedó con `55DD-800` repetido en Willard y Extrema, y `Rein 2.4 4x2` con `24AD-900` repetido en las mismas dos columnas. Repetir el mismo valor en dos líneas de producto distintas no ocurre en el resto del catálogo. Las cinco filas quedaron marcadas.

### `lote1-img-27.jpeg` — NISSAN buses: `Urvan 3.0 Diesel` y `Urvan microbús 3.0 diésel 12p`
- **Campo con duda:** las cuatro columnas de referencia
- **Valor leído:** todas vacías
- **Motivo:** son las dos últimas filas del bloque y no se ve ninguna referencia. Por el desplazamiento de la página, sus valores podrían ser los que quedaron asignados a `TK 55` y `U41`. Nota adicional: `Urvan microbús 3.0 diésel 12p` también existe en la sección de autos y camionetas (`lote1-img-16.jpeg`) con Extrema `31H-1250 P`; son dos filas oficiales distintas y ambas se conservaron.
- **Origen:** `lote1-img-27.jpeg`, filas 20 y 21

### `lote1-img-27.jpeg` — RENAULT `Master`
- **Campo con duda:** asignación de referencia a fila
- **Valor leído:** `49-1200` en WILLARD
- **Motivo:** es la única fila de la sección y el valor está impreso a la altura del encabezado, no de la fila.
- **Origen:** `lote1-img-27.jpeg`, fila 22

### `lote1-img-27.jpeg` — referencia `31H-1300T` sin espacio
- **Campo con duda:** columna WILLARD
- **Valor leído:** `31H-1300T`
- **Motivo:** en el resto del catálogo se imprime `31H-1300 T` con espacio antes de la `T`. Aquí aparece pegado en las nueve filas de KENWORTH y MACK. Es el mismo problema de formato de sufijo que `NS40DST-670PG`.
- **Origen:** `lote1-img-27.jpeg`

### ~~`lote1-img-28.jpeg` — FORD NEW HOLLAND: dos filas con el mismo nombre de modelo~~ — RESUELTO con la toma del 2026-07-28
- **Campo con duda:** a qué serie corresponde cada referencia
- **Valor confirmado:** `Tractores series 57/67/77/82/87/TW` → Willard `4DBT-1450`, Extrema `4DBT-1350`. `Tractores series 80/90/94/TS` → Extrema `31H-1250 P`, sin valor en Willard.
- **Motivo del cierre:** en la toma nueva los dos valores de la primera serie quedan claramente sobre la línea `57/67/77/82/87/TW` y el `31H-1250 P` sobre la línea `80/90/94/TS`. La transcripción original era correcta y las dos filas quedaron con `revisionPendiente: false`.
- **Origen:** `lote1-img-28.jpeg`, filas 2 y 3

### ~~`lote1-img-29.jpeg` — KUBOTA, 3 filas~~ — RESUELTO (cotejo 2026-07-29)
- **Valor confirmado:** `L3600/L4000/L4200` → AGM `27-80 EFB`, Titanio `27AI-1250`, Willard `27AI-1150`, Extrema `27AI-1000`. `M110/ M120` → Willard `4DBT-1450`, Extrema `4DBT-1350`. `Series M4000/series M5000` → Willard `31H-1250 P`, Extrema `31H-1250 P` (literal).
- **Nota abierta:** `4DBT-1450` / `4DBT-1350` y el doble `31H-1250 P` siguen fuera o en línea distinta de la lista maestra; se conservó el texto impreso.
- **Origen:** `lote1-img-29.jpeg`, filas 2 a 4

### ~~`lote1-img-29.jpeg` — MASSEY FERGUSON `Tractores`~~ — RESUELTO (cotejo 2026-07-29)
- **Valor confirmado:** `31H-1250 P` en WILLARD y EXTREMA (literal del impreso).
- **Nota abierta:** misma referencia en dos líneas de producto; solo figura como Extrema en la lista maestra.
- **Origen:** `lote1-img-29.jpeg`, fila 5

### Notación `(2)` de doble batería sin normalizar
- **Campo con duda:** formato de la referencia
- **Valor leído:** `27-80 EFB(2)`, `27AI-1250 (2)`, `4DT-1500 (2)`, `55DD-800 (2)`, `35-65 EFB(2)`, `24-75 EFB(2)`, `34I-1200(2)`
- **Motivo:** el catálogo marca con `(2)` los vehículos que llevan dos baterías en paralelo. Se conservó el texto literal, con y sin espacio antes del paréntesis según cómo esté impreso, así que la misma referencia aparece en varias formas y el cruce contra `willardReferences.json` no la encuentra. Hay que decidir si el `(2)` se mueve a un campo aparte, por ejemplo `cantidad`, en vez de vivir dentro del texto de la referencia.
- **Origen:** `lote1-img-19.jpeg`, `lote1-img-22.jpeg`, `lote1-img-23.jpeg`, `lote1-img-24.jpeg`, `lote1-img-25.jpeg`

---

## Lote 1 — dudas en las tablas de especificación

### `42D-900` (Willard Titanio)
- **Campo con duda:** alto
- **Valor leído:** `169`
- **Motivo:** las filas vecinas `24BD-900` y `24BI-900` comparten largo 237 y ancho 173 pero alto 188. El 169 coincide con la familia 42 de otras líneas, así que puede ser correcto, pero no se distingue con seguridad.
- **Origen:** `lote1-img-01.jpeg`

### `48-1100` (Willard Titanio)
- **Campo con duda:** polaridad
- **Valor leído:** `(+ -) (- +)`
- **Motivo:** la celda muestra dos valores de polaridad, algo que no ocurre en ninguna otra fila del catálogo.
- **Origen:** `lote1-img-01.jpeg`

### `48I-1000` (Willard Titanio)
- **Campo con duda:** polaridad
- **Valor leído:** `(- +)`
- **Motivo:** en todo el catálogo el sufijo `I` corresponde a polaridad invertida `(+ -)`. Leer `(- +)` contradice el patrón. Mismo caso en `48-850` de Extrema Titanio y `48IST-850` de Extrema Taxi.
- **Origen:** `lote1-img-01.jpeg`, `lote1-img-03.jpeg`

### `55DD-800` (Willard)
- **Campo con duda:** ancho
- **Valor leído:** `173`
- **Motivo:** `35-800`, con el mismo largo 230 y alto 218, tiene ancho 176. No se distingue si son 173 o 176.
- **Origen:** `lote1-img-02.jpeg`

### `8DT-1500` (Extrema Equipo Pesado)
- **Campo con duda:** voltaje
- **Valor leído:** celda vacía
- **Motivo:** todas las demás filas de la tabla traen 12. En esta la celda se ve vacía, probablemente por el reflejo.
- **Origen:** `lote1-img-03.jpeg`

### `4DBTI-1350` (Extrema Equipo Pesado)
- **Campo con duda:** polaridad
- **Valor leído:** `(- +)`
- **Motivo:** el sufijo `I` sugiere `(+ -)`, igual que el caso de `48I-1000`. En la línea Willard Equipo Pesado, `4DBTI-1450` sí aparece como `(+ -)`.
- **Origen:** `lote1-img-03.jpeg`

### Familia `NS40` de Extrema Titanio
- **Campo con duda:** referencia y polaridad de 6 filas
- **Valor leído:** `NS40D-560 PD`, `NS40I-560 PD`, `NS40D-PD560 K*`, `NS40D-670`, `NS40D PD 670`, `NS40D-PD670K*`
- **Motivo:** el formato del sufijo cambia entre filas (`-560 PD` contra `-PD560`, con y sin espacio, con y sin guion) y la tercera fila muestra polaridad `(+ -)` aunque la referencia lleva `D`. Conviene confirmar la escritura exacta de las seis, porque son las referencias de mayor rotación en carros pequeños.
- **Origen:** `lote1-img-03.jpeg`

### Familia `NS40...ST-670` de Extrema Taxi
- **Campo con duda:** sufijo `PD` contra `PG`
- **Valor leído:** `NS40DST-670 PD`, `NS40IST-670 PD`, `NS40DST-670 PG`
- **Motivo:** `PD` y `PG` se confunden a esta resolución y la diferencia importa: es lo que distingue terminal delgado de estándar.
- **Origen:** `lote1-img-03.jpeg`

---

## Cierre de marcas sin cobertura (2026-07-29)

Prioridad ejecutada: HINO → IVECO → DONG FENG → CHRYSLER → CHANA → HAFEI → AGRALE → KUBOTA → MASSEY FERGUSON.
Además se cerró ALFA ROMEO (única marca en cero restante tras el lote). Resultado: **66/66 marcas** con al menos una aplicación utilizable.

| Marca | Filas | Resultado | Notas |
|---|---|---|---|
| HINO | 13/13 | Confirmado + correcciones | Ver sección HINO arriba |
| IVECO | 13/13 | Confirmado + correcciones | Ver sección IVECO arriba |
| DONG FENG | 7/7 | Confirmado | Extrema `31H-1250 P` |
| CHRYSLER | 1/1 | Confirmado | Marca bajo sección DODGE: decisión abierta |
| CHANA | 4/4 | Confirmado | Extrema `NS40D PD 670` |
| HAFEI | 3/3 | Confirmado | Extrema `NS40D PD 670`; nombres = GEELY: decisión abierta |
| AGRALE | 1/1 | Confirmado | `Buseta o Camion` → `4DT-1500` / `4DT-1400` (`lote1-img-23.jpeg`) |
| KUBOTA | 3/3 | Confirmado | Incluye `31H-1250 P` en Willard+Extrema (literal) |
| MASSEY FERGUSON | 1/1 | Confirmado | Idem `31H-1250 P` dual |
| ALFA ROMEO | 4/4 | Confirmado | Sin cambio de refs |

**Pendientes que NO son filas marcadas** (decisiones / higiene antes de integrar):
- Unificar o no `CHANA`/`CHANGAN`, `CHERRY`/`CHERY`
- `CHRYSLER` vs sección `DODGE`
- HAFEI vs GEELY mismos nombres de modelo
- Normalizar notación `(2)` y refs huérfanas vs `willardReferences.json`
- Filas aún marcadas (207) en marcas ya cubiertas — cola en `WILLARD_COBERTURA.md`

---

## Estabilización marcas de alta rotación (2026-07-29)

Solo se cerraron filas con evidencia de ampliación. Dudas y conflictos JSON↔impreso permanecen
marcados. Script: `scripts/cotejo-estabilizacion-rotacion.mjs`.

| Marca | Antes (pend) | Después | Utilizable |
|---|---|---|---|
| BMW | 23 | 0 | 28/28 |
| MAZDA | 19 | 1 (`CX9 2.017`) | 22/23 |
| KIA | 19 | 4 | 35/39 |
| HYUNDAI | 29 | 8 | 42/50 |
| FORD | 18 | 15 | 17/32 |
| CHEVROLET | 67 | 60 | 25/85 |

**Correcciones literales aplicadas:**
- CHEVROLET Chronos: Extrema `NS40DST-670PS` → `NS40DST-670PG`
- KIA Besta / Cadenza: polaridad Titanio/Extrema a `48I-*`
- KIA Sportage Gasolina 2017+: celdas vacías → Tit `24BD-900` / Wil `24BD-850`

**Se mantuvieron pendientes a propósito (antes de la retoma de la noche):**
- CHEVROLET `lote1-img-07` (41), taxis p21, buses p23 — sombra / desalineación
- FORD F-150 / Ranger bloque p09–p10 — conflicto entre JSON y zoom
- KIA Sorento XM + taxis p22; HYUNDAI taxis p22 + Aero/County/H350; MAZDA CX9 2.017

---

## Retoma nítida Chevrolet p.7 / Ford p.9 / EXTREMA TAXI (2026-07-29 noche)

Script: `scripts/cotejo-retoma-chevy-ford.mjs`. Imágenes: `lote1-img-07.jpeg` (reemplazada),
`lote1-img-09-retoma-ford.jpeg`, `lote1-img-03-extrema-taxi-retoma.jpeg`.

| Ámbito | Pendientes cerrados | Quedan pendientes |
|---|---|---|
| CHEVROLET autos `lote1-img-07` | **41** | 0 en esa página |
| CHEVROLET total marca | 60 → **19** | taxis p21 (5) + buses p23 (14) |
| FORD `lote1-img-09` (F-150…F-351) | **4** | 0 pendientes en p.9 |
| FORD total marca | 15 → **11** | todo el bloque `lote1-img-10` (Raptor…V-8 Escape) |
| EXTREMA TAXI specs | **4** (`NS40DST-670 PD`, `NS40IST-670 PD`, `NS40DST-670 PG`, `48IST-850`) | — |

**Observación (no modificado):** `24BDST-750`, `35DST-800` y `48DST-850` ya tenían
`revisionPendiente: false`, pero la retoma de EXTREMA TAXI muestra CCA/CA distintos (parece
desfase previo de filas en specs). Por regla de no tocar confirmados, **no se alteraron**;
convienen un cotejo deliberado aparte.
