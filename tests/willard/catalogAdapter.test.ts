import path from 'path';
import { describe, expect, it } from 'vitest';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';

const fixtures = path.join(process.cwd(), 'tests', 'fixtures', 'willard');
const appsPath = path.join(fixtures, 'apps-mini.json');
const refsPath = path.join(fixtures, 'refs-mini.json');

function loadCatalog(): CatalogFileWillardBatteryKnowledge {
  return new CatalogFileWillardBatteryKnowledge(appsPath, refsPath);
}

describe('CatalogFileWillardBatteryKnowledge', () => {
  it('UC-01: finds usable BMW 320i with catalog references', () => {
    const kb = loadCatalog();
    const hits = kb.findApplicationsByVehicle({ marca: 'BMW', modelo: '320i' });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.modelo).toBe('320i');
    expect(hits[0]?.revisionPendiente).toBe(false);
    const refs = hits[0]?.lines.flatMap((l) => l.references) ?? [];
    expect(refs).toContain('W-L5-95AH');
    expect(refs).toContain('49-1200');
  });

  it('UC-02: ignores revisionPendiente applications', () => {
    const kb = loadCatalog();
    const bmw = kb.findApplicationsByVehicle({ marca: 'BMW' });
    expect(bmw.map((h) => h.modelo)).toEqual(['320i']);
    expect(bmw.some((h) => h.modelo === '318i')).toBe(false);
  });

  it('UC-03: brand without model returns usable apps for that brand', () => {
    const kb = loadCatalog();
    const hino = kb.findApplicationsByVehicle({ marca: 'HINO' });
    expect(hino.length).toBeGreaterThanOrEqual(1);
    expect(hino.every((h) => h.marca === 'HINO')).toBe(true);
  });

  it('UC-04: requireVersion filters Alfa 159 2.2 vs 3.2', () => {
    const kb = loadCatalog();
    const strict = kb.findApplicationsByVehicle({
      marca: 'ALFA ROMEO',
      modelo: '159',
      version: '2.2',
      requireVersion: true,
    });
    expect(strict).toHaveLength(1);
    expect(strict[0]?.version).toBe('2.2');

    const soft = kb.findApplicationsByVehicle({
      marca: 'ALFA ROMEO',
      modelo: '159',
      version: '2.2',
      requireVersion: false,
    });
    expect(soft.map((h) => h.version)).toEqual(['2.2', '3.2']);
  });

  it('UC-05: finds applications by reference literal', () => {
    const kb = loadCatalog();
    const hits = kb.findApplicationsByReference('NS40D PD 670');
    expect(hits.map((h) => h.marca).sort()).toEqual(['CHANA', 'CHEVROLET']);
  });

  it('UC-06: orphan catalog reference has null spec', () => {
    const kb = loadCatalog();
    expect(kb.findReferenceSpec('49-1200')).toBeNull();
    const hits = kb.findApplicationsByVehicle({ marca: 'BMW', modelo: '320i' });
    const willard = hits[0]?.lines.find((l) => l.line === 'willard');
    expect(willard?.references).toContain('49-1200');
  });

  it('UC-08: empty product-line cells stay empty', () => {
    const kb = loadCatalog();
    const [chana] = kb.findApplicationsByVehicle({ marca: 'CHANA', modelo: 'Benni' });
    expect(chana?.lines.find((l) => l.line === 'willardAgmEfb')?.references).toEqual([]);
    expect(chana?.lines.find((l) => l.line === 'extrema')?.references).toEqual([
      'NS40D PD 670',
    ]);
  });

  it('UC-09: (2) literal matches exactly and does not match bare reference', () => {
    const kb = loadCatalog();
    expect(kb.findApplicationsByReference('55DD-800 (2)')).toHaveLength(1);
    expect(kb.findApplicationsByReference('55DD-800')).toHaveLength(1);
    const bare = kb.findApplicationsByReference('55DD-800');
    expect(bare[0]?.modelo).toBe('Dutro');
    const withTwo = kb.findApplicationsByReference('55DD-800 (2)');
    expect(withTwo[0]?.modelo).toBe('NPR Reward 5.2');
  });

  it('UC-10: every hit includes fuente.imagen and fuente.fila', () => {
    const kb = loadCatalog();
    const hits = kb.findApplicationsByVehicle({ marca: 'BMW', modelo: '320i' });
    expect(hits[0]?.fuente.imagen).toBe('lote1-img-05.jpeg');
    expect(hits[0]?.fuente.fila).toBe(8);
  });

  it('returns usable reference specs and hides pending specs', () => {
    const kb = loadCatalog();
    const spec = kb.findReferenceSpec('W-L5-95AH');
    expect(spec?.c20Ah).toBe(95);
    expect(spec?.linea).toBe('Willard AGM');
    expect(kb.findReferenceSpec('ghost-pending')).toBeNull();
  });

  it('returns empty for unknown brand and empty marca', () => {
    const kb = loadCatalog();
    expect(kb.findApplicationsByVehicle({ marca: 'ZZZZ' })).toEqual([]);
    expect(kb.findApplicationsByVehicle({ marca: '   ' })).toEqual([]);
  });

  it('legacy findRecommendations stays empty on catalog adapter', () => {
    const kb = loadCatalog();
    expect(
      kb.findRecommendations({ brand: 'BMW', model: '320i', soundSystem: false }),
    ).toEqual([]);
  });
});
