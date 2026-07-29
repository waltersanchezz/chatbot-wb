/**
 * Valida la base de conocimiento Willard contra el contrato acordado.
 *
 * Fuente de verdad: el catalogo oficial. Este script no corrige nada,
 * solo reporta. Uso: node scripts/validar-willard.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const RUTAS = {
  aplicaciones: path.join(raiz, 'data', 'willardApplications.json'),
  referencias: path.join(raiz, 'data', 'willardReferences.json'),
  imagenes: path.join(raiz, 'data', 'catalogo-willard'),
};

const CAMPOS_APLICACION = [
  'marca',
  'categoria',
  'modelo',
  'version',
  'textoCatalogo',
  'referencias',
  'fuente',
  'revisionPendiente',
];

const LINEAS = ['willardAgmEfb', 'increibleTitanio', 'willard', 'extrema'];

const problemas = [];
const avisos = [];

function falta(ruta) {
  problemas.push(`No existe el archivo requerido: ${path.relative(raiz, ruta)}`);
}

for (const [nombre, ruta] of Object.entries(RUTAS)) {
  if (!existsSync(ruta)) falta(ruta);
  else if (nombre !== 'imagenes') JSON.parse(readFileSync(ruta, 'utf8'));
}

if (problemas.length) {
  console.error(problemas.join('\n'));
  process.exit(1);
}

const apps = JSON.parse(readFileSync(RUTAS.aplicaciones, 'utf8'));
const refs = JSON.parse(readFileSync(RUTAS.referencias, 'utf8'));

/* --- contrato de campos --- */
for (const [i, a] of apps.aplicaciones.entries()) {
  const claves = Object.keys(a);
  const sobran = claves.filter((c) => !CAMPOS_APLICACION.includes(c));
  const faltan = CAMPOS_APLICACION.filter((c) => !claves.includes(c));
  if (sobran.length) problemas.push(`aplicacion[${i}] tiene campos no acordados: ${sobran}`);
  if (faltan.length) problemas.push(`aplicacion[${i}] le faltan campos: ${faltan}`);
  if (!a.textoCatalogo) problemas.push(`aplicacion[${i}] perdio el texto literal del catalogo`);
  const lineasMal = Object.keys(a.referencias ?? {}).filter((l) => !LINEAS.includes(l));
  if (lineasMal.length) problemas.push(`aplicacion[${i}] usa lineas desconocidas: ${lineasMal}`);
}

/* --- orden alfabetico A-Z por marca y luego modelo --- */
const collator = new Intl.Collator('es', { sensitivity: 'base' });
const clave = (a) => [a.marca, a.modelo ?? '', a.version ?? '', a.categoria ?? ''];
for (let i = 1; i < apps.aplicaciones.length; i++) {
  const previa = clave(apps.aplicaciones[i - 1]);
  const actual = clave(apps.aplicaciones[i]);
  let cmp = 0;
  for (let j = 0; j < previa.length && cmp === 0; j++) cmp = collator.compare(previa[j], actual[j]);
  if (cmp > 0) problemas.push(`orden roto: ${previa.join(' / ')} antes de ${actual.join(' / ')}`);
}

/* --- duplicados dentro de la misma seccion del catalogo ---
 * El catalogo impreso repite filas (mismo modelo en dos bloques de la misma
 * marca). Por decision de negocio esas filas se conservan, asi que el duplicado
 * se reporta como aviso para revision manual, no como fallo. */
const huellas = new Map();
for (const a of apps.aplicaciones) {
  const h = `${a.marca}|${a.categoria}|${a.modelo}|${a.version}`;
  if (huellas.has(h)) avisos.push(`fila repetida en el catalogo: ${h}`);
  huellas.set(h, true);
}

/* --- cruce de referencias --- */
const maestra = new Set(refs.referencias.map((r) => r.referencia));
const usadas = new Set();
for (const a of apps.aplicaciones) {
  for (const linea of LINEAS) {
    for (const ref of a.referencias[linea] ?? []) usadas.add(ref);
  }
}
const porLinea = Object.fromEntries(
  LINEAS.map((linea) => {
    const distintas = new Set();
    let menciones = 0;
    let aplicaciones = 0;
    for (const a of apps.aplicaciones) {
      const refsLinea = a.referencias[linea] ?? [];
      if (refsLinea.length) aplicaciones++;
      for (const ref of refsLinea) {
        distintas.add(ref);
        menciones++;
      }
    }
    return [linea, { distintas: distintas.size, menciones, aplicaciones }];
  }),
);

