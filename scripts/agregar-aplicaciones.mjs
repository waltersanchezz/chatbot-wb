/**
 * Incorpora una transcripcion de paginas nuevas a data/willardApplications.json.
 *
 * No reprocesa lo ya extraido: fusiona, reordena A-Z, elimina duplicados exactos
 * y actualiza los totales y la cobertura. No corrige datos.
 *
 * Uso: node scripts/agregar-aplicaciones.mjs data/catalogo-willard/transcripciones/lote1-p09-p10.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const destino = path.join(raiz, 'data', 'willardApplications.json');
const entrada = process.argv[2];

if (!entrada) {
  console.error('Falta el archivo de transcripcion. Uso: node scripts/agregar-aplicaciones.mjs <archivo.json>');
  process.exit(1);
}

const rutaEntrada = path.isAbsolute(entrada) ? entrada : path.join(raiz, entrada);

for (const ruta of [destino, rutaEntrada]) {
  if (!existsSync(ruta)) {
    console.error(`No existe el archivo requerido: ${path.relative(raiz, ruta)}`);
    process.exit(1);
  }
}

const base = JSON.parse(readFileSync(destino, 'utf8'));
const nuevos = JSON.parse(readFileSync(rutaEntrada, 'utf8'));

if (!Array.isArray(nuevos)) {
  console.error('La transcripcion debe ser un arreglo de aplicaciones.');
  process.exit(1);
}

const huella = (a) =>
  JSON.stringify([a.marca, a.modelo, a.version, a.textoCatalogo, a.fuente?.imagen, a.fuente?.fila]);

const existentes = new Map(base.aplicaciones.map((a) => [huella(a), a]));
let agregados = 0;
let omitidos = 0;

for (const a of nuevos) {
  const h = huella(a);
  if (existentes.has(h)) {
    omitidos++;
    continue;
  }
  existentes.set(h, a);
  agregados++;
}

const collator = new Intl.Collator('es', { sensitivity: 'base' });
// El catalogo repite modelos entre sus secciones (Autos y camionetas, Taxis,
// Buses y camiones). La categoria desempata para que el orden sea estable.
const clave = (a) => [a.marca, a.modelo ?? '', a.version ?? '', a.categoria ?? ''];

const aplicaciones = [...existentes.values()].sort((x, y) => {
  const a = clave(x);
  const b = clave(y);
  for (let i = 0; i < a.length; i++) {
    const cmp = collator.compare(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
});

const imagenesNuevas = [...new Set(nuevos.map((a) => a.fuente?.imagen).filter(Boolean))].sort();
const procesadas = new Set([
  ...(base.cobertura?.paginasAplicacionesProcesadas ?? []),
  ...imagenesNuevas,
]);
const pendientes = (base.cobertura?.paginasAplicacionesPendientes ?? []).filter(
  (p) => !procesadas.has(p),
);

base.aplicaciones = aplicaciones;
base.marcas = [...new Set(aplicaciones.map((a) => a.marca))].sort(collator.compare);
base.totales = {
  registros: aplicaciones.length,
  marcas: base.marcas.length,
  pendientesRevision: aplicaciones.filter((a) => a.revisionPendiente).length,
};
base.cobertura.paginasAplicacionesProcesadas = [...procesadas].sort();
base.cobertura.paginasAplicacionesPendientes = pendientes;

writeFileSync(destino, JSON.stringify(base, null, 2) + '\n', 'utf8');

console.log('Transcripcion incorporada:', path.relative(raiz, rutaEntrada));
console.log('Registros agregados:', agregados);
console.log('Duplicados exactos omitidos:', omitidos);
console.log('Total de aplicaciones:', aplicaciones.length);
console.log('Marcas:', base.marcas.length, '->', base.marcas.join(', '));
console.log('Pendientes de revision:', base.totales.pendientesRevision);
console.log('Paginas de aplicaciones aun sin transcribir:', pendientes.length);
