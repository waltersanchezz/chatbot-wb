/**
 * Cotejo 2026-07-29: retomas nítidas Chevrolet p.7, Ford p.9 (F-150…F-351)
 * y tabla EXTREMA TAXI. Solo toca revisionPendiente / correcciones con evidencia.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const raiz = process.cwd();
const appsPath = path.join(raiz, 'data', 'willardApplications.json');
const refsPath = path.join(raiz, 'data', 'willardReferences.json');

const apps = JSON.parse(readFileSync(appsPath, 'utf8'));
const refs = JSON.parse(readFileSync(refsPath, 'utf8'));

function R(agm = [], tit = [], wil = [], ext = []) {
  return {
    willardAgmEfb: agm,
    increibleTitanio: tit,
    willard: wil,
    extrema: ext,
  };
}

/** Evidencia: lote1-img-07 retoma (41 filas Chevrolet). */
const chevy07ByTexto = new Map([
  ['Jimny', { refs: R([], [], [], ['NS40IST-670 PD']), modelo: 'Jimny', version: null }],
  ['Lumina', { refs: R([], ['24BI-900'], [], ['24BI-750']), modelo: 'Lumina', version: null }],
  ['Luv', { refs: R([], ['48D-1000', '48-1100'], ['48D-900'], ['48D-850']), modelo: 'Luv', version: null }],
  ['Luv 2500', { refs: R(['27-80 EFB'], ['27AI-1250'], ['27AI-1150'], ['27AI-1000']), modelo: 'Luv 2500', version: null }],
  [
    'Luv D-Max Diesel',
    {
      refs: R(['27R-80 EFB'], ['27AD-1250'], ['27AD-1150'], ['27AD-1000']),
      modelo: 'Luv D-Max',
      version: 'Diésel',
      textoCatalogo: 'Luv D-Max Diésel',
    },
  ],
  [
    'Luv D-Max 2.5 Diesel',
    {
      refs: R(['48D-70 EFB', 'W-L3-70AH'], ['48D-1000', '48-1100'], [], []),
      modelo: 'Luv D-Max',
      version: '2.5 Diesel',
    },
  ],
  [
    'Luv D-Max 3.0 Diesel',
    {
      refs: R(['27R-80 EFB'], ['27AD-1250'], ['27AD-1150'], ['34D-950']),
      modelo: 'Luv D-Max',
      version: '3.0 Diesel',
    },
  ],
  [
    'Luv D-Max Gasolina',
    {
      refs: R([], ['48I-1000', '48-1100'], ['34I-1100'], ['34I-950']),
      modelo: 'Luv D-Max',
      version: 'Gasolina',
    },
  ],
  ['N200 Cargo 1.2', { refs: R([], ['42D-900'], ['24BD-850'], ['42D-750']), modelo: 'N200 Cargo', version: '1.2' }],
  ['N200 Plus 1.2', { refs: R([], ['42D-900'], ['24BD-850'], ['42D-750']), modelo: 'N200 Plus', version: '1.2' }],
  ['N200 Van 1.2', { refs: R([], ['42D-900'], [], ['42D-750']), modelo: 'N200 Van', version: '1.2' }],
  [
    'N300 Max cargo 1.2',
    { refs: R([], ['24BD-900'], ['24BD-850'], ['42D-750']), modelo: 'N300 Max cargo', version: '1.2' },
  ],
  ['N300 van', { refs: R([], ['42D-900'], [], ['42D-750']), modelo: 'N300 van', version: null }],
  ['Onix', { refs: R([], [], ['L1-750', '36D-750'], []), modelo: 'Onix', version: null }],
  [
    'Onix Turbo',
    { refs: R(['48D-70 EFB', 'W-L3-70AH'], [], [], []), modelo: 'Onix Turbo', version: null },
  ],
  ['Optra 4P 1.8', { refs: R([], ['34I-1200'], ['34I-1100'], ['34I-950']), modelo: 'Optra', version: '4P 1.8' }],
  ['Orlando', { refs: R([], ['48D-1000', '48-1100'], [], []), modelo: 'Orlando', version: null }],
  [
    'Rodeo 2.6 / 3.0',
    { refs: R([], ['48D-1000', '48-1100'], ['48D-900'], ['48D-850']), modelo: 'Rodeo', version: '2.6 / 3.0' },
  ],
  ['Sail', { refs: R([], ['NS60I-750 PD'], ['NS60I-620'], []), modelo: 'Sail', version: null }],
  ['Samurai', { refs: R([], [], [], ['NS40D PD 670']), modelo: 'Samurai', version: null }],
  [
    'Silverado',
    { refs: R([], ['48D-1000', '48-1100'], ['48D-900'], ['48D-850']), modelo: 'Silverado', version: null },
  ],
  ['Sonic', { refs: R([], ['24BD-900'], ['24BD-850'], []), modelo: 'Sonic', version: null }],
  [
    'Spark  GTI 1.2LT',
    {
      refs: R([], [], ['L1-750', '36D-750'], []),
      modelo: 'Spark',
      version: 'GTI 1.2LT',
      textoCatalogo: 'Spark GTI 1.2LT',
    },
  ],
  [
    'Spark 1.0 ; Spark Go; Spark',
    {
      refs: R([], [], [], ['NS40D-670']),
      modelo: 'Spark',
      version: '1.0 ; Spark Go; Spark',
    },
  ],
  [
    'Sprint, Swift (Inyeccion)',
    {
      refs: R([], ['24BI-900'], [], ['24BI-750']),
      modelo: 'Sprint, Swift',
      version: 'Inyeccion',
    },
  ],
  ['Suburvan', { refs: R([], ['48I-1000', '48-1100'], ['48I-900'], []), modelo: 'Suburvan', version: null }],
  ['Super Carry', { refs: R([], [], [], ['NS40D PD 670']), modelo: 'Super Carry', version: null }],
  ['Tahoe', { refs: R([], ['34I-1200'], ['34I-1100'], ['34I-950']), modelo: 'Tahoe', version: null }],
  ['Tahoe 2020', { refs: R(['W-L4-80AH'], [], [], []), modelo: 'Tahoe', version: '2020' }],
  ['Tracker', { refs: R([], ['24BD-900'], [], []), modelo: 'Tracker', version: null }],
  [
    'Tracker Turbo',
    { refs: R(['48D-70 EFB', 'W-L3-70AH'], [], [], []), modelo: 'Tracker Turbo', version: null },
  ],
  [
    'Trailblazer',
    { refs: R([], ['48I-1000', '48-1100'], ['48I-900'], ['48I-850']), modelo: 'Trailblazer', version: null },
  ],
  [
    'Trailbrazer 2.8 Diesel Itz 2.012>-',
    {
      refs: R([], ['48D-1000', '48-1100'], ['49-1200'], []),
      modelo: 'Trailblazer',
      version: '2.8 Diesel ltz 2.013>',
      textoCatalogo: 'Trailblazer 2.8 Diesel ltz 2.013>',
    },
  ],
  ['Traverse 2.018', { refs: R(['W-L4-80AH'], [], [], []), modelo: 'Traverse', version: '2.018' }],
  [
    'Traverse 3.6 AWD Aut',
    {
      refs: R(['48D-70 EFB', 'W-L3-70AH'], ['48D-1000', '48-1100'], ['48D-900'], ['48D-850']),
      modelo: 'Traverse',
      version: '3.6 AWD Aut',
    },
  ],
  [
    'Trooper 2.6',
    { refs: R([], ['48D-1000', '48-1100'], ['48D-900'], ['48D-850']), modelo: 'Trooper', version: '2.6' },
  ],
  ['Trooper 960', { refs: R([], ['24BI-900'], [], ['24BI-750']), modelo: 'Trooper', version: '960' }],
  ['Vitara', { refs: R([], ['24BD-900'], [], ['NS40D PD 670']), modelo: 'Vitara', version: null }],
  [
    'Vivant AUT. 2000 C.C.',
    {
      refs: R([], ['24BD-900'], ['24BD-850'], ['24BD-750']),
      modelo: 'Vivant',
      version: 'AUT. 2000 C.C.',
    },
  ],
  ['Wagon R 1000', { refs: R([], [], [], ['NS40D PD 670']), modelo: 'Wagon R', version: '1000' }],
  [
    'Zafira',
    { refs: R([], ['24BD-900'], ['24BD-850'], ['24BD-750']), modelo: 'Zafira', version: null },
  ],
]);

