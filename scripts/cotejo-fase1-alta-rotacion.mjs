/**
 * Cotejo Fase 1 alta rotación (2026-07-29):
 * - Chevrolet taxis p.21 (corrección de desplazamiento)
 * - Chevrolet buses p.23 (CHR/LV = 4DT; resto 27AI(2))
 * - Hyundai / Kia taxis p.22 (confirma literales actuales)
 * Ford p.10 NO se toca: lecturas de ampliación contradictorias vs filas ya confirmadas.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const appsPath = path.join(process.cwd(), 'data', 'willardApplications.json');
const apps = JSON.parse(readFileSync(appsPath, 'utf8'));

function R(agm = [], tit = [], wil = [], ext = []) {
  return {
    willardAgmEfb: agm,
    increibleTitanio: tit,
    willard: wil,
    extrema: ext,
  };
}

const closed = { chevyTaxi: [], chevyBus: [], hyundai: [], kia: [], skipped: [] };

const taxi21 = new Map([
  ['Taxi 7.24', R([], [], [], ['NS40D PD 670'])],
  ['Optra 1.6 Serv. Esp.', R([], [], ['34D-1100'], ['34D-950'])],
  ['Chevrotaxi Swift', R([], ['24BI-900'], [], ['24BI-750'])],
  ['Elite', R([], [], ['L1-750', '36D-750'], [])],
  ['Chevytaxi Sail', R([], ['NS60I-750 PD'], ['NS60I-620'], [])],
]);

const bus27 = R(
  ['27-80 EFB(2)'],
  ['27AI-1250 (2)'],
  ['27AI-1150 (2)'],
  ['27AI-1000 (2)'],
);

const bus23 = new Map([
  ['CHR 7.2 Turbo', R([], [], ['4DT-1500'], ['4DT-1400'])],
  ['FRR', bus27],
  ['FRR Forward 5.2 Bus', bus27],
  ['FTR Camión', bus27],
  ['FVR Camión', bus27],
  ['FVR Forward 7.8', bus27],
  ['LV Bus 150', R([], [], ['4DT-1500 (2)'], ['4DT-1400 (2)'])],
  ['NHR', bus27],
  ['NKR Reward bus', bus27],
  ['NKR Reward Camión', bus27],
  ['NPR 729 Camión', bus27],
  ['NPR Reward 5.2', bus27],
  ['NQR 729 Camión', bus27],
  ['NQR Reward', bus27],
]);

for (const app of apps.aplicaciones) {
  if (app.revisionPendiente !== true) continue;

  if (app.fuente?.imagen === 'lote1-img-21.jpeg' && app.marca === 'CHEVROLET') {
    const refs = taxi21.get(app.textoCatalogo);
    if (!refs) {
      closed.skipped.push(`taxi21 ${app.textoCatalogo}`);
      continue;
    }
    app.referencias = refs;
    app.revisionPendiente = false;
    closed.chevyTaxi.push(app.textoCatalogo);
    continue;
  }

  if (app.fuente?.imagen === 'lote1-img-23.jpeg' && app.marca === 'CHEVROLET') {
    const refs = bus23.get(app.textoCatalogo);
    if (!refs) {
      closed.skipped.push(`bus23 ${app.textoCatalogo}`);
      continue;
    }
    app.referencias = structuredClone(refs);
    app.revisionPendiente = false;
    closed.chevyBus.push(app.textoCatalogo);
    continue;
  }

  if (app.fuente?.imagen === 'lote1-img-22.jpeg' && app.marca === 'HYUNDAI') {
    // Literales ya coinciden con ampliación; solo se levanta la marca.
    app.revisionPendiente = false;
    closed.hyundai.push(app.textoCatalogo);
    continue;
  }

  if (app.fuente?.imagen === 'lote1-img-22.jpeg' && app.marca === 'KIA') {
    app.revisionPendiente = false;
    closed.kia.push(app.textoCatalogo);
    continue;
  }
}

const pend = apps.aplicaciones.filter((a) => a.revisionPendiente === true).length;
apps.totales = {
  registros: apps.aplicaciones.length,
  marcas: new Set(apps.aplicaciones.map((a) => a.marca)).size,
  pendientesRevision: pend,
};

writeFileSync(appsPath, `${JSON.stringify(apps, null, 2)}\n`, 'utf8');

const brands = ['CHEVROLET', 'HYUNDAI', 'FORD', 'KIA', 'BMW'];
const brandStats = {};
for (const b of brands) {
  const all = apps.aplicaciones.filter((a) => a.marca === b);
  brandStats[b] = {
    pend: all.filter((a) => a.revisionPendiente).length,
    usable: all.filter((a) => !a.revisionPendiente).length,
    total: all.length,
  };
}

console.log(
  JSON.stringify(
    {
      closed,
      totals: {
        pend,
        usable: apps.aplicaciones.length - pend,
        registros: apps.aplicaciones.length,
      },
      brandStats,
      fordStillPend: apps.aplicaciones
        .filter((a) => a.marca === 'FORD' && a.revisionPendiente)
        .map((a) => a.textoCatalogo),
    },
    null,
    2,
  ),
);