const huerfanas = [...usadas].filter((r) => !maestra.has(r)).sort();
for (const r of huerfanas) {
  avisos.push(`referencia usada en aplicaciones sin especificacion en willardReferences: ${r}`);
}
const sinUso = [...maestra].filter((r) => !usadas.has(r)).length;

/* --- trazabilidad: cada fuente.imagen debe existir en el repo --- */
const ES_IMAGEN = /\.(jpe?g|png|webp)$/i;
const disponibles = new Set();
if (existsSync(RUTAS.imagenes)) {
  for (const lote of readdirSync(RUTAS.imagenes, { withFileTypes: true })) {
    if (!lote.isDirectory()) continue;
    const dir = path.join(RUTAS.imagenes, lote.name);
    for (const f of readdirSync(dir)) {
      if (ES_IMAGEN.test(f)) disponibles.add(f);
    }
  }
}
const imagenesCitadas = new Set(
  [...apps.aplicaciones, ...refs.referencias].map((x) => x.fuente?.imagen).filter(Boolean),
);
for (const img of [...imagenesCitadas].sort()) {
  if (!disponibles.has(img)) problemas.push(`fuente.imagen no existe en el repo: ${img}`);
}

/* --- coherencia de los totales declarados --- */
const pendientes = apps.aplicaciones.filter((a) => a.revisionPendiente).length;
if (apps.totales?.registros !== apps.aplicaciones.length) {
  problemas.push(
    `totales.registros dice ${apps.totales?.registros} pero hay ${apps.aplicaciones.length}`,
  );
}
if (apps.totales?.pendientesRevision !== pendientes) {
  problemas.push(
    `totales.pendientesRevision dice ${apps.totales?.pendientesRevision} pero hay ${pendientes}`,
  );
}

/* --- reporte --- */
const ETIQUETA_LINEA = {
  willardAgmEfb: 'Willard AGM / EFB',
  increibleTitanio: 'Increible Titanio',
  willard: 'Willard',
  extrema: 'Extrema',
};
const modelos = new Set(apps.aplicaciones.map((a) => `${a.marca}|${a.modelo}`));
const porCategoria = apps.aplicaciones.reduce((acc, a) => {
  acc[a.categoria] = (acc[a.categoria] ?? 0) + 1;
  return acc;
}, {});

console.log('Aplicaciones:', apps.aplicaciones.length);
console.log('Marcas:', apps.marcas.length, '->', apps.marcas.join(', '));
console.log('Modelos distintos (marca + modelo):', modelos.size);
console.log('Aplicaciones por seccion del catalogo:');
for (const [cat, n] of Object.entries(porCategoria).sort()) console.log('  -', cat + ':', n);
console.log('Referencias por linea de producto:');
for (const linea of LINEAS) {
  const { distintas, menciones, aplicaciones } = porLinea[linea];
  console.log(
    `  - ${ETIQUETA_LINEA[linea]}: ${distintas} referencias distintas, ${menciones} menciones, ${aplicaciones} aplicaciones`,
  );
}
console.log('Pendientes de revision:', pendientes);
// El motor de recomendacion ignora las filas marcadas, asi que este es el volumen
// que realmente puede responder a un cliente hoy. Ver la regla de consumo en
// docs/WILLARD_PENDIENTES.md.
const utilizables = apps.aplicaciones.length - pendientes;
const marcasUtilizables = new Set(
  apps.aplicaciones.filter((a) => !a.revisionPendiente).map((a) => a.marca),
);
console.log(
  'Utilizables en produccion:',
  utilizables,
  `(${((utilizables / apps.aplicaciones.length) * 100).toFixed(1)} %) en`,
  marcasUtilizables.size,
  'de',
  apps.marcas.length,
  'marcas',
);
console.log('Referencias con especificacion:', refs.referencias.length);
console.log('Referencias distintas usadas en aplicaciones:', usadas.size);
console.log('Referencias sin uso todavia:', sinUso);
console.log('Imagenes de catalogo en el repo:', disponibles.size);
console.log(
  'Paginas de aplicaciones pendientes de transcribir:',
  apps.cobertura?.paginasAplicacionesPendientes?.length ?? 0,
);

if (avisos.length) {
  console.log('\nAvisos (revisar en docs/WILLARD_PENDIENTES.md):');
  for (const a of avisos) console.log(' -', a);
}

if (problemas.length) {
  console.error('\nProblemas:');
  for (const p of problemas) console.error(' -', p);
  process.exit(1);
}

console.log('\nValidacion OK: contrato de campos, orden A-Z, duplicados y trazabilidad.');
