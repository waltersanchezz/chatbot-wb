/**
 * Cotejo marcas sin cobertura (prioridad 2026-07-29):
 * HINO, IVECO, DONG FENG, CHRYSLER, CHANA, HAFEI, AGRALE, KUBOTA (parcial), MASSEY (si evidencia).
 * Uso puntual; borrar tras aplicar.
 */
import fs from 'node:fs';

const path = 'data/willardApplications.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const resueltos = [];
const corregidos = [];
const log = (msg) => {
  corregidos.push(msg);
};

for (const app of data.aplicaciones) {
  const img = app.fuente.imagen;
  const marca = app.marca;
  const texto = app.textoCatalogo;

  // --- CHRYSLER (p09): fila confirmada 34I ---
  if (marca === 'CHRYSLER' && img === 'lote1-img-09.jpeg' && app.revisionPendiente) {
    app.revisionPendiente = false;
    resueltos.push(`${marca} | ${texto}`);
  }

  // --- HAFEI (p10): bloque homogéneo NS40D PD 670 ---
  if (marca === 'HAFEI' && img === 'lote1-img-10.jpeg' && app.revisionPendiente) {
    app.revisionPendiente = false;
    resueltos.push(`${marca} | ${texto}`);
  }

  // --- CHANA (p06): Extrema NS40D PD 670 en las 4 ---
  if (marca === 'CHANA' && img === 'lote1-img-06.jpeg' && app.revisionPendiente) {
    app.revisionPendiente = false;
    resueltos.push(`${marca} | ${texto}`);
  }

  // --- AGRALE (p23): Buseta o Camion 4DT confirmado ---
  if (marca === 'AGRALE' && img === 'lote1-img-23.jpeg' && app.revisionPendiente) {
    app.revisionPendiente = false;
    resueltos.push(`${marca} | ${texto}`);
  }

  // --- DONG FENG (p24): solo Extrema 31H-1250 P ---
  if (marca === 'DONG FENG' && img === 'lote1-img-24.jpeg' && app.revisionPendiente) {
    app.revisionPendiente = false;
    resueltos.push(`${marca} | ${texto}`);
  }

  // --- IVECO (p26) ---
  if (marca === 'IVECO' && img === 'lote1-img-26.jpeg') {
    // Buseta: print shows continuation of 27AI block (not 4DT)
    if (texto === 'Buseta') {
      const before = JSON.stringify(app.referencias);
      app.referencias = {
        willardAgmEfb: ['27-80 EFB'],
        increibleTitanio: ['27AI-1250'],
        willard: ['27AI-1150'],
        extrema: ['27AI-1000'],
      };
      if (JSON.stringify(app.referencias) !== before) {
        log('IVECO Buseta: 4DT → bloque 27AI (impreso)');
      }
    }
    // Chasis Volqueta: print shows 4DT (was 31H in JSON)
    if (texto === 'Chasis Volqueta') {
      const before = JSON.stringify(app.referencias);
      app.referencias = {
        willardAgmEfb: [],
        increibleTitanio: [],
        willard: ['4DT-1500'],
        extrema: ['4DT-1400'],
      };
      if (JSON.stringify(app.referencias) !== before) {
        log('IVECO Chasis Volqueta: 31H → 4DT-1500/1400 (impreso)');
      }
    }
    // CNG: name 60→65 and refs 31H
    if (texto.includes('CNG')) {
      if (texto.includes('60C14G')) {
        app.textoCatalogo = texto.replace('60C14G', '65C14G');
        if (app.modelo && app.modelo.includes('60C14G')) {
          app.modelo = app.modelo.replace('60C14G', '65C14G');
        }
        log('IVECO CNG: 60C14G → 65C14G');
      }
      if (app.referencias.willard.length === 0) {
        app.referencias.willard = ['31H-1300 T'];
        app.referencias.extrema = ['31H-1250 T'];
        log('IVECO CNG: refs vacías → 31H-1300 T / 31H-1250 T');
      }
    }
    if (app.revisionPendiente) {
      app.revisionPendiente = false;
      resueltos.push(`${marca} | ${app.textoCatalogo}`);
    }
  }

  // --- HINO (p25) ---
  if (marca === 'HINO' && img === 'lote1-img-25.jpeg') {
    if (texto === 'BUS RK8J') {
      // Solo Willard 55DD-800 (2); AGM vacío; 4DT-1400 es huérfano del encabezado
      if (app.referencias.willardAgmEfb.length > 0) {
        app.referencias.willardAgmEfb = [];
        log('HINO BUS RK8J: quitar AGM 35-65 EFB(2) (no está en la fila)');
      }
      app.referencias.willard = ['55DD-800 (2)'];
      app.referencias.extrema = [];
    }
    if (texto === 'Dutro Pro Euro IV 2016') {
      if (app.referencias.willardAgmEfb.length === 0) {
        app.referencias.willardAgmEfb = ['35-65 EFB(2)'];
        log('HINO Dutro Pro: agregar AGM 35-65 EFB(2)');
      }
    }
    if (texto === 'FC8J' || (app.modelo === 'FC8J')) {
      app.textoCatalogo = 'FC9J';
      app.modelo = 'FC9J';
      log('HINO FC8J → FC9J');
    }
    // SERIE 500 vacío confirmado; SERIE 300 solo Titanio 34D-1200 confirmado
    // GD/MDT/RK/GB/FG/FC BUS match print
    if (app.revisionPendiente) {
      app.revisionPendiente = false;
      resueltos.push(`${marca} | ${app.textoCatalogo}`);
    }
  }

  // --- KUBOTA (p29): solo L3600 y M110 si coinciden; Series M4000 mantiene Willard=Extrema duda? ---
  // Print confirms L3600 block and M110 4DBT; Series M4000 has 31H in both W and E (literal print)
  if (marca === 'KUBOTA' && img === 'lote1-img-29.jpeg' && app.revisionPendiente) {
    // L3600: clear
    if (texto.includes('L3600')) {
      app.revisionPendiente = false;
      resueltos.push(`${marca} | ${texto}`);
    }
    // M110: clear with 4DBT as in print (second crop confirmed 4DBT not 48RT)
    if (texto.includes('M110')) {
      app.revisionPendiente = false;
      resueltos.push(`${marca} | ${texto}`);
    }
    // Series M4000: literal 31H in both columns — keep pending (duda de línea de producto)
  }

  // --- MASSEY FERGUSON: same pattern as Series M4000 — keep pending unless we confirm ---
}

fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

const porMarca = {};
for (const m of [
  'HINO',
  'IVECO',
  'DONG FENG',
  'CHRYSLER',
  'CHANA',
  'HAFEI',
  'AGRALE',
  'KUBOTA',
  'MASSEY FERGUSON',
]) {
  const rows = data.aplicaciones.filter((a) => a.marca === m);
  porMarca[m] = {
    ok: rows.filter((r) => !r.revisionPendiente).length,
    pend: rows.filter((r) => r.revisionPendiente).length,
  };
}

const sinCob = [...new Set(data.aplicaciones.map((a) => a.marca))]
  .filter((m) => !data.aplicaciones.some((a) => a.marca === m && !a.revisionPendiente))
  .sort();

console.log(
  JSON.stringify(
    {
      resueltos: resueltos.length,
      corregidos,
      porMarca,
      sinCobertura: sinCob,
      pendientesTotales: data.aplicaciones.filter((a) => a.revisionPendiente).length,
    },
    null,
    2,
  ),
);
