import { describe, expect, it } from 'vitest';
import {
  applyLeadTransition,
  assertLeadTransition,
  getAllowedTransitions,
  IllegalLeadTransitionError,
} from '../../src/application/crm/leadStateMachine';
import type { LeadStatus } from '../../src/domain/entities/Lead';

describe('LeadStateMachine', () => {
  it('expone transiciones permitidas del pipeline', () => {
    expect(getAllowedTransitions('nuevo')).toContain('asignado');
    expect(getAllowedTransitions('nuevo')).toContain('cotizado');
    expect(getAllowedTransitions('vendido')).toEqual([]);
  });

  it('applyLeadTransition same-status es no-op', () => {
    expect(applyLeadTransition('nuevo', 'nuevo')).toBe('nuevo');
  });

  it('assertLeadTransition lanza IllegalLeadTransitionError', () => {
    expect(() => assertLeadTransition('vendido', 'nuevo')).toThrow(
      IllegalLeadTransitionError,
    );
    try {
      assertLeadTransition('cerrado', 'en_gestion');
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalLeadTransitionError);
      const e = err as IllegalLeadTransitionError;
      expect(e.code).toBe('ILLEGAL_LEAD_TRANSITION');
      expect(e.from).toBe('cerrado');
      expect(e.to).toBe('en_gestion');
    }
  });

  it('cubre atajos legacy y pipeline', () => {
    const cases: Array<[LeadStatus, LeadStatus]> = [
      ['nuevo', 'asignado'],
      ['nuevo', 'en_gestion'],
      ['nuevo', 'cotizado'],
      ['asignado', 'en_gestion'],
      ['en_gestion', 'recontacto'],
      ['recontacto', 'en_gestion'],
      ['cotizado', 'vendido'],
    ];
    for (const [from, to] of cases) {
      expect(() => assertLeadTransition(from, to)).not.toThrow();
    }
  });
});
