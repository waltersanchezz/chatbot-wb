# Willard — Informe de cobertura

> Generado por `scripts/informe-cobertura.mjs` a partir de `data/willardApplications.json` y
> `data/willardReferences.json`. No editar a mano: cualquier cambio se pierde al regenerar.
> Todos los totales se derivan de las imágenes efectivamente procesadas. Ninguna cifra se estima.

## Cobertura de imágenes

Del lote 1 se procesaron **29 de 29** páginas.

| Uso de la página | Páginas |
|---|---|
| Tablas de especificación | 3 |
| Tablas de aplicaciones | 26 |
| Sin leer | 0 |

Todas las páginas del lote fueron transcritas.

## Totales

| Métrica | Total |
|---|---|
| Marcas | 66 |
| Modelos distintos (marca + modelo) | 632 |
| Aplicaciones (filas de vehículo del catálogo) | 744 |
| Menciones de referencia (celdas con dato) | 2.045 |
| Referencias únicas citadas en aplicaciones | 89 |
| Referencias con especificación técnica | 90 |
| Registros pendientes de revisión | 162 (21.8 %) |

Una aplicación es una fila de vehículo del catálogo. Una mención es una referencia dentro de una
columna de esa fila, así que un vehículo con referencia en las cuatro líneas suma una aplicación y
cuatro menciones. Confundir ambas métricas infla el total unas 2.7 veces.

## Aplicaciones por sección del catálogo

| Sección | Aplicaciones | % |
|---|---|---|
| Autos y camionetas | 590 | 79.3 % |
| Buses y camiones | 120 | 16.1 % |
| Taxis | 24 | 3.2 % |
| Maquinaria agricola | 10 | 1.3 % |

## Referencias por línea de producto

| Línea | Referencias distintas | Menciones | Aplicaciones que la citan | % de aplicaciones |
|---|---|---|---|---|
| Willard AGM / EFB | 15 | 356 | 278 | 37.4 % |
| Increible Titanio | 17 | 604 | 490 | 65.9 % |
| Willard | 29 | 617 | 574 | 77.2 % |
| Extrema | 37 | 468 | 466 | 62.6 % |

## Cobertura utilizable en producción

Por decisión de negocio, el motor de recomendación **debe ignorar los registros con
`revisionPendiente: true`** al responder a un cliente, para no recomendar sobre datos que todavía no
se cotejaron contra el impreso. Esta sección mide qué queda disponible bajo esa regla. Los registros
marcados siguen en el archivo: no se borran, se filtran en el momento de consultar.

| Métrica | Utilizable | Total | % |
|---|---|---|---|
| Aplicaciones | 582 | 744 | 78.2 % |
| Marcas | 66 | 66 | 100.0 % |
| Modelos distintos | 522 | 632 | 82.6 % |

| Sección | Utilizable | Total | % |
|---|---|---|---|
| Autos y camionetas | 490 | 590 | 83.1 % |
| Buses y camiones | 73 | 120 | 60.8 % |
| Taxis | 9 | 24 | 37.5 % |
| Maquinaria agricola | 10 | 10 | 100.0 % |

### Marcas que hoy quedarían sin ninguna recomendación

Todas las marcas tienen al menos una aplicación utilizable.

## Pendientes de revisión por página

Vista para planear el cotejo contra el impreso: cuántas filas de cada página quedaron marcadas.
4 de las 26 páginas de aplicaciones están limpias.

| Página | Aplicaciones | Marcadas | % marcado |
|---|---|---|---|
| `lote1-img-04.jpeg` | 23 | 7 | 30.4 % |
| `lote1-img-05.jpeg` | 32 | 0 | 0.0 % |
| `lote1-img-06.jpeg` | 36 | 5 | 13.9 % |
| `lote1-img-07.jpeg` | 41 | 0 | 0.0 % |
| `lote1-img-08.jpeg` | 39 | 25 | 64.1 % |
| `lote1-img-09.jpeg` | 38 | 4 | 10.5 % |
| `lote1-img-10.jpeg` | 24 | 11 | 45.8 % |
| `lote1-img-11.jpeg` | 40 | 4 | 10.0 % |
| `lote1-img-12.jpeg` | 31 | 6 | 19.4 % |
| `lote1-img-13.jpeg` | 44 | 1 | 2.3 % |
| `lote1-img-14.jpeg` | 39 | 2 | 5.1 % |
| `lote1-img-15.jpeg` | 42 | 11 | 26.2 % |
| `lote1-img-16.jpeg` | 20 | 2 | 10.0 % |
| `lote1-img-17.jpeg` | 39 | 9 | 23.1 % |
| `lote1-img-18.jpeg` | 31 | 2 | 6.5 % |
| `lote1-img-19.jpeg` | 43 | 6 | 14.0 % |
| `lote1-img-20.jpeg` | 28 | 5 | 17.9 % |
| `lote1-img-21.jpeg` | 8 | 5 | 62.5 % |
| `lote1-img-22.jpeg` | 16 | 10 | 62.5 % |
| `lote1-img-23.jpeg` | 15 | 14 | 93.3 % |
| `lote1-img-24.jpeg` | 23 | 16 | 69.6 % |
| `lote1-img-25.jpeg` | 33 | 4 | 12.1 % |
| `lote1-img-26.jpeg` | 27 | 5 | 18.5 % |
| `lote1-img-27.jpeg` | 22 | 8 | 36.4 % |
| `lote1-img-28.jpeg` | 4 | 0 | 0.0 % |
| `lote1-img-29.jpeg` | 6 | 0 | 0.0 % |

