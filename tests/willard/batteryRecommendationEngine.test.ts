import { describe, expect, it } from 'vitest';
import { BatteryRecommendationEngine } from '../../src/application/services/BatteryRecommendationEngine';
import {
  yearMatchesCatalogText,
  parseYearConstraints,
} from '../../src/domain/willard/yearRange';
import {
  FakeWillardBatteryKnowledge,
  hit,
  spec,
} from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';

function buildEngine() {
  const specs = new Map<string, WillardReferenceSpec>([
    [
      'REF-EXACT',
      {
        ...spec('REF-EXACT'),
        cca18C: 620,
        linea: 'Willard',
        notas: 'Uso general',
        terminal: 'ESTANDAR',
      },
    ],
    [
      'REF-RANGE',
      {
        ...spec('REF-RANGE'),
        cca18C: 700,
        linea: 'Willard AGM',
        notas: null,
        terminal: 'ESTANDAR',
      },
    ],
    [
      'REF-SIMILAR',
      {
        ...spec('REF-SIMILAR'),
        cca18C: 550,
        linea: 'Extrema',
        notas: 'Alternativa cercana',
        terminal: 'ESTANDAR',
      },
    ],
  ]);

  const knowledge = new FakeWillardBatteryKnowledge(
    [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['REF-EXACT'] },
        fila: 1,
      }),
      hit({
        marca: 'DODGE',
        modelo: 'Dakota',
        version: '2006-2012',
        textoCatalogo: 'Dakota (2006-2012)',
        refs: { willardAgmEfb: ['REF-RANGE'] },
        fila: 2,
      }),
      hit({
        marca: 'DODGE',
        modelo: 'Dakota',
        version: '1999, 2005',
        textoCatalogo: 'Dakota (1999, 2005)',
        refs: { willard: ['REF-EXACT'] },
        fila: 3,
      }),
      hit({
        marca: 'CHEVROLET',
        modelo: 'Spark',
        textoCatalogo: 'Spark GTI 1.2LT',
        refs: { extrema: ['REF-SIMILAR'] },
        fila: 4,
      }),
      hit({
        marca: 'CHEVROLET',
        modelo: 'Sail',
        textoCatalogo: 'Sail',
        refs: { willard: ['REF-EXACT'] },
        fila: 5,
      }),
    ],
    specs,
  );

  return new BatteryRecommendationEngine(knowledge);
}

describe('yearRange helpers', () => {
  it('parsea rangos 2006-2012', () => {
    const cs = parseYearConstraints('Dakota (2006-2012)');
    expect(cs.some((c) => c.kind === 'range' && c.from === 2006 && c.to === 2012)).toBe(
      true,
    );
  });

  it('2010 encaja en 2006-2012', () => {
    expect(yearMatchesCatalogText('2010', 'Dakota (2006-2012)').matches).toBe(true);
    expect(yearMatchesCatalogText('2010', 'Dakota (2006-2012)').usedRange).toBe(true);
  });

  it('2015 no encaja en 2006-2012', () => {
    expect(yearMatchesCatalogText('2015', 'Dakota (2006-2012)').matches).toBe(false);
  });
});

describe('BatteryRecommendationEngine', () => {
  it('coincidencia exacta → referencia, CCA, tipo de caja, observaciones', () => {
    const engine = buildEngine();
    const result = engine.recommend({
      marca: 'RENAULT',
      modelo: 'Logan',
      year: '2013',
      soundSystem: false,
    });

    expect(result.matchKind).toBe('exact');
    expect(result.reasonCode).toBe('EXACT_MATCH');
    expect(result.recommendations.length).toBeGreaterThan(0);

    const item = result.recommendations[0]!;
    expect(item.reference).toBe('REF-EXACT');
    expect(item.cca).toBe(620);
    expect(item.caseType).toMatch(/Willard/i);
    expect(item.observations).toBeTruthy();
    // Sin precio ni disponibilidad
    expect(JSON.stringify(item)).not.toMatch(/precio|price|stock|disponib/i);
  });

  it('coincidencia por rango de años', () => {
    const engine = buildEngine();
    const result = engine.recommend({
      marca: 'DODGE',
      modelo: 'Dakota',
      year: '2009',
      soundSystem: true,
    });

    expect(result.matchKind).toBe('year_range');
    expect(result.reasonCode).toBe('YEAR_RANGE_MATCH');
    expect(result.recommendations.some((r) => r.reference === 'REF-RANGE')).toBe(
      true,
    );
    expect(result.recommendations[0]?.cca).toBe(700);
    expect(result.recommendations[0]?.caseType).toMatch(/AGM/i);
  });

  it('vehículo similar cuando el modelo no es exacto', () => {
    const engine = buildEngine();
    // "Spark GT" no es etiqueta exacta en el fake filter includes, pero score soft pega.
    const result = engine.recommend({
      marca: 'CHEVROLET',
      modelo: 'Spark GT',
      year: '2018',
      soundSystem: false,
    });

    // Fake findApplicationsByVehicle usa includes → "spark gt" vs "spark" may match.
    // Si matchKind exact/similar, debe devolver REF-SIMILAR.
    expect(['exact', 'similar', 'year_range']).toContain(result.matchKind);
    expect(result.recommendations.some((r) => r.reference === 'REF-SIMILAR')).toBe(
      true,
    );
  });

  it('vehículo similar por marca cuando el modelo no existe', () => {
    const engine = buildEngine();
    const result = engine.recommend({
      marca: 'CHEVROLET',
      modelo: 'Spakk', // typo cercano a Spark (edit distance)
      year: '2016',
    });

    expect(result.matchKind).toBe('similar');
    expect(result.reasonCode).toBe('SIMILAR_MODEL');
    expect(result.similarVehicles.length).toBeGreaterThan(0);
    expect(
      result.similarVehicles.some((v) => /spark/i.test(v.textoCatalogo)),
    ).toBe(true);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('vehículo inexistente → none sin inventar referencias', () => {
    const engine = buildEngine();
    const result = engine.recommend({
      marca: 'FERRARI',
      modelo: 'F40',
      year: '1990',
    });

    expect(result.matchKind).toBe('none');
    expect(result.reasonCode).toBe('NO_MATCH');
    expect(result.recommendations).toEqual([]);
    expect(result.similarVehicles).toEqual([]);
  });

  it('query incompleta → MISSING_QUERY', () => {
    const engine = buildEngine();
    const result = engine.recommend({
      marca: 'RENAULT',
      modelo: '',
    });
    expect(result.matchKind).toBe('none');
    expect(result.reasonCode).toBe('MISSING_QUERY');
  });
});
