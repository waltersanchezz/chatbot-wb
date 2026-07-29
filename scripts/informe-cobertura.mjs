/**
 * Genera docs/WILLARD_COBERTURA.md a partir de data/willardApplications.json
 * y data/willardReferences.json.
 *
 * Todos los totales se derivan de los archivos extraidos de las imagenes. El
 * script no estima, no completa y no acepta cifras externas como insumo de
 * calculo: las que aparecen en la seccion de conciliacion son solo un registro
 * de auditoria de un reporte de terceros que NO se uso para validar el catalogo.
 *
 * Uso: node scripts/informe-cobertura.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const apps = JSON.parse(readFileSync(path.join(raiz, 'data', 'willardApplications.json'), 'utf8'));
const refs = JSON.parse(readFileSync(path.join(raiz, 'data', 'willardReferences.json'), 'utf8'));

const LINEAS = [
  ['willardAgmEfb', 'Willard AGM / EFB'],
  ['increibleTitanio', 'Increible Titanio'],
  ['willard', 'Willard'],
  ['extrema', 'Extrema'],
];

/* Cifras de un reporte externo que el negocio marco como NO oficial.
 * Se conservan solo para dejar constancia de por que se descartaron. */
const REPORTE_EXTERNO = {
  marcas: 42,
  modelos: 1385,
  aplicaciones: 2764,
  referenciasUnicas: 96,
  willardAgmEfb: 138,
  increibleTitanio: 482,
  willard: 1420,
  extrema: 724,
  pendientes: 17,
  paginasVerificadas: 29,
};

const lista = apps.aplicaciones;

const porLinea = new Map(
  LINEAS.map(([clave]) => {
    const distintas = new Set();
    let menciones = 0;
    let aplicaciones = 0;
    for (const a of lista) {
      const enLinea = a.referencias?.[clave] ?? [];
      if (enLinea.length) aplicaciones++;
      for (const r of enLinea) {
        distintas.add(r);
        menciones++;
      }
    }
    return [clave, { distintas, menciones, aplicaciones }];
  }),
);

const usadas = new Set();
for (const [clave] of LINEAS) for (const r of porLinea.get(clave).distintas) usadas.add(r);
const conEspecificacion = new Set(refs.referencias.map((r) => r.referencia));
const menciones = LINEAS.reduce((n, [clave]) => n + porLinea.get(clave).menciones, 0);

const modelos = new Set(lista.map((a) => `${a.marca}|${a.modelo}`));
const pendientes = lista.filter((a) => a.revisionPendiente).length;

const porCategoria = [...lista.reduce((acc, a) => {
  acc.set(a.categoria, (acc.get(a.categoria) ?? 0) + 1);
  return acc;
}, new Map())].sort((x, y) => y[1] - x[1]);

const porMarca = [...lista.reduce((acc, a) => {
  acc.set(a.marca, (acc.get(a.marca) ?? 0) + 1);
  return acc;
}, new Map())].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'es'));

/* Reparto de los pendientes por imagen de origen: es la vista que permite
 * planear el cotejo manual pagina por pagina contra el impreso. */
const porImagen = [...lista.reduce((acc, a) => {
  const img = a.fuente?.imagen ?? '(sin origen)';
  const entrada = acc.get(img) ?? { total: 0, pendientes: 0 };
  entrada.total++;
  if (a.revisionPendiente) entrada.pendientes++;
  acc.set(img, entrada);
  return acc;
}, new Map())].sort((x, y) => x[0].localeCompare(y[0], 'es'));

const paginasLimpias = porImagen.filter(([, v]) => v.pendientes === 0);

/* Decision de negocio: el motor de recomendacion debe ignorar los registros con
 * revisionPendiente al responder a un cliente, para no recomendar sobre datos sin
 * cotejar. Este bloque mide que queda disponible bajo esa regla y sirve de cola de
 * trabajo priorizada para el cotejo manual. */
