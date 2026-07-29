/**
 * Cierre cobertura: ALFA ROMEO, KUBOTA Series M4000, MASSEY FERGUSON.
 * Valores literales del impreso; no reasigna familias.
 */
import fs from 'node:fs';

const path = 'data/willardApplications.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
const res = [];

for (const app of data.aplicaciones) {
  if (app.marca === 'ALFA ROMEO' && app.revisionPendiente) {
    app.revisionPendiente = false;
    res.push(`ALFA ROMEO | ${app.textoCatalogo}`);
  }
  if (
    app.marca === 'KUBOTA' &&
    app.textoCatalogo.includes('M4000') &&
    app.revisionPendiente
  ) {
    app.revisionPendiente = false;
    res.push(`KUBOTA | ${app.textoCatalogo}`);
  }
  if (app.marca === 'MASSEY FERGUSON' && app.revisionPendiente) {
    app.revisionPendiente = false;
    res.push(`MASSEY FERGUSON | ${app.textoCatalogo}`);
  }
}

fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ resueltos: res.length, detalle: res }, null, 2));
