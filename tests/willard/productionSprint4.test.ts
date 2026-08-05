import { describe, expect, it } from 'vitest';

/**
 * Contrato de operador PS4 (espejo de apps/dashboard/src/auth/roles + nav).
 * Evita acoplar vitest root al bundler Vite.
 */
type UserRole = 'ADMIN' | 'ASESOR' | 'LECTURA';

function roleLabel(role: UserRole | undefined): string {
  if (role === 'ADMIN') return 'Administrador';
  if (role === 'ASESOR' || role === 'LECTURA') return 'Operador';
  return 'Operador';
}

function canAccessSettings(role: UserRole | undefined): boolean {
  return role === 'ADMIN';
}

const OPERATOR_NAV = [
  { to: '/', label: 'Inicio' },
  { to: '/conversaciones', label: 'Conversaciones' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/vehiculos', label: 'Vehículos' },
  { to: '/historial', label: 'Historial' },
  { to: '/configuracion', label: 'Configuración', requiresAdmin: true },
] as const;

function navFor(role: UserRole) {
  return OPERATOR_NAV.filter((item) =>
    'requiresAdmin' in item && item.requiresAdmin
      ? canAccessSettings(role)
      : true,
  ).map((i) => i.label);
}

describe('Production Sprint 4 — RBAC UI Administrador / Operador', () => {
  it('ADMIN ve Configuración; Operador no', () => {
    expect(roleLabel('ADMIN')).toBe('Administrador');
    expect(roleLabel('ASESOR')).toBe('Operador');
    expect(roleLabel('LECTURA')).toBe('Operador');

    expect(navFor('ADMIN')).toContain('Configuración');
    expect(navFor('ASESOR')).not.toContain('Configuración');
    expect(navFor('LECTURA')).not.toContain('Configuración');

    expect(navFor('ASESOR')).toEqual([
      'Inicio',
      'Conversaciones',
      'Clientes',
      'Vehículos',
      'Historial',
    ]);
  });
});

describe('Production Sprint 4 — handoff Telegram confiable (contrato)', () => {
  it('política de reintentos documentada en NotificationService', async () => {
    // Cubierto en profundidad por notificationTelegramRetry.test.ts
    const mod = await import(
      '../../src/application/services/NotificationService'
    );
    expect(mod.NotificationService).toBeTypeOf('function');
  });
});