const utilizables = lista.filter((a) => !a.revisionPendiente);
const marcasUtilizables = new Set(utilizables.map((a) => a.marca));
const modelosUtilizables = new Set(utilizables.map((a) => `${a.marca}|${a.modelo}`));

const marcasSinCobertura = porMarca
  .filter(([m]) => !marcasUtilizables.has(m))
  .map(([m, n]) => [m, n])
  .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'es'));

const utilizablesPorCategoria = porCategoria.map(([c, total]) => [
  c,
  total,
  utilizables.filter((a) => a.categoria === c).length,
]);

const cobertura = apps.cobertura ?? {};
const especificaciones = cobertura.paginasEspecificaciones ?? [];
const procesadas = cobertura.paginasAplicacionesProcesadas ?? [];
const sinLeer = cobertura.paginasAplicacionesPendientes ?? [];
const leidas = especificaciones.length + procesadas.length;
const totalPaginas = cobertura.imagenesTotales ?? leidas + sinLeer.length;

const pct = (n, total) => (total ? ((n / total) * 100).toFixed(1) : '0.0');
const miles = (n) => n.toLocaleString('es-CO');

const filaLinea = ([clave, etiqueta]) => {
  const { distintas, menciones: m, aplicaciones } = porLinea.get(clave);
  return `| ${etiqueta} | ${distintas.size} | ${miles(m)} | ${miles(aplicaciones)} | ${pct(aplicaciones, lista.length)} % |`;
};

const filaConciliacion = (etiqueta, propio, externo, nota) =>
  `| ${etiqueta} | ${miles(propio)} | ${miles(externo)} | ${nota} |`;

const doc = `# Willard — Informe de cobertura

> Generado por \`scripts/informe-cobertura.mjs\` a partir de \`data/willardApplications.json\` y
> \`data/willardReferences.json\`. No editar a mano: cualquier cambio se pierde al regenerar.
> Todos los totales se derivan de las imágenes efectivamente procesadas. Ninguna cifra se estima.

## Cobertura de imágenes

Del lote 1 se procesaron **${leidas} de ${totalPaginas}** páginas.

| Uso de la página | Páginas |
|---|---|
| Tablas de especificación | ${especificaciones.length} |
| Tablas de aplicaciones | ${procesadas.length} |
| Sin leer | ${sinLeer.length} |

${
  sinLeer.length
    ? `Página${sinLeer.length === 1 ? '' : 's'} sin leer y motivo:\n\n${sinLeer
        .map((p) => `- \`${p}\` — no transcrita por legibilidad insuficiente. Detalle en \`docs/WILLARD_PENDIENTES.md\`.`)
        .join('\n')}\n\nLas aplicaciones de esa${sinLeer.length === 1 ? '' : 's'} página${sinLeer.length === 1 ? '' : 's'} **no están en la base**. No se estimaron ni se completaron por inferencia.`
    : 'Todas las páginas del lote fueron transcritas.'
}

## Totales

| Métrica | Total |
|---|---|
| Marcas | ${miles(apps.marcas.length)} |
| Modelos distintos (marca + modelo) | ${miles(modelos.size)} |
| Aplicaciones (filas de vehículo del catálogo) | ${miles(lista.length)} |
| Menciones de referencia (celdas con dato) | ${miles(menciones)} |
| Referencias únicas citadas en aplicaciones | ${miles(usadas.size)} |
| Referencias con especificación técnica | ${miles(conEspecificacion.size)} |
| Registros pendientes de revisión | ${miles(pendientes)} (${pct(pendientes, lista.length)} %) |

Una aplicación es una fila de vehículo del catálogo. Una mención es una referencia dentro de una
columna de esa fila, así que un vehículo con referencia en las cuatro líneas suma una aplicación y
cuatro menciones. Confundir ambas métricas infla el total unas ${(menciones / lista.length).toFixed(1)} veces.

## Aplicaciones por sección del catálogo

| Sección | Aplicaciones | % |
|---|---|---|
${porCategoria.map(([c, n]) => `| ${c} | ${miles(n)} | ${pct(n, lista.length)} % |`).join('\n')}

## Referencias por línea de producto

| Línea | Referencias distintas | Menciones | Aplicaciones que la citan | % de aplicaciones |
|---|---|---|---|---|
${LINEAS.map(filaLinea).join('\n')}

## Cobertura utilizable en producción

Por decisión de negocio, el motor de recomendación **debe ignorar los registros con
\`revisionPendiente: true\`** al responder a un cliente, para no recomendar sobre datos que todavía no
se cotejaron contra el impreso. Esta sección mide qué queda disponible bajo esa regla. Los registros
marcados siguen en el archivo: no se borran, se filtran en el momento de consultar.

| Métrica | Utilizable | Total | % |
|---|---|---|---|
| Aplicaciones | ${miles(utilizables.length)} | ${miles(lista.length)} | ${pct(utilizables.length, lista.length)} % |
| Marcas | ${miles(marcasUtilizables.size)} | ${miles(apps.marcas.length)} | ${pct(marcasUtilizables.size, apps.marcas.length)} % |
| Modelos distintos | ${miles(modelosUtilizables.size)} | ${miles(modelos.size)} | ${pct(modelosUtilizables.size, modelos.size)} % |

| Sección | Utilizable | Total | % |
|---|---|---|---|
${utilizablesPorCategoria.map(([c, total, u]) => `| ${c} | ${miles(u)} | ${miles(total)} | ${pct(u, total)} % |`).join('\n')}

### Marcas que hoy quedarían sin ninguna recomendación

${
  marcasSinCobertura.length
    ? `Estas ${marcasSinCobertura.length} marcas tienen **todas** sus filas marcadas, así que bajo la regla anterior el
