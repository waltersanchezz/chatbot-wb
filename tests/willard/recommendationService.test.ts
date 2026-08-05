import { describe, expect, it } from 'vitest';
import { RecommendationService } from '../../src/application/services/RecommendationService';
import {
  FakeWillardBatteryKnowledge,
  hit,
  spec,
} from './FakeWillardBatteryKnowledge';

describe('RecommendationService', () => {
  it('vehículo encontrado → matched with options and specs where available', () => {
    const knowledge = new FakeWillardBatteryKnowledge(
      [
        hit({
          marca: 'BMW',
          modelo: '320i',
          refs: {
            willardAgmEfb: ['W-L5-95AH'],
            willard: ['49-1200'],
          },
        }),
      ],
      new Map([['W-L5-95AH', spec('W-L5-95AH')]]),
    );
    const service = new RecommendationService(knowledge);

    const result = service.recommendByVehicle({ marca: 'BMW', modelo: '320i' });

    expect(result.outcome).toBe('matched');
    expect(result.reasonCode).toBeUndefined();
    expect(result.applications).toHaveLength(1);
    expect(result.options).toHaveLength(2);
    expect(result.options.map((o) => o.reference).sort()).toEqual([
      '49-1200',
      'W-L5-95AH',
    ]);
    expect(result.options.find((o) => o.reference === 'W-L5-95AH')?.spec?.c20Ah).toBe(
      60,
    );
    expect(result.options.find((o) => o.reference === '49-1200')?.spec).toBeNull();
  });

  it('vehículo no encontrado → empty / NO_USABLE_MATCH', () => {
    const service = new RecommendationService(
      new FakeWillardBatteryKnowledge([
        hit({ marca: 'BMW', modelo: '320i', refs: { willard: ['49-1200'] } }),
      ]),
    );

    const result = service.recommendByVehicle({ marca: 'ZZZZ', modelo: 'X' });

    expect(result.outcome).toBe('empty');
    expect(result.reasonCode).toBe('NO_USABLE_MATCH');
    expect(result.options).toEqual([]);
    expect(result.applications).toEqual([]);
  });

  it('marca vacía → empty / NO_USABLE_MATCH', () => {
    const service = new RecommendationService(new FakeWillardBatteryKnowledge([]));
    const result = service.recommendByVehicle({ marca: '   ' });
    expect(result.outcome).toBe('empty');
    expect(result.reasonCode).toBe('NO_USABLE_MATCH');
  });

  it('registros revisionPendiente ignorados (puerto no los expone → empty)', () => {
    // El puerto solo entrega utilizables; una fila pendiente nunca llega al service.
    const knowledge = new FakeWillardBatteryKnowledge([
      hit({
        marca: 'BMW',
        modelo: '320i',
        refs: { willard: ['49-1200'] },
      }),
    ]);
    // Simula que 318i pendiente no está en el fake (filtrada en infra).
    const service = new RecommendationService(knowledge);

    const pendingOnly = service.recommendByVehicle({
      marca: 'BMW',
      modelo: '318i',
    });
    expect(pendingOnly.outcome).toBe('empty');
    expect(pendingOnly.reasonCode).toBe('NO_USABLE_MATCH');

    const usable = service.recommendByVehicle({ marca: 'BMW', modelo: '320i' });
    expect(usable.outcome).toBe('matched');
  });

  it('búsqueda por referencia → matched con apps que la citan', () => {
    const knowledge = new FakeWillardBatteryKnowledge(
      [
        hit({
          marca: 'CHANA',
          modelo: 'Benni',
          refs: { extrema: ['NS40D PD 670'] },
          fila: 1,
        }),
        hit({
          marca: 'CHEVROLET',
          modelo: 'Alto',
          refs: { extrema: ['NS40D PD 670'] },
          fila: 2,
        }),
      ],
      new Map([['NS40D PD 670', spec('NS40D PD 670')]]),
    );
    const service = new RecommendationService(knowledge);

    const result = service.recommendByReference({ referencia: 'NS40D PD 670' });

    expect(result.outcome).toBe('matched');
    expect(result.applications).toHaveLength(2);
    expect(result.options).toHaveLength(2);
    expect(result.options.every((o) => o.spec?.referencia === 'NS40D PD 670')).toBe(
      true,
    );
  });

  it('resultados parciales: vehículo match sin referencias → partial', () => {
    const service = new RecommendationService(
      new FakeWillardBatteryKnowledge([
        hit({ marca: 'FORD', modelo: 'V-8 Escape', refs: {} }),
      ]),
    );

    const result = service.recommendByVehicle({
      marca: 'FORD',
      modelo: 'V-8 Escape',
    });

    expect(result.outcome).toBe('partial');
    expect(result.reasonCode).toBe('VEHICLE_MATCH_WITHOUT_REFERENCES');
    expect(result.applications).toHaveLength(1);
    expect(result.options).toEqual([]);
  });

  it('múltiples aplicaciones válidas por marca', () => {
    const service = new RecommendationService(
      new FakeWillardBatteryKnowledge([
        hit({
          marca: 'HINO',
          modelo: 'Dutro',
          refs: { willard: ['55DD-800'] },
          fila: 1,
        }),
        hit({
          marca: 'HINO',
          modelo: 'FC9J',
          refs: { willard: ['4DT-1500'] },
          fila: 2,
        }),
      ]),
    );

    const result = service.recommendByVehicle({ marca: 'HINO' });

    expect(result.outcome).toBe('matched');
    expect(result.applications).toHaveLength(2);
    expect(result.options).toHaveLength(2);
    expect(result.applications.map((a) => a.modelo).sort()).toEqual([
      'Dutro',
      'FC9J',
    ]);
  });

  it('spec sin aplicaciones → empty / SPEC_WITHOUT_APPLICATIONS', () => {
    const knowledge = new FakeWillardBatteryKnowledge(
      [],
      new Map([['W-L5-95AH', spec('W-L5-95AH')]]),
    );
    const service = new RecommendationService(knowledge);

    const result = service.recommendByReference({ referencia: 'W-L5-95AH' });

    expect(result.outcome).toBe('empty');
    expect(result.reasonCode).toBe('SPEC_WITHOUT_APPLICATIONS');
  });

  it('lookupReference returns found=false when spec missing', () => {
    const service = new RecommendationService(
      new FakeWillardBatteryKnowledge(
        [hit({ marca: 'BMW', modelo: '320i', refs: { willard: ['49-1200'] } })],
      ),
    );

    expect(service.lookupReference('49-1200')).toEqual({
      reference: '49-1200',
      spec: null,
      found: false,
    });
    expect(service.lookupReference('W-L5-95AH').found).toBe(false);
  });

  it('lookupReference returns spec when present', () => {
    const s = spec('W-L5-95AH');
    const service = new RecommendationService(
      new FakeWillardBatteryKnowledge([], new Map([['W-L5-95AH', s]])),
    );
    const result = service.lookupReference('  W-L5-95AH  ');
    expect(result.found).toBe(true);
    expect(result.spec).toEqual(s);
  });

  it('does not invent empty cells as options', () => {
    const service = new RecommendationService(
      new FakeWillardBatteryKnowledge([
        hit({
          marca: 'CHANA',
          modelo: 'Benni',
          refs: { extrema: ['NS40D PD 670'] },
        }),
      ]),
    );
    const result = service.recommendByVehicle({ marca: 'CHANA', modelo: 'Benni' });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.productLine).toBe('extrema');
  });

  it('AMBIGUOUS_MODEL when ≥2 modelos con firmas de refs distintas', () => {
    const knowledge = new FakeWillardBatteryKnowledge([
      hit({
        marca: 'MAZDA',
        modelo: 'CX3',
        textoCatalogo: 'CX3',
        refs: { willard: ['FAKE-CX3'] },
        fila: 1,
      }),
      hit({
        marca: 'MAZDA',
        modelo: 'CX30',
        textoCatalogo: 'CX30',
        refs: { willard: ['FAKE-CX30'] },
        fila: 2,
      }),
    ]);
    const service = new RecommendationService(knowledge);

    const result = service.recommendByVehicle({ marca: 'MAZDA', modelo: 'cx' });

    expect(result.outcome).toBe('partial');
    expect(result.reasonCode).toBe('AMBIGUOUS_MODEL');
    expect(result.options).toEqual([]);
    expect(result.applications).toHaveLength(2);
  });

  it('mismas firmas de refs en modelos distintos → matched (no ambigüedad)', () => {
    const knowledge = new FakeWillardBatteryKnowledge([
      hit({
        marca: 'MAZDA',
        modelo: 'CX3',
        textoCatalogo: 'CX3',
        refs: { willard: ['SAME-REF'] },
        fila: 1,
      }),
      hit({
        marca: 'MAZDA',
        modelo: 'CX30',
        textoCatalogo: 'CX30',
        refs: { willard: ['SAME-REF'] },
        fila: 2,
      }),
    ]);
    const service = new RecommendationService(knowledge);

    const result = service.recommendByVehicle({ marca: 'MAZDA', modelo: 'cx' });

    expect(result.outcome).toBe('matched');
    expect(result.reasonCode).toBeUndefined();
    expect(result.options).toHaveLength(2);
    expect(result.applications).toHaveLength(2);
  });

  it('exact catalog label (case/spaces) disambiguates fuzzy siblings', () => {
    const knowledge = new FakeWillardBatteryKnowledge([
      hit({
        marca: 'MAZDA',
        modelo: 'Mazda 3 Skyactive',
        textoCatalogo: 'Mazda 3 Skyactive',
        refs: { willard: ['FAKE-SKY'] },
        fila: 1,
      }),
      hit({
        marca: 'MAZDA',
        modelo: 'Mazda 3 All New',
        textoCatalogo: 'Mazda 3 All New',
        refs: { willard: ['FAKE-ALLNEW'] },
        fila: 2,
      }),
    ]);
    const service = new RecommendationService(knowledge);

    const ambiguous = service.recommendByVehicle({
      marca: 'MAZDA',
      modelo: 'Mazda 3',
    });
    expect(ambiguous.reasonCode).toBe('AMBIGUOUS_MODEL');

    const exact = service.recommendByVehicle({
      marca: 'MAZDA',
      modelo: 'mazda 3 skyactive',
    });
    expect(exact.outcome).toBe('matched');
    expect(exact.reasonCode).toBeUndefined();
    expect(exact.options.map((o) => o.reference)).toEqual(['FAKE-SKY']);
    expect(exact.applications).toHaveLength(1);

    expect(
      service.resolveExactModelLabel('mazda', '  Mazda  3  Skyactive '),
    ).toBe('Mazda 3 Skyactive');
  });
});
