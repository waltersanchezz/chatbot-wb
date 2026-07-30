import { normalizeWillardText } from './normalize';

/**
 * Tokeniza un modelo Willard para matching por tokens enteros.
 * Conserva alfanuméricos pegados (`cx3`, `320i`) y decimales (`2.3`).
 */
export function tokenizeWillardModel(value: string): string[] {
  const prepared = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const tokens: string[] = [];
  const re = /(\d+\.\d+)|([a-z0-9]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(prepared)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

/** Forma compacta: tokens unidos sin espacios (preserva decimales). */
export function compactWillardModel(value: string): string {
  return tokenizeWillardModel(value).join('');
}

function tokensSubset(queryTokens: string[], targetTokens: string[]): boolean {
  if (queryTokens.length === 0) return false;
  const target = new Set(targetTokens);
  return queryTokens.every((t) => target.has(t));
}

/**
 * Variantes de tokenización de la query.
 * Un token pegado letras+dígitos (`mazda3`) también se prueba como [marca, dígitos].
 */
function queryTokenVariants(queryModelo: string): string[][] {
  const base = tokenizeWillardModel(queryModelo);
  const variants: string[][] = [base];
  if (base.length === 1) {
    const glued = base[0].match(/^([a-z]+)(\d{1,4})$/);
    if (glued) {
      variants.push([glued[1], glued[2]]);
    }
  }
  return variants;
}

function anyVariantSubset(variants: string[][], targetTokens: string[]): boolean {
  return variants.some((tokens) => tokensSubset(tokens, targetTokens));
}

/**
 * Puntúa coincidencia de modelo (mayor = mejor). `null` = sin match.
 *
 * - 4: igualdad normalize o compact en modelo
 * - 3: igualdad normalize o compact en textoCatalogo
 * - 2: todos los tokens de query ⊆ tokens de modelo (enteros; con variantes glued)
 * - 1: todos los tokens de query ⊆ tokens de texto solamente
 *
 * Queries numéricas cortas (`/^\d{1,2}$/`) exigen score ≥ 2.
 * Nunca usa includes de caracteres (`"3"` dentro de `"cx3"`).
 */
export function scoreWillardModelMatch(
  queryModelo: string,
  appModelo: string,
  appTextoCatalogo: string,
): number | null {
  const q = queryModelo.trim();
  if (!q) return null;

  const qNorm = normalizeWillardText(q);
  const qCompact = compactWillardModel(q);
  if (!qNorm && !qCompact) return null;

  const modeloNorm = normalizeWillardText(appModelo);
  const modeloCompact = compactWillardModel(appModelo);
  const textoNorm = normalizeWillardText(appTextoCatalogo);
  const textoCompact = compactWillardModel(appTextoCatalogo);

  let score: number | null = null;

  if (
    (qNorm && modeloNorm === qNorm) ||
    (qCompact && modeloCompact === qCompact)
  ) {
    score = 4;
  } else if (
    (qNorm && textoNorm === qNorm) ||
    (qCompact && textoCompact === qCompact)
  ) {
    score = 3;
  } else {
    const variants = queryTokenVariants(q);
    const modeloTokens = tokenizeWillardModel(appModelo);
    const textoTokens = tokenizeWillardModel(appTextoCatalogo);

    if (anyVariantSubset(variants, modeloTokens)) {
      score = 2;
    } else if (anyVariantSubset(variants, textoTokens)) {
      score = 1;
    }
  }

  if (score == null) return null;

  // Numérico corto: solo cuenta si pegó en modelo (score ≥ 2), no solo en texto.
  if (/^\d{1,2}$/.test(qNorm) && score < 2) {
    return null;
  }

  return score;
}
