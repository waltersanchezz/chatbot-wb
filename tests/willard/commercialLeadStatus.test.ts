import { describe, expect, it } from 'vitest';
import {
  commercialStatusToLeadStatus,
  leadStatusPatchPath,
  leadStatusToCommercial,
  phonesMatch,
  pickLeadForPhone,
} from '../../apps/dashboard/src/lib/commercialLeadStatus';

describe('commercialLeadStatus (PASO 4)', () => {
  it('mapea etiquetas visibles a LeadStatus de LeadService', () => {
    expect(commercialStatusToLeadStatus('Nuevo')).toBe('nuevo');
    expect(commercialStatusToLeadStatus('Contactado')).toBe('en_gestion');
    expect(commercialStatusToLeadStatus('Cotizado')).toBe('cotizado');
    expect(commercialStatusToLeadStatus('Vendido')).toBe('vendido');
    expect(commercialStatusToLeadStatus('No interesado')).toBe('perdido');
  });

  it('lee estados internos hacia etiquetas comerciales', () => {
    expect(leadStatusToCommercial('nuevo')).toBe('Nuevo');
    expect(leadStatusToCommercial('asignado')).toBe('Contactado');
    expect(leadStatusToCommercial('en_gestion')).toBe('Contactado');
    expect(leadStatusToCommercial('recontacto')).toBe('Contactado');
    expect(leadStatusToCommercial('cotizado')).toBe('Cotizado');
    expect(leadStatusToCommercial('vendido')).toBe('Vendido');
    expect(leadStatusToCommercial('perdido')).toBe('No interesado');
    expect(leadStatusToCommercial('cerrado')).toBe('No interesado');
  });

  it('usa en_gestion intermedio desde asignado hacia cotizado/vendido', () => {
    expect(leadStatusPatchPath('asignado', 'Cotizado')).toEqual([
      'en_gestion',
      'cotizado',
    ]);
    expect(leadStatusPatchPath('asignado', 'Vendido')).toEqual([
      'en_gestion',
      'vendido',
    ]);
    expect(leadStatusPatchPath('nuevo', 'Contactado')).toEqual(['en_gestion']);
    expect(leadStatusPatchPath('nuevo', 'Cotizado')).toEqual(['cotizado']);
    expect(leadStatusPatchPath('en_gestion', 'Contactado')).toEqual([]);
  });

  it('empareja teléfono de lead con waId del cliente', () => {
    expect(phonesMatch('wa:+573001112233', '573001112233')).toBe(true);
    expect(phonesMatch('+57 300 111 2233', '573001112233')).toBe(true);
  });

  it('empareja waId whatsapp: de conversación con teléfono de lead', () => {
    expect(phonesMatch('whatsapp:573142766279', '573142766279')).toBe(true);
    const lead = pickLeadForPhone(
      [
        {
          phone: '573142766279',
          status: 'nuevo',
          updatedAt: '2026-08-07T12:00:00.000Z',
        },
      ],
      'whatsapp:573142766279',
    );
    expect(lead?.status).toBe('nuevo');
  });
});