## Aplicaciones por marca

| Marca | Aplicaciones |
|---|---|
| CHEVROLET | 85 |
| HYUNDAI | 50 |
| KIA | 39 |
| TOYOTA | 34 |
| NISSAN | 33 |
| FORD | 32 |
| RENAULT | 31 |
| BMW | 28 |
| MAZDA | 23 |
| MITSUBISHI | 22 |
| AUDI | 19 |
| MERCEDES BENZ | 19 |
| VOLKSWAGEN | 18 |
| CITROEN | 17 |
| FOTON | 17 |
| DAIHATSU | 16 |
| JEEP | 15 |
| SUZUKI | 15 |
| HONDA | 14 |
| FIAT | 13 |
| HINO | 13 |
| IVECO | 13 |
| JAC | 13 |
| INTERNATIONAL | 10 |
| PEUGEOT | 10 |
| VOLVO | 10 |
| DODGE | 9 |
| LAND ROVER | 9 |
| SSANG YONG | 8 |
| SUBARU | 8 |
| CHERRY | 7 |
| DONG FENG | 7 |
| SEAT | 7 |
| DFM | 6 |
| MACK | 6 |
| GEELY | 5 |
| JMC | 5 |
| SKODA | 5 |
| ALFA ROMEO | 4 |
| BYD | 4 |
| CHANA | 4 |
| HAFEI | 3 |
| JBC | 3 |
| KENWORTH | 3 |
| KUBOTA | 3 |
| MINI | 3 |
| RAM | 3 |
| FORD NEW HOLLAND | 2 |
| GREAT WALL | 2 |
| ZNA | 2 |
| ZOTYE | 2 |
| AGRALE | 1 |
| BAIC | 1 |
| BRILLIANCE | 1 |
| CASE | 1 |
| CATERPILLAR | 1 |
| CHANGAN | 1 |
| CHERY | 1 |
| CHRYSLER | 1 |
| DFSK | 1 |
| JINBEI | 1 |
| JOHN DEERE | 1 |
| LIFAN | 1 |
| MAHINDRA | 1 |
| MASSEY FERGUSON | 1 |
| STEWART & STEVENSON | 1 |

## Conciliación con un reporte externo

El negocio recibió un resumen con otras cifras y determinó que **no es una fuente oficial y no debe
usarse para validar el catálogo**. Se deja constancia de la comparación para explicar por qué se
descartó, no para corregir nada.

| Métrica | Derivado de las imágenes | Reporte externo | Lectura |
|---|---|---|---|
| Marcas | 66 | 42 | El reporte externo tiene menos marcas pese a declarar más registros |
| Modelos | 632 | 1.385 | No reconciliable sin el detalle fila por fila |
| Aplicaciones | 744 | 2.764 | Métricas distintas: ver nota 1 |
| Menciones de referencia | 2.045 | 2.764 | Métrica comparable con su total de aplicaciones |
| Referencias únicas | 89 | 96 | Órdenes de magnitud compatibles |
| Willard AGM / EFB | 356 | 138 | Ver nota 2 |
| Increible Titanio | 604 | 482 | Ver nota 2 |
| Willard | 617 | 1.420 | Ver nota 2 |
| Extrema | 468 | 724 | Ver nota 2 |
| Pendientes de revisión | 162 | 17 | Ver nota 3 |
| Páginas verificadas | 29 | 29 | Ver nota 4 |

**Nota 1.** En el reporte externo las cuatro líneas suman exactamente su total de aplicaciones
(138 + 482 + 1420 + 724 = 2.764). Eso indica que su
"aplicaciones" cuenta celdas de referencia, no filas de vehículo. La métrica comparable de esta base
es 2.045 menciones.

**Nota 2.** El reparto entre líneas del reporte externo asigna
51.4 % de todas sus menciones a la columna Willard y solo
5.0 % a AGM/EFB. En esta base, con menos volumen, AGM/EFB acumula
356 menciones frente a sus 138. Un total mayor con menos AGM/EFB en
términos absolutos es compatible con que valores de la columna AGM/EFB hayan quedado cargados en la
columna Willard, que es el desplazamiento documentado en `docs/WILLARD_PENDIENTES.md`.

**Nota 3.** 162 de 744 registros quedaron marcados porque en la mayoría de las páginas los
valores están impresos desfasados respecto a la línea del vehículo. Reportar 17 dudas sobre las
mismas páginas implica haber resuelto ese desfase sin evidencia.

**Nota 4.** Este informe declara 29 de 29 páginas leídas. Coincide con el reporte externo, pero "leída" aquí significa transcrita fila por fila con su origen registrado en cada registro, no revisada: 162 filas siguen marcadas para cotejo.
