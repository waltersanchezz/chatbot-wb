import { describe, expect, it } from 'vitest';
import { buildWhatsAppLink } from '../../apps/dashboard/src/api/conversationsApi';
import {
  isTechnicalPhoneId,
  phoneDigits,
} from '../../apps/dashboard/src/lib/operatorDisplay';

describe('Abrir WhatsApp (buildWhatsAppLink)', () => {
  it('abre wa.me con waId whatsapp: de producción', () => {
    expect(buildWhatsAppLink('whatsapp:573142766279')).toBe(
      'https://wa.me/573142766279',
    );
  });

  it('abre wa.me con prefijo wa: y signos', () => {
    expect(buildWhatsAppLink('wa:+57 300 999 1111')).toBe(
      'https://wa.me/573009991111',
    );
  });

  it('no inventa enlace si el id es técnico o corto', () => {
    expect(buildWhatsAppLink('wa:prod')).toBe('#');
    expect(buildWhatsAppLink('123')).toBe('#');
    expect(isTechnicalPhoneId('whatsapp:wa:prod')).toBe(true);
    expect(phoneDigits('whatsapp:573001112233')).toBe('573001112233');
  });
});