/** Evidencia: retoma Ford p.9 — solo filas aún pendientes. */
const ford09PendingByTexto = new Map([
  [
    'F-150',
    {
      refs: R(['27-80 EFB'], ['27AI-1250'], ['27AI-1150'], ['27AI-1000']),
      modelo: 'F-150',
      version: null,
    },
  ],
  [
    'F-150 Ecoboost',
    {
      refs: R(['27-80 EFB'], ['27AI-1250'], ['65-1150'], ['65-1150']),
      modelo: 'F-150 Ecoboost',
      version: null,
    },
  ],
  [
    'Ford F-150 / Explorer (>88)',
    {
      refs: R([], ['48I-1000', '48-1100'], ['48I-900'], ['48I-850']),
      modelo: 'Ford F-150 / Explorer',
      version: '(>88)',
    },
  ],
  [
    'Ford F-150/ F-350 (<88) F-351',
    {
      refs: R(['27-80 EFB'], ['27AI-1250'], ['65-1150', '27AI-1150'], []),
      modelo: 'Ford F-150/ F-350',
      version: '(<88) F-351',
      textoCatalogo: 'Ford F-150 / F-350 (<88) F-351',
    },
  ],
]);

const summary = {
  chevyClosed: [],
  chevySkipped: [],
  fordClosed: [],
  fordSkipped: [],
  refsClosed: [],
};