chatbot no podría recomendar nada para ellas y tendría que derivar a un asesor. La tabla está
ordenada por número de filas, así que sirve como cola de trabajo priorizada para el cotejo manual.

| Marca | Filas marcadas |
|---|---|
${marcasSinCobertura.map(([m, n]) => `| ${m} | ${miles(n)} |`).join('\n')}`
    : 'Todas las marcas tienen al menos una aplicación utilizable.'
}

## Pendientes de revisión por página

Vista para planear el cotejo contra el impreso: cuántas filas de cada página quedaron marcadas.
${paginasLimpias.length} de las ${porImagen.length} páginas de aplicaciones están limpias.

| Página | Aplicaciones | Marcadas | % marcado |
|---|---|---|---|
${porImagen
  .map(([img, v]) => `| \`${img}\` | ${miles(v.total)} | ${miles(v.pendientes)} | ${pct(v.pendientes, v.total)} % |`)
  .join('\n')}

## Aplicaciones por marca

| Marca | Aplicaciones |
|---|---|
${porMarca.map(([m, n]) => `| ${m} | ${miles(n)} |`).join('\n')}

## Conciliación con un reporte externo

El negocio recibió un resumen con otras cifras y determinó que **no es una fuente oficial y no debe
usarse para validar el catálogo**. Se deja constancia de la comparación para explicar por qué se
descartó, no para corregir nada.

