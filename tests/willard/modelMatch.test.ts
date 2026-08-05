import { describe, expect, it } from 'vitest';
import {
  compactWillardModel,
  scoreWillardModelMatch,
  softTokenMatch,
  stripLeadingBrandFromModel,
  tokenizeWillardModel,
} from '../../src/domain/willard/modelMatch';

describe('tokenizeWillardModel', () => {
  it('keeps glued alnum as one token', () => {
    expect(tokenizeWillardModel('cx3')).toEqual(['cx3']);
    expect(tokenizeWillardModel('320i')).toEqual(['320i']);
    expect(tokenizeWillardModel('CX30')).toEqual(['cx30']);
  });

  it('keeps decimals as one token', () => {
    expect(tokenizeWillardModel('2.3')).toEqual(['2.3']);
    expect(tokenizeWillardModel('159 2.2')).toEqual(['159', '2.2']);
  });

  it('splits on spaces and punctuation', () => {
    expect(tokenizeWillardModel('Mazda 3 All New')).toEqual([
      'mazda',
      '3',
      'all',
      'new',
    ]);
    expect(tokenizeWillardModel('CX-30')).toEqual(['cx', '30']);
  });

  it('strips diacritics', () => {
    expect(tokenizeWillardModel('Génesis')).toEqual(['genesis']);
  });
});

describe('compactWillardModel', () => {
  it('joins tokens without spaces and preserves decimals', () => {
    expect(compactWillardModel('Mazda 3')).toBe('mazda3');
    expect(compactWillardModel('CX-30')).toBe('cx30');
    expect(compactWillardModel('2.3')).toBe('2.3');
  });
});

describe('stripLeadingBrandFromModel', () => {
  it('removes repeated brand prefix from model text', () => {
    expect(stripLeadingBrandFromModel('Chevrolet Spark GT', 'chevrolet')).toBe(
      'spark gt',
    );
    expect(stripLeadingBrandFromModel('Mazda 3 Skyactive', 'MAZDA')).toBe(
      '3 skyactive',
    );
  });

  it('leaves model unchanged when brand is not a prefix', () => {
    expect(stripLeadingBrandFromModel('Spark GT', 'chevrolet')).toBe('Spark GT');
  });
});

describe('softTokenMatch / editDistance', () => {
  it('allows gt≈gti and small typos on letter tokens', () => {
    expect(softTokenMatch('gt', 'gti')).toBe(true);
    expect(softTokenMatch('skyactive', 'skyactiv')).toBe(true);
    expect(softTokenMatch('spark', 'spark')).toBe(true);
  });

  it('does not soft-match glued alnum siblings (cx3 vs cx30)', () => {
    expect(softTokenMatch('cx3', 'cx30')).toBe(false);
    expect(softTokenMatch('3', 'cx3')).toBe(false);
  });
});

describe('scoreWillardModelMatch', () => {
  it('scores exact modelo normalize/compact as 4', () => {
    expect(scoreWillardModelMatch('320i', '320i', '320i')).toBe(4);
    expect(scoreWillardModelMatch('cx30', 'CX-30', 'CX-30 Hybrid')).toBe(4);
  });

  it('scores exact texto match as 3 when modelo differs', () => {
    expect(
      scoreWillardModelMatch('CX30 Hybrid', 'CX30', 'CX30 Hybrid'),
    ).toBe(3);
  });

  it('scores whole-token modelo subset as 2', () => {
    expect(
      scoreWillardModelMatch('3', 'Mazda 3 All New', 'Mazda 3 All New'),
    ).toBe(2);
  });

  it('allows glued query alternate tokens (mazda3 → mazda + 3)', () => {
    expect(
      scoreWillardModelMatch('mazda3', 'Mazda 3 All New', 'Mazda 3 All New'),
    ).toBe(2);
  });

  it('never matches via character includes (3 vs cx3, cx3 vs cx30)', () => {
    expect(scoreWillardModelMatch('3', 'CX3', 'CX3')).toBeNull();
    expect(scoreWillardModelMatch('cx3', 'CX30', 'CX30')).toBeNull();
    expect(scoreWillardModelMatch('cx3', 'CX30 Hybrid', 'CX30 Hybrid')).toBeNull();
  });

  it('rejects short numeric when only texto tokens match (score 1 blocked)', () => {
    expect(
      scoreWillardModelMatch('3', 'Sportage', 'paquete 3 puertas'),
    ).toBeNull();
  });

  it('allows texto-only token match for non-short-numeric queries', () => {
    expect(
      scoreWillardModelMatch('hybrid', 'CX30', 'CX30 Hybrid'),
    ).toBe(1);
  });

  it('tolerates spark gt ≈ Spark GTI and case/spacing variants', () => {
    expect(
      scoreWillardModelMatch('spark gt', 'Spark', 'Spark GTI 1.2LT'),
    ).toBe(1);
    expect(
      scoreWillardModelMatch('SPARK  GT', 'Spark', 'Spark GTI 1.2LT'),
    ).toBe(1);
  });

  it('tolerates compact typos on longer labels', () => {
    expect(
      scoreWillardModelMatch(
        'mazda 3 skyactiv',
        'Mazda 3 Skyactive',
        'Mazda 3 Skyactive',
      ),
    ).toBe(2);
  });

  it('returns null for empty query', () => {
    expect(scoreWillardModelMatch('  ', 'CX3', 'CX3')).toBeNull();
  });
});
