/**
 * Detector de preguntas técnicas (Smart Advisor).
 * No es un motor: solo clasifica si el mensaje debe ir al KnowledgeEngine.
 */

const AFFIRM_NEGATE = /^(si|sí|sip|sep|ok|okay|dale|no|nop)$/i;

export function isTechnicalQuestion(text: string): boolean {
  const t = text.trim();
  if (!t || AFFIRM_NEGATE.test(t)) return false;
  if (/^\d{4}$/.test(t)) return false;

  // "¿Por qué?" / "porque" solos (usan última recomendación).
  // No usar `\b` tras tildes: en JS `\w` no incluye áéíóú.
  if (/^¿?\s*por\s*qu[eé]\s*\??$/i.test(t) || /^porque\s*\??$/i.test(t)) {
    return true;
  }

  const patterns: RegExp[] = [
    /por\s*qu[eé]/i,
    /qu[eé]\s+significa/i,
    /qu[eé]\s+es\s+(el\s+|la\s+)?(cca|ah|una\s+bater)/i,
    /cu[aá]l\s+dura/i,
    /qu[eé]\s+diferencia/i,
    /diferencia\s+hay/i,
    /diferencias?/i,
    /\bvs\.?\b/i,
    /\bversus\b/i,
    /hay\s+otra\s+opci/i,
    /otra\s+(opci[oó]n|referencia|bater)/i,
    /alternativa/i,
    /equivalente/i,
    /no\s+tengo/i,
    /qu[eé]\s+pasa\s+si\s+instalo/i,
    /bater[ií]a\s+(mayor|menor)/i,
    /le\s+sirve/i,
    /es\s+compatible/i,
    /compatibilidad/i,
    /libre\s+(de\s+)?mantenimiento/i,
    /\bcca\b/i,
    /(^|\s)ah(\s|\?|$)/i,
  ];

  return patterns.some((p) => p.test(t));
}

/** Extrae literales que parecen referencia Willard (con dígitos). */
export function extractTechnicalReferences(text: string): string[] {
  const matches = text.match(/\b[A-Za-z]{0,4}-?\d{2,5}[A-Za-z0-9-]*\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const key = m.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

export function referencesFromProductIds(ids: string[] | undefined): string[] {
  if (!ids?.length) return [];
  const out: string[] = [];
  for (const id of ids) {
    const m = id.match(/^willard:(.+)$/i);
    if (m?.[1]) out.push(m[1]);
  }
  return out;
}
