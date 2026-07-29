/**
 * Normalización compartida para matching de catálogo (spec §5.1).
 * Función pura de dominio: sin I/O.
 */
export function normalizeWillardText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normaliza espacios extremos de una referencia; no altera guiones ni `(2)`. */
export function normalizeReferenceLiteral(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
