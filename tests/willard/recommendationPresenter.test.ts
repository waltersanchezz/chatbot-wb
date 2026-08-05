import { describe, expect, it } from 'vitest';
import { RecommendationPresenter } from '../../src/application/services/RecommendationPresenter';
import type { BatteryRecommendationResult } from '../../src/domain/willard/batteryRecommendation';

const presenter = new RecommendationPresenter();

function baseItem(overrides: Partial<BatteryRecommendationResult['recommendations'][0]> = {}) {
  return {
    reference: 'NS60D-620',
    cca: 620,
    caseType: 'Willard',
    observations: 'Terminal ESTANDAR',
    ...overrides,
  };
}

describe('RecommendationPresenter', () => {
  it('exact → mensaje comercial con vehículo, ref, CCA, caja, obs y confianza', () => {
    const result: BatteryRecommendationResult = {
      matchKind: 'exact',
      query: {
        marca: 'RENAULT',
        modelo: 'Logan',
        year: '2013',
        soundSystem: false,
      },
      recommendations: [baseItem()],
      similarVehicles: [],
      reasonCode: 'EXACT_MATCH',
    };

    const presented = presenter.present(result);
    expect(presented.matchKind).toBe('exact');
    expect(presented.text).toMatch(/¡Listo!/i);
    expect(presented.text).toContain('RENAULT Logan 2013');
    expect(presented.text).toContain('NS60D-620');
    expect(presented.text).toContain('620');
    expect(presented.text).toContain('Willard');
    expect(presented.text).toContain('Terminal ESTANDAR');
    expect(presented.text).toMatch(/Coincidencia exacta/i);
    expect(presented.text).toMatch(/asesor.*disponibilidad y precio/i);
    expect(presented.text).not.toMatch(/\$|COP|inventario/i);
  });

  it('year_range → indica confianza por rango de años', () => {
    const result: BatteryRecommendationResult = {
      matchKind: 'year_range',
      query: {
        marca: 'DODGE',
        modelo: 'Dakota',
        year: '2009',
      },
      recommendations: [
        baseItem({
          reference: '27-80 EFB',
          cca: 700,
          caseType: 'Willard AGM',
          observations: null,
        }),
      ],
      similarVehicles: [],
      reasonCode: 'YEAR_RANGE_MATCH',
    };

    const presented = presenter.present(result);
    expect(presented.matchKind).toBe('year_range');
    expect(presented.text).toContain('DODGE Dakota 2009');
    expect(presented.text).toContain('27-80 EFB');
    expect(presented.text).toContain('700');
    expect(presented.text).toContain('Willard AGM');
    expect(presented.text).not.toContain('Observaciones:');
    expect(presented.text).toMatch(/rango de años/i);
    expect(presented.text).toMatch(/asesor.*disponibilidad y precio/i);
  });

  it('similar → menciona modelo de catálogo usado y confianza aproximada', () => {
    const result: BatteryRecommendationResult = {
      matchKind: 'similar',
      query: {
        marca: 'CHEVROLET',
        modelo: 'Spakk',
        year: '2016',
      },
      recommendations: [
        baseItem({
          reference: 'NS40D-670',
          cca: 550,
          caseType: 'Extrema',
          observations: 'Alternativa cercana',
          catalogLabel: 'Spark GTI 1.2LT',
        }),
      ],
      similarVehicles: [
        {
          marca: 'CHEVROLET',
          modelo: 'Spark',
          textoCatalogo: 'Spark GTI 1.2LT',
        },
      ],
      reasonCode: 'SIMILAR_MODEL',
    };

    const presented = presenter.present(result);
    expect(presented.matchKind).toBe('similar');
    expect(presented.text).toContain('CHEVROLET Spakk 2016');
    expect(presented.text).toContain('NS40D-670');
    expect(presented.text).toMatch(/aproximada|similar/i);
    expect(presented.text).toContain('Spark GTI 1.2LT');
    expect(presented.text).toMatch(/asesor.*disponibilidad y precio/i);
  });

  it('none → mensaje sin inventar referencia y deriva a asesor', () => {
    const result: BatteryRecommendationResult = {
      matchKind: 'none',
      query: {
        marca: 'FERRARI',
        modelo: 'F40',
        year: '1990',
      },
      recommendations: [],
      similarVehicles: [],
      reasonCode: 'NO_MATCH',
    };

    const presented = presenter.present(result);
    expect(presented.matchKind).toBe('none');
    expect(presented.text).toContain('FERRARI F40 1990');
    expect(presented.text).toMatch(/No encontré una referencia/i);
    expect(presented.text).toMatch(/asesor.*disponibilidad y precio/i);
    expect(presented.text).not.toMatch(/Referencia:\s*\*/);
  });
});
