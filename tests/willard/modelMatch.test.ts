import { describe, expect, it } from 'vitest';
import {
  compactWillardModel,
  scoreWillardModelMatch,
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

  it('returns null for empty query', () => {
    expect(scoreWillardModelMatch('  ', 'CX3', 'CX3')).toBeNull();
  });
});
