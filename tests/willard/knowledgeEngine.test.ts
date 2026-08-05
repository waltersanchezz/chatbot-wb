import { describe, expect, it } from 'vitest';
import { KnowledgeEngine } from '../../src/application/services/KnowledgeEngine';
import { KnowledgeRepository } from '../../src/application/services/KnowledgeRepository';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';

function buildEngine() {
  const apps = [
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['850'], increibleTitanio: ['750'] },
      fila: 1,
    }),
    hit({
      marca: 'RENAULT',
      modelo: 'Symbol',
      textoCatalogo: 'Symbol',
      refs: { willard: ['850'] },
      fila: 2,
    }),
    hit({
      marca: 'MAZDA',
      modelo: 'Mazda 2',
      textoCatalogo: 'Mazda 2',
      refs: { willard: ['750'] },
      fila: 3,
    }),
  ];
  const specs = new Map<string, WillardReferenceSpec>([
    [
      '850',
      {
        ...spec('850'),
        cca18C: 620,
        c20Ah: 70,
        linea: 'Willard',
        notas: 'Uso urbano recomendado',
        polaridad: '(- +)',
        terminal: 'ESTANDAR',
        dimensionesMm: { largo: 242, ancho: 175, alto: 190 },
      },
    ],
    [
      '750',
      {
        ...spec('750'),
        cca18C: 540,
        c20Ah: 60,
        linea: 'Increíble Titanio',
        notas: null,
        polaridad: '(- +)',
        terminal: 'ESTANDAR',
        dimensionesMm: { largo: 242, ancho: 175, alto: 175 },
      },
    ],
  ]);

  const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
  const repository = new KnowledgeRepository(knowledge);
  return new KnowledgeEngine(repository);
}

describe('KnowledgeEngine — explicación', () => {
  it('explica una referencia con CCA, Ah, caja y observaciones', () => {
    const engine = buildEngine();
    const result = engine.query({ type: 'EXPLAIN', reference: '850' });

    expect(result.intent).toBe('explanation');
    expect(result.found).toBe(true);
    expect(result.answer).toMatch(/850/);
    expect(result.answer).toMatch(/CCA:\*\s*620|CCA[:*]*\s*620/);
    expect(result.answer).toMatch(/70/);
    expect(result.answer).toMatch(/Willard/);
    expect(result.answer).toMatch(/Uso urbano recomendado/);
    expect(result.explanation?.catalogVehicles.some((v) => /Logan/i.test(v.modelo))).toBe(
      true,
    );
  });

  it('ASK: ¿por qué recomienda la 850?', () => {
    const engine = buildEngine();
    const result = engine.ask('¿Por qué recomienda la 850?');
    expect(result.intent).toBe('explanation');
    expect(result.found).toBe(true);
    expect(result.answer).toMatch(/CCA/i);
  });
});

describe('KnowledgeEngine — comparación', () => {
  it('compara 750 vs 850 con diferencias y cuándo elegir', () => {
    const engine = buildEngine();
    const result = engine.query({ type: 'COMPARE', left: '750', right: '850' });

    expect(result.intent).toBe('comparison');
    expect(result.found).toBe(true);
    expect(result.answer).toMatch(/750/);
    expect(result.answer).toMatch(/850/);
    expect(result.answer).toMatch(/CCA/i);
    expect(result.answer).toMatch(/Cuándo elegir/i);
    expect(result.comparison?.points.length).toBeGreaterThan(2);
    expect(result.comparison?.recommendation).toBeTruthy();
  });

  it('ASK: 750 vs 850', () => {
    const engine = buildEngine();
    const result = engine.ask('750 vs 850');
    expect(result.intent).toBe('comparison');
    expect(result.found).toBe(true);
  });
});

describe('KnowledgeEngine — alternativas', () => {
  it('busca equivalentes cuando no hay 850', () => {
    const engine = buildEngine();
    const result = engine.query({ type: 'ALTERNATIVES', reference: '850' });

    expect(result.intent).toBe('alternatives');
    expect(result.found).toBe(true);
    expect(result.alternatives?.items.some((i) => i.reference === '750')).toBe(true);
    expect(result.answer).toMatch(/750/);
  });

  it('ASK: No tengo una 850', () => {
    const engine = buildEngine();
    const result = engine.ask('No tengo una 850');
    expect(result.intent).toBe('alternatives');
    expect(result.found).toBe(true);
  });
});

describe('KnowledgeEngine — FAQ', () => {
  it('responde qué significa CCA', () => {
    const engine = buildEngine();
    const result = engine.query({ type: 'FAQ', topicOrQuestion: '¿Qué significa CCA?' });
    expect(result.intent).toBe('faq');
    expect(result.found).toBe(true);
    expect(result.faq?.articleId).toBe('cca');
    expect(result.answer).toMatch(/Cold Cranking/i);
  });

  it('responde Ah, libre mantenimiento, menor y mayor', () => {
    const engine = buildEngine();
    expect(engine.faq('¿Qué significa Ah?').faq?.articleId).toBe('ah');
    expect(engine.faq('batería libre de mantenimiento').faq?.articleId).toBe(
      'libre-mantenimiento',
    );
    expect(engine.faq('¿Qué pasa si instalo una batería menor?').faq?.articleId).toBe(
      'bateria-menor',
    );
    expect(engine.faq('¿Qué pasa si instalo una batería mayor?').faq?.articleId).toBe(
      'bateria-mayor',
    );
  });
});

describe('KnowledgeEngine — compatibilidad', () => {
  it('850 sirve para Logan según catálogo', () => {
    const engine = buildEngine();
    const result = engine.query({
      type: 'COMPATIBILITY',
      reference: '850',
      marca: 'Renault',
      modelo: 'Logan',
    });

    expect(result.intent).toBe('compatibility');
    expect(result.found).toBe(true);
    expect(result.compatibility?.compatible).toBe(true);
    expect(result.answer).toMatch(/Sí/i);
  });

  it('850 no aparece para Mazda 2', () => {
    const engine = buildEngine();
    const result = engine.compatibility('850', 'Mazda', 'Mazda 2');
    expect(result.compatibility?.compatible).toBe(false);
    expect(result.answer).toMatch(/no encuentro/i);
  });

  it('ASK: ¿Le sirve una 850 a un Logan?', () => {
    const engine = buildEngine();
    const result = engine.ask('¿Le sirve una 850 a un Logan?');
    expect(result.intent).toBe('compatibility');
    expect(result.found).toBe(true);
  });
});

describe('KnowledgeEngine — independencia', () => {
  it('referencia inexistente no inventa datos', () => {
    const engine = buildEngine();
    const result = engine.explain('NO-EXISTE-999');
    expect(result.found).toBe(false);
    expect(result.answer).toMatch(/No encontré/i);
  });
});
