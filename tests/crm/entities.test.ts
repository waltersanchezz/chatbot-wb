import { describe, expect, it } from 'vitest';
import {
  canTransitionLeadStatus,
  assertValidLeadStatusTransition,
  isLeadStatus,
  isTerminalLeadStatus,
  LEAD_STATUSES,
  OPEN_LEAD_STATUSES,
} from '../../src/domain/crm/leadStatuses';
import {
  assertValidLeadPriority,
  assertValidPhone,
  validateLeadPriority,
  validateLeadSource,
  validatePhone,
} from '../../src/domain/crm/validations';
import { createEmptyCustomerProfile } from '../../src/domain/entities/CustomerProfile';
import type { Customer } from '../../src/domain/entities/Customer';
import {
  INTERACTION_TYPES,
  isInteractionType,
  sortInteractionsChronological,
  type Interaction,
} from '../../src/domain/entities/Interaction';
import {
  isLeadEventType,
  LEAD_EVENT_TYPES,
} from '../../src/domain/entities/LeadEvent';
import type { Lead, LeadStatus } from '../../src/domain/entities/Lead';

describe('CRM domain — LeadStatus', () => {
  it('incluye estados legacy y nuevos del CRM_SPEC', () => {
    const expected: LeadStatus[] = [
      'nuevo',
      'asignado',
      'en_gestion',
      'cotizado',
      'recontacto',
      'vendido',
      'perdido',
      'cerrado',
    ];
    expect([...LEAD_STATUSES]).toEqual(expected);
    for (const s of expected) {
      expect(isLeadStatus(s)).toBe(true);
    }
    expect(isLeadStatus('spam')).toBe(false);
  });

  it('marca terminales y abiertos', () => {
    expect(isTerminalLeadStatus('vendido')).toBe(true);
    expect(isTerminalLeadStatus('perdido')).toBe(true);
    expect(isTerminalLeadStatus('cerrado')).toBe(true);
    expect(isTerminalLeadStatus('nuevo')).toBe(false);
    expect(OPEN_LEAD_STATUSES).toContain('recontacto');
  });

  it('permite atajos legacy desde nuevo', () => {
    expect(canTransitionLeadStatus('nuevo', 'cotizado')).toBe(true);
    expect(canTransitionLeadStatus('nuevo', 'vendido')).toBe(true);
    expect(canTransitionLeadStatus('nuevo', 'perdido')).toBe(true);
  });

  it('permite transiciones del pipeline CRM', () => {
    expect(canTransitionLeadStatus('nuevo', 'asignado')).toBe(true);
    expect(canTransitionLeadStatus('asignado', 'en_gestion')).toBe(true);
    expect(canTransitionLeadStatus('en_gestion', 'cotizado')).toBe(true);
    expect(canTransitionLeadStatus('cotizado', 'recontacto')).toBe(true);
    expect(canTransitionLeadStatus('recontacto', 'en_gestion')).toBe(true);
  });

  it('rechaza transiciones ilegales y same-status es no-op válido', () => {
    expect(canTransitionLeadStatus('vendido', 'nuevo')).toBe(false);
    expect(canTransitionLeadStatus('cerrado', 'en_gestion')).toBe(false);
    expect(canTransitionLeadStatus('nuevo', 'nuevo')).toBe(true);
    expect(() => assertValidLeadStatusTransition('perdido', 'cotizado')).toThrow(
      /inválida/,
    );
    expect(() => assertValidLeadStatusTransition('nuevo', 'asignado')).not.toThrow();
  });
});

describe('CRM domain — LeadPriority / phone', () => {
  it('validateLeadPriority acepta Alta|Media|Baja y rechaza otros', () => {
    expect(validateLeadPriority('Alta')).toBe(true);
    expect(validateLeadPriority('Media')).toBe(true);
    expect(validateLeadPriority('Baja')).toBe(true);
    expect(validateLeadPriority('alta')).toBe(false);
    expect(validateLeadPriority('High')).toBe(false);
    expect(validateLeadPriority('')).toBe(false);
    expect(validateLeadPriority(null)).toBe(false);
    expect(() => assertValidLeadPriority('Media')).not.toThrow();
    expect(() => assertValidLeadPriority('urgent')).toThrow(/LeadPriority/);
  });

  it('validatePhone exige string no vacío', () => {
    expect(validatePhone('573001234567')).toBe(true);
    expect(validatePhone('  57  ')).toBe(true);
    expect(validatePhone('')).toBe(false);
    expect(validatePhone('   ')).toBe(false);
    expect(validatePhone(undefined)).toBe(false);
    expect(() => assertValidPhone('')).toThrow(/phone/);
  });

  it('validateLeadSource allowlist', () => {
    expect(validateLeadSource('whatsapp_flow')).toBe(true);
    expect(validateLeadSource('api_test')).toBe(true);
    expect(validateLeadSource('email')).toBe(false);
  });
});

