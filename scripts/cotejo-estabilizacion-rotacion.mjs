/**
 * Estabilización marcas alta rotación — solo evidencia de ampliación.
 * No reasigna por inferencia; corrige literales del impreso cuando hay conflicto claro.
 */
import fs from 'node:fs';

const path = 'data/willardApplications.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const log = [];

function find(marca, imagen, fila) {
  return data.aplicaciones.find(
    (a) =>
      a.marca === marca &&
      a.fuente.imagen === imagen &&
      a.fuente.fila === fila,
  );
}

function clear(app, note) {
  if (!app) return;
  if (app.revisionPendiente) {
    app.revisionPendiente = false;
    log.push(`CLEAR ${app.marca} | ${app.textoCatalogo} | ${note}`);
  }
}

function setRefs(app, refs, note) {
  if (!app) return;
  app.referencias = {
    willardAgmEfb: refs.willardAgmEfb ?? [],
    increibleTitanio: refs.increibleTitanio ?? [],
    willard: refs.willard ?? [],
    extrema: refs.extrema ?? [],
  };
  app.revisionPendiente = false;
  log.push(`FIX+CLEAR ${app.marca} | ${app.textoCatalogo} | ${note}`);
}

// --- BMW lote1-img-05 filas 6–28: W-L5-95AH / 49-1200 (X6 = W-L6-105AH) ---
for (const app of data.aplicaciones) {
  if (
    app.marca === 'BMW' &&
    app.fuente.imagen === 'lote1-img-05.jpeg' &&
    app.revisionPendiente
  ) {
    clear(app, 'bloque homogéneo 49-1200 confirmado a 3×–6×');
  }
}

// --- CHEVROLET lote1-img-06 ---
setRefs(
  find('CHEVROLET', 'lote1-img-06.jpeg', 12),
  { extrema: ['NS40DST-670PG'] },
  'Extrema PS→PG literal del impreso (8×)',
);
clear(find('CHEVROLET', 'lote1-img-06.jpeg', 13), 'Alto Extrema NS40D PD 670');
clear(
  find('CHEVROLET', 'lote1-img-06.jpeg', 14),
  'Astra Extrema 42D-900 literal',
);
clear(
  find('CHEVROLET', 'lote1-img-06.jpeg', 20),
  'Blazer K5 refs literales (Titanio 24BI / Willard-Extrema 34I)',
);
clear(
  find('CHEVROLET', 'lote1-img-06.jpeg', 27),
  'Captiva Sport FE Titanio 34D + Willard/Extrema 48D literales',
);
clear(
  find('CHEVROLET', 'lote1-img-06.jpeg', 33),
  'Epica 48I bloque literal',
);
clear(
  find('CHEVROLET', 'lote1-img-06.jpeg', 36),
  'Gran Vitara 24R-75 EFB + 24AD + Extrema 34D-950 literales',
);

// --- KIA lote1-img-13 ---
setRefs(
  find('KIA', 'lote1-img-13.jpeg', 1),
  {
    increibleTitanio: ['48I-1000', '48-1100'],
    willard: ['48I-900'],
    extrema: ['48I-850'],
  },
  'Besta polaridad I confirmada (antes 48-1000 / Extrema 48-850)',
);
setRefs(
  find('KIA', 'lote1-img-13.jpeg', 2),
  {
    increibleTitanio: ['48I-1000', '48-1100'],
    willard: ['48I-900'],
    extrema: ['48I-850'],
  },
  'Cadenza Titanio 48I confirmada',
);
for (const fila of [9, 10, 12, 13, 14, 15, 19, 20, 21, 24, 25, 35]) {
  const app = find('KIA', 'lote1-img-13.jpeg', fila);
  clear(app, 'refs literales confirmadas a 2×–3×');
}
setRefs(
  find('KIA', 'lote1-img-13.jpeg', 32),
  {
    increibleTitanio: ['24BD-900'],
    willard: ['24BD-850'],
  },
  'Sportage Gasolina 2017+ no vacía: Tit 24BD-900 / Wil 24BD-850',
);
// Sorento XM fila 28: conflicto print vs JSON → no tocar

// --- MAZDA lote1-img-14 (excepto CX9 2.017 por conflicto entre recortes) ---
for (const fila of [
  1, 2, 3, 4, 5, 6, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22,
]) {
  clear(
    find('MAZDA', 'lote1-img-14.jpeg', fila),
    'refs literales confirmadas a 2×',
  );
}

// --- FORD lote1-img-09: solo filas sin conflicto ---
clear(
  find('FORD', 'lote1-img-09.jpeg', 25),
  'Edge Limited 2.011 Willard 65-1150 literal',
);
clear(
  find('FORD', 'lote1-img-09.jpeg', 26),
  'Edge Titanium bloque literal',
);
clear(
  find('FORD', 'lote1-img-09.jpeg', 30),
  'Expedition 5.4L 65-1150/27AI-1150 literal',
);
// F-150 / Ecoboost / Explorer / F-350: conflicto entre JSON y zoom → pendientes

// --- HYUNDAI buses lote1-img-25: solo 4DT claros ---
for (const fila of [17, 18, 22]) {
  clear(
    find('HYUNDAI', 'lote1-img-25.jpeg', fila),
    'Willard 4DT-1500 / Extrema 4DT-1400 literal',
  );
}
// Aero City / Bus County / H350: asignación dudosa → pendientes

fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ cambios: log.length, log }, null, 2));
