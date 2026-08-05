import type { UserRole } from '../api/authApi'

/** Etiquetas de operación diaria (Administrador / Operador). */
export function roleLabel(role: UserRole | undefined): string {
  if (role === 'ADMIN') return 'Administrador'
  if (role === 'ASESOR' || role === 'LECTURA') return 'Operador'
  return 'Operador'
}

/** Configuración de empresa: solo Administrador. */
export function canAccessSettings(role: UserRole | undefined): boolean {
  return role === 'ADMIN'
}

/** Mutaciones de configuración (UI): solo Administrador. */
export function canEditSettings(role: UserRole | undefined): boolean {
  return role === 'ADMIN'
}

export function canAccessNavItem(
  role: UserRole | undefined,
  requiresAdmin?: boolean,
): boolean {
  if (!requiresAdmin) return true
  return canAccessSettings(role)
}