| Métrica | Derivado de las imágenes | Reporte externo | Lectura |
|---|---|---|---|
${filaConciliacion('Marcas', apps.marcas.length, REPORTE_EXTERNO.marcas, 'El reporte externo tiene menos marcas pese a declarar más registros')}
${filaConciliacion('Modelos', modelos.size, REPORTE_EXTERNO.modelos, 'No reconciliable sin el detalle fila por fila')}
${filaConciliacion('Aplicaciones', lista.length, REPORTE_EXTERNO.aplicaciones, 'Métricas distintas: ver nota 1')}
${filaConciliacion('Menciones de referencia', menciones, REPORTE_EXTERNO.aplicaciones, 'Métrica comparable con su total de aplicaciones')}
${filaConciliacion('Referencias únicas', usadas.size, REPORTE_EXTERNO.referenciasUnicas, 'Órdenes de magnitud compatibles')}
${filaConciliacion('Willard AGM / EFB', porLinea.get('willardAgmEfb').menciones, REPORTE_EXTERNO.willardAgmEfb, 'Ver nota 2')}
${filaConciliacion('Increible Titanio', porLinea.get('increibleTitanio').menciones, REPORTE_EXTERNO.increibleTitanio, 'Ver nota 2')}
${filaConciliacion('Willard', porLinea.get('willard').menciones, REPORTE_EXTERNO.willard, 'Ver nota 2')}
${filaConciliacion('Extrema', porLinea.get('extrema').menciones, REPORTE_EXTERNO.extrema, 'Ver nota 2')}
${filaConciliacion('Pendientes de revisión', pendientes, REPORTE_EXTERNO.pendientes, 'Ver nota 3')}
${filaConciliacion('Páginas verificadas', leidas, REPORTE_EXTERNO.paginasVerificadas, 'Ver nota 4')}

**Nota 1.** En el reporte externo las cuatro líneas suman exactamente su total de aplicaciones
(${REPORTE_EXTERNO.willardAgmEfb} + ${REPORTE_EXTERNO.increibleTitanio} + ${REPORTE_EXTERNO.willard} + ${REPORTE_EXTERNO.extrema} = ${miles(REPORTE_EXTERNO.aplicaciones)}). Eso indica que su
"aplicaciones" cuenta celdas de referencia, no filas de vehículo. La métrica comparable de esta base
es ${miles(menciones)} menciones.

**Nota 2.** El reparto entre líneas del reporte externo asigna
${pct(REPORTE_EXTERNO.willard, REPORTE_EXTERNO.aplicaciones)} % de todas sus menciones a la columna Willard y solo
${pct(REPORTE_EXTERNO.willardAgmEfb, REPORTE_EXTERNO.aplicaciones)} % a AGM/EFB. En esta base, con menos volumen, AGM/EFB acumula
${miles(porLinea.get('willardAgmEfb').menciones)} menciones frente a sus ${miles(REPORTE_EXTERNO.willardAgmEfb)}. Un total mayor con menos AGM/EFB en
términos absolutos es compatible con que valores de la columna AGM/EFB hayan quedado cargados en la
columna Willard, que es el desplazamiento documentado en \`docs/WILLARD_PENDIENTES.md\`.

**Nota 3.** ${miles(pendientes)} de ${miles(lista.length)} registros quedaron marcados porque en la mayoría de las páginas los
valores están impresos desfasados respecto a la línea del vehículo. Reportar ${REPORTE_EXTERNO.pendientes} dudas sobre las
mismas páginas implica haber resuelto ese desfase sin evidencia.

**Nota 4.** Este informe declara ${leidas} de ${totalPaginas} páginas leídas. ${
  sinLeer.length === 0
    ? `Coincide con el reporte externo, pero "leída" aquí significa transcrita fila por fila con su origen registrado en cada registro, no revisada: ${miles(pendientes)} filas siguen marcadas para cotejo.`
    : sinLeer.length === 1
      ? 'La restante no es transcribible con la foto disponible y está a la espera de una toma nueva.'
      : `Las ${sinLeer.length} restantes no son transcribibles con las fotos disponibles y están a la espera de nuevas tomas.`
}
`;

const salida = path.join(raiz, 'docs', 'WILLARD_COBERTURA.md');
writeFileSync(salida, doc, 'utf8');

console.log('Informe escrito en', path.relative(raiz, salida));
console.log('Paginas leidas:', leidas, 'de', totalPaginas, '| sin leer:', sinLeer.join(', ') || 'ninguna');
console.log('Marcas:', apps.marcas.length, '| modelos:', modelos.size, '| aplicaciones:', lista.length);
console.log('Menciones de referencia:', menciones, '| referencias unicas:', usadas.size);
console.log('Pendientes de revision:', pendientes);