describe('CRM domain — CustomerProfile', () => {
  it('createEmptyCustomerProfile arma agregado vacío desde Customer', () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    const customer: Customer = {
      id: 'cust-1',
      phone: '573001112233',
      name: 'Ana',
      channel: 'whatsapp',
      createdAt: now,
      updatedAt: now,
    };

    const profile = createEmptyCustomerProfile(customer);

    expect(profile).toMatchObject({
      customerId: 'cust-1',
      phone: '573001112233',
      name: 'Ana',
      channel: 'whatsapp',
      openLeadCount: 0,
      tags: [],
      leads: [],
      vehicles: [],
      interactions: [],
    });
    expect(profile.createdAt).toBe(now);
    expect(profile.updatedAt).toBe(now);
    expect(profile.lastInteractionAt).toBeUndefined();
  });
});

describe('CRM domain — Interaction', () => {
  it('isInteractionType respeta allowlist', () => {
    expect(INTERACTION_TYPES).toContain('conversation.message_in');
    expect(INTERACTION_TYPES).toContain('advisor.manual');
    expect(isInteractionType('lead.created')).toBe(true);
    expect(isInteractionType('lead.sla_breached')).toBe(false);
  });

  it('sortInteractionsChronological ordena por at luego id', () => {
    const base = {
      customerId: 'c1',
      type: 'advisor.manual' as const,
      channel: 'whatsapp' as const,
      summary: 'x',
      actor: 'system' as const,
    };
    const t1 = new Date('2026-07-29T10:00:00.000Z');
    const t2 = new Date('2026-07-29T11:00:00.000Z');
    const items: Interaction[] = [
      { ...base, id: 'b', at: t2 },
      { ...base, id: 'a', at: t1 },
      { ...base, id: 'c', at: t1 },
    ];

    expect(sortInteractionsChronological(items, 'asc').map((i) => i.id)).toEqual([
      'a',
      'c',
      'b',
    ]);
    expect(sortInteractionsChronological(items, 'desc').map((i) => i.id)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });
});

describe('CRM domain — LeadEvent', () => {
  it('allowlist de tipos del CRM_SPEC §9', () => {
    expect(LEAD_EVENT_TYPES).toEqual([
      'lead.created',
      'lead.updated',
      'lead.status_changed',
      'lead.priority_changed',
      'lead.assigned',
      'lead.reassigned',
      'lead.first_touch',
      'lead.recontact_scheduled',
      'lead.recontact_done',
      'lead.note_added',
      'lead.telegram_notified',
      'lead.telegram_failed',
      'lead.sla_breached',
    ]);
    expect(isLeadEventType('lead.created')).toBe(true);
    expect(isLeadEventType('lead.handoff')).toBe(false);
  });
});

describe('CRM domain — Lead backward compat shape', () => {
  it('acepta Lead mínimo legacy (sin campos ★)', () => {
    const legacy: Lead = {
      id: 'lead-1',
      createdAt: new Date(),
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'CHEVROLET',
      vehicleModel: 'Spark',
      year: '2018',
      optionLabel: 'Planta de sonido',
      optionValue: false,
      recommendation: '75D23L',
      status: 'nuevo',
      conversationId: 'conv-1',
      customerId: 'cust-1',
    };
    expect(legacy.priority).toBeUndefined();
    expect(legacy.needsHumanHandoff).toBeUndefined();
    expect(legacy.status).toBe('nuevo');
  });

  it('acepta Lead enriquecido CRM', () => {
    const enriched: Lead = {
      id: 'lead-2',
      createdAt: new Date(),
      updatedAt: new Date(),
      phone: '57300',
      product: 'Batería',
      vehicleBrand: 'FORD',
      vehicleModel: 'Ranger',
      year: '2020',
      optionLabel: 'Planta de sonido',
      optionValue: null,
      recommendation: 'Pendiente',
      status: 'asignado',
      conversationId: 'conv-2',
      customerId: 'cust-2',
      channel: 'whatsapp',
      source: 'whatsapp_handoff',
      priority: 'Alta',
      needsHumanHandoff: true,
      recommendationSnapshot: {
        outcome: 'empty',
        query: { marca: 'FORD', modelo: 'Ranger' },
        options: [],
        summary: 'Sin match',
      },
    };
    expect(enriched.priority).toBe('Alta');
    expect(enriched.status).toBe('asignado');
  });
});
