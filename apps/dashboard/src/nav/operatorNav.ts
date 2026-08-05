/**
 * Navegación del operador (PS3 + RBAC UI PS4).
 * Solo módulos de producción — SaaS/Beta fuera del menú.
 */
export const OPERATOR_NAV = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/conversaciones', label: 'Conversaciones' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/vehiculos', label: 'Vehículos' },
  { to: '/historial', label: 'Historial' },
  {
    to: '/configuracion',
    label: 'Configuración',
    requiresAdmin: true,
  },
] as const

export type OperatorNavItem = (typeof OPERATOR_NAV)[number]
