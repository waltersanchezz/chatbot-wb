/**
 * Extracción y evaluación de años / rangos desde literales del catálogo Willard.
 * Puro dominio: sin I/O.
 *
 * Formatos soportados (en version o textoCatalogo):
 * - `2006-2012`
 * - `2017+` / `2016>`
 * - `<2015`
 * - año suelto `2013`
 * - lista `1999, 2005`
 */

export type YearConstraint =
  | { kind: 'exact'; year: number }
  | { kind: 'range'; from: number; to: number }
  | { kind: 'from'; year: number }
  | { kind: 'until'; year: number };

const YEAR = /(?:19|20)\d{2}/g;

/** Extrae constraints de un fragmento de texto de catálogo. */
export function parseYearConstraints(text: string | null | undefined): YearConstraint[] {
  if (!text?.trim()) return [];
  const raw = text.trim();
  const constraints: YearConstraint[] = [];
  const seen = new Set<string>();

  const push = (c: YearConstraint) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return;
    seen.add(key);
    constraints.push(c);
  };

  // 2006-2012 / 2006 – 2012
  for (const m of raw.matchAll(/\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2})\b/g)) {
    const from = Number(m[1]);
    const to = Number(m[2]);
    if (from <= to) push({ kind: 'range', from, to });
    else push({ kind: 'range', from: to, to: from });
  }

  // 2017+ / 2016>
  for (const m of raw.matchAll(/\b((?:19|20)\d{2})\s*[+>]\b/g)) {
    push({ kind: 'from', year: Number(m[1]) });
  }

  // <2015
  for (const m of raw.matchAll(/<\s*((?:19|20)\d{2})\b/g)) {
    push({ kind: 'until', year: Number(m[1]) });
  }

  // Lista o años sueltos (si no fueron parte de rango/from/until ya capturados
  // de forma exclusiva — añadimos exactos que aparezcan).
  const years = raw.match(YEAR) ?? [];
  for (const y of years) {
    push({ kind: 'exact', year: Number(y) });
  }

  return constraints;
}

export function yearSatisfiesConstraint(
  year: number,
  constraint: YearConstraint,
): boolean {
  switch (constraint.kind) {
    case 'exact':
      return year === constraint.year;
    case 'range':
      return year >= constraint.from && year <= constraint.to;
    case 'from':
      return year >= constraint.year;
    case 'until':
      return year < constraint.year;
    default:
      return false;
  }
}

/**
 * ¿El año del vehículo encaja con los literales de catálogo?
 * - Sin constraints en el texto → compatible (catálogo sin dato de año).
 * - Con constraints → basta con que uno se cumpla.
 */
export function yearMatchesCatalogText(
  vehicleYear: string | number | undefined,
  ...catalogTexts: Array<string | null | undefined>
): { matches: boolean; usedRange: boolean } {
  if (vehicleYear == null || String(vehicleYear).trim() === '') {
    return { matches: true, usedRange: false };
  }
  const year = Number(String(vehicleYear).trim());
  if (!Number.isFinite(year) || year < 1900 || year > 2100) {
    return { matches: true, usedRange: false };
  }

  const constraints = catalogTexts.flatMap((t) => parseYearConstraints(t));
  if (constraints.length === 0) {
    return { matches: true, usedRange: false };
  }

  const matches = constraints.some((c) => yearSatisfiesConstraint(year, c));
  const usedRange = constraints.some(
    (c) => c.kind === 'range' || c.kind === 'from' || c.kind === 'until',
  );
  return { matches, usedRange };
}