for (const app of apps.aplicaciones) {
  if (app.fuente?.imagen !== 'lote1-img-07.jpeg' || app.marca !== 'CHEVROLET') continue;
  if (app.revisionPendiente !== true) {
    summary.chevySkipped.push(`${app.textoCatalogo} (ya confirmada)`);
    continue;
  }
  const patch = chevy07ByTexto.get(app.textoCatalogo);
  if (!patch) {
    summary.chevySkipped.push(`${app.textoCatalogo} (sin mapeo)`);
    continue;
  }
  app.referencias = patch.refs;
  if (patch.modelo != null) app.modelo = patch.modelo;
  if (patch.version !== undefined) app.version = patch.version;
  if (patch.textoCatalogo) app.textoCatalogo = patch.textoCatalogo;
  app.revisionPendiente = false;
  summary.chevyClosed.push(app.textoCatalogo);
}

for (const app of apps.aplicaciones) {
  if (app.fuente?.imagen !== 'lote1-img-09.jpeg' || app.marca !== 'FORD') continue;
  if (app.revisionPendiente !== true) continue;
  const patch = ford09PendingByTexto.get(app.textoCatalogo);
  if (!patch) {
    summary.fordSkipped.push(`${app.textoCatalogo} (sin evidencia en retoma)`);
    continue;
  }
  app.referencias = patch.refs;
  if (patch.modelo != null) app.modelo = patch.modelo;
  if (patch.version !== undefined) app.version = patch.version;
  if (patch.textoCatalogo) app.textoCatalogo = patch.textoCatalogo;
  app.revisionPendiente = false;
  summary.fordClosed.push(app.textoCatalogo);
}

/** EXTREMA TAXI: solo refs con revisionPendiente true; valores ya coinciden con retoma. */
const taxiPendingOk = new Set([
  'NS40DST-670 PD',
  'NS40IST-670 PD',
  'NS40DST-670 PG',
  '48IST-850',
]);

for (const ref of refs.referencias) {
  if (ref.revisionPendiente !== true) continue;
  if (!taxiPendingOk.has(ref.referencia)) continue;
  ref.revisionPendiente = false;
  // Actualizar CCA confirmados por la retoma donde el pendiente tenía duda de lectura.
  if (ref.referencia === '48IST-850') {
    ref.cca18C = 550;
    ref.ca22C = 810;
    ref.crMin = 100;
    ref.polaridad = '(+ -)';
    ref.dimensionesMm = { largo: 268, ancho: 173, alto: 188 };
    ref.terminal = 'ESTANDAR';
  }
  if (ref.referencia.startsWith('NS40')) {
    ref.cca18C = 375;
    ref.ca22C = 570;
    ref.crMin = 72;
    ref.dimensionesMm = { largo: 196, ancho: 128, alto: 224 };
  }
  if (ref.referencia === 'NS40DST-670 PD') {
    ref.polaridad = '(- +)';
    ref.terminal = 'DELGADO';
  }
  if (ref.referencia === 'NS40IST-670 PD') {
    ref.polaridad = '(+ -)';
    ref.terminal = 'DELGADO';
  }
  if (ref.referencia === 'NS40DST-670 PG') {
    ref.polaridad = '(- +)';
    ref.terminal = 'ESTANDAR';
  }
  summary.refsClosed.push(ref.referencia);
}

writeFileSync(appsPath, `${JSON.stringify(apps, null, 2)}\n`, 'utf8');
writeFileSync(refsPath, `${JSON.stringify(refs, null, 2)}\n`, 'utf8');

const pendChevy = apps.aplicaciones.filter(
  (a) => a.marca === 'CHEVROLET' && a.revisionPendiente === true,
).length;
const pendFord = apps.aplicaciones.filter(
  (a) => a.marca === 'FORD' && a.revisionPendiente === true,
).length;
const pendImg10 = apps.aplicaciones.filter(
  (a) => a.fuente?.imagen === 'lote1-img-10.jpeg' && a.revisionPendiente === true && a.marca === 'FORD',
).length;

console.log(JSON.stringify({ summary, pendChevy, pendFord, pendImg10 }, null, 2));
