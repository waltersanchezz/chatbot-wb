/**
 * Tras un cotejo: reordena A-Z, sincroniza totales.pendientesRevision y
 * el conteo embebido en reglaDeConsumo. No cambia referencias ni marcas.
 *
 * Uso: node scripts/sync-totales-willard.mjs
 */
import fs from 'node:fs';

const path = 'data/willardApplications.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const collator = new Intl.Collator('es', { sensitivity: 'base' });
const clave = (a) => [a.marca, a.modelo ?? '', a.version ?? '', a.categoria ?? ''];
data.aplicaciones.sort((x, y) => {
  const a = clave(x);
  const b = clave(y);
  for (let i = 0; i < a.length; i++) {
    const cmp = collator.compare(a[i], b[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
});

const pend = data.aplicaciones.filter((a) => a.revisionPendiente).length;
const util = data.aplicaciones.length - pend;
const marcas = [...new Set(data.aplicaciones.map((a) => a.marca))].sort(collator.compare);
const sinCob = marcas.filter(
  (m) => !data.aplicaciones.some((a) => a.marca === m && !a.revisionPendiente),
);

data.marcas = marcas;
data.totales.registros = data.aplicaciones.length;
data.totales.marcas = marcas.length;
data.totales.pendientesRevision = pend;
data.reglaDeConsumo = data.reglaDeConsumo.replace(
  /Hoy esta regla deja \d+ de \d+ aplicaciones utilizables y \d+ marcas sin ninguna recomendacion posible/,
  `Hoy esta regla deja ${util} de ${data.aplicaciones.length} aplicaciones utilizables y ${sinCob.length} marcas sin ninguna recomendacion posible`,
);

fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log({ pend, util, sinCob: sinCob.length, sinCobMarcas: sinCob });
