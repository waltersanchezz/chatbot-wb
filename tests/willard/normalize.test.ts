import { describe, expect, it } from 'vitest';
import {
  normalizeReferenceLiteral,
  normalizeWillardText,
} from '../../src/domain/willard/normalize';

describe('normalizeWillardText', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalizeWillardText('Génesis')).toBe('genesis');
  });

  it('collapses non-alphanumeric to single spaces', () => {
    expect(normalizeWillardText('  BMW   320i  ')).toBe('bmw 320i');
  });
});

describe('normalizeReferenceLiteral', () => {
  it('trims and collapses spaces without removing hyphens or (2)', () => {
    expect(normalizeReferenceLiteral('  55DD-800 (2)  ')).toBe('55DD-800 (2)');
    expect(normalizeReferenceLiteral('NS40D  PD  670')).toBe('NS40D PD 670');
  });
});
