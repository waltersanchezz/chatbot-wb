import { describe, expect, it } from 'vitest';
import { computeLeadPriority } from '../../src/application/crm/priorityPolicy';
import type { Lead } from '../../src/domain/entities/Lead';

const now = new Date('2026-07-29T12:00:00.000Z');

function lead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    createdAt: now,
    updatedAt: now,
    customerId: 'cust-1',
    conversationId: 'conv-1',
    phone: '573001111111',
    product: 'Rodamiento',
    vehicleBrand: 'X',
    vehicleModel: 'Y',
    year: '2020',
    optionLabel: 'ABS',
    optionValue: null,
    recommendation: '',
    status: 'nuevo',
    needsHumanHandoff: false,
    ...overrides,
  };
}

describe('PriorityPolicy — CRM_SPEC §8.3', () => {
  it('R9: terminal → Baja', () => {
    expect(
      computeLeadPriority({
        lead: lead({ status: 'vendido', needsHumanHandoff: true }),
        openLeadCount: 5,
        now,
      }),
    ).toBe('Baja');
    expect(
      computeLeadPriority({
        lead: lead({ status: 'perdido' }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Baja');
    expect(
      computeLeadPriority({
        lead: lead({ status: 'cerrado' }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Baja');
  });

  it('R1: handoff + nuevo/asignado + sin firstResponse → Alta', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'nuevo',
          needsHumanHandoff: true,
          product: 'Batería',
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Alta');
    expect(
      computeLeadPriority({
        lead: lead({ status: 'asignado', needsHumanHandoff: true }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Alta');
  });

  it('R2: sla.breached o due vencido sin first touch → Alta', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'en_gestion',
          sla: { breached: true },
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Alta');

    expect(
      computeLeadPriority({
        lead: lead({
          status: 'asignado',
          needsHumanHandoff: false,
          sla: {
            firstResponseDueAt: new Date('2026-07-29T11:00:00.000Z'),
          },
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Alta');
  });

  it('R3: recontacto overdue → Alta', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'recontacto',
          recontact: {
            dueAt: new Date('2026-07-29T10:00:00.000Z'),
            attempts: 1,
          },
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Alta');
  });

  it('R4: openLeadCount >= 2 y lead abierto → Alta', () => {
    expect(
      computeLeadPriority({
        lead: lead({ status: 'cotizado', product: 'Rodamiento' }),
        openLeadCount: 2,
        now,
      }),
    ).toBe('Alta');
  });

  it('R5: handoff abierto no cubierto por R1 → Media', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'en_gestion',
          needsHumanHandoff: true,
          product: 'Rodamiento',
          sla: { firstResponseAt: now },
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Media');
  });

  it('R6: Batería en nuevo/asignado/en_gestion → Media (sin R1–R4)', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'nuevo',
          product: 'Batería',
          needsHumanHandoff: false,
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Media');
  });

  it('R7: snapshot outcome empty + abierto → Media (sin R1–R4)', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'cotizado',
          product: 'Rodamiento',
          recommendationSnapshot: {
            outcome: 'empty',
            query: {},
            options: [],
            summary: '',
          },
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Media');
  });

  it('R8: resto abiertos → Baja', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'cotizado',
          product: 'Rodamiento',
          needsHumanHandoff: false,
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Baja');
  });

  it('R1 gana sobre R6 (máximo nivel)', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'nuevo',
          product: 'Batería',
          needsHumanHandoff: true,
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Alta');
  });

  it('no usa firstResponseDueAt futuro como breach', () => {
    expect(
      computeLeadPriority({
        lead: lead({
          status: 'nuevo',
          product: 'Rodamiento',
          sla: {
            firstResponseDueAt: new Date('2026-07-29T13:00:00.000Z'),
          },
        }),
        openLeadCount: 1,
        now,
      }),
    ).toBe('Baja');
  });
});
