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

/**
 * Quita la marca del inicio del texto de modelo si el usuario la repitió
 * ("Chevrolet Spark GT" con marca chevrolet → "Spark GT").
 */
export function stripLeadingBrandFromModel(
  modelText: string,
  brand?: string,
): string {
  const model = modelText.trim();
  if (!model || !brand?.trim()) return model;

  const brandTokens = tokenizeWillardModel(brand);
  if (brandTokens.length === 0) return model;

  const modelTokens = tokenizeWillardModel(model);
  if (modelTokens.length <= brandTokens.length) return model;

  const brandPrefix = brandTokens.every(
    (t, i) => modelTokens[i] === t,
  );
  if (!brandPrefix) return model;

  const rest = modelTokens.slice(brandTokens.length);
  return rest.length > 0 ? rest.join(' ') : model;
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

function isNumericToken(token: string): boolean {
  return /^\d+(\.\d+)?$/.test(token);
}

function isGluedAlnumToken(token: string): boolean {
  return /[a-z]/.test(token) && /\d/.test(token);
}

/** Distancia de edición (Levenshtein) acotada; suficiente para typos cortos. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = b.length + 1;
  const cols = a.length + 1;
  const prev = new Array<number>(cols);
  const cur = new Array<number>(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;

  for (let i = 1; i < rows; i += 1) {
    cur[0] = i;
    for (let j = 1; j < cols; j += 1) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j = 0; j < cols; j += 1) prev[j] = cur[j]!;
  }
  return prev[a.length]!;
}

function maxEditForLength(len: number): number {
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}

/**
 * Match suave entre tokens (typos / prefijos), sin abrir CX3↔CX30:
 * - numéricos y glued alfanuméricos: solo igualdad exacta
 * - letras: igualdad, prefijo (len≥3) o edit distance ≤1 (len≥3)
 */
export function softTokenMatch(queryToken: string, targetToken: string): boolean {
  if (queryToken === targetToken) return true;
  if (isNumericToken(queryToken) || isNumericToken(targetToken)) {
    return queryToken === targetToken;
  }
  if (isGluedAlnumToken(queryToken) || isGluedAlnumToken(targetToken)) {
    return queryToken === targetToken;
  }

  const minLen = Math.min(queryToken.length, targetToken.length);
  if (minLen >= 3) {
    if (
      targetToken.startsWith(queryToken) ||
      queryToken.startsWith(targetToken)
    ) {
      return true;
    }
    if (editDistance(queryToken, targetToken) <= 1) return true;
  }

  // Variantes cortas comunes: gt ↔ gti (sin abrir cx↔cx3)
  if (
    minLen >= 2 &&
    Math.max(queryToken.length, targetToken.length) <= 4 &&
    editDistance(queryToken, targetToken) <= 1
  ) {
    return true;
  }

  return false;
}

function tokensSoftSubset(
  queryTokens: string[],
  targetTokens: string[],
): boolean {
  if (queryTokens.length === 0) return false;
  return queryTokens.every((qt) =>
    targetTokens.some((tt) => softTokenMatch(qt, tt)),
  );
}

function anyVariantSoftSubset(
  variants: string[][],
  targetTokens: string[],
): boolean {
  return variants.some((tokens) => tokensSoftSubset(tokens, targetTokens));
}

function compactNearMatch(queryCompact: string, targetCompact: string): boolean {
  if (!queryCompact || !targetCompact) return false;
  if (queryCompact === targetCompact) return true;

  // Códigos glued (cx3/cx30/320i): nunca fuzzy a nivel compact.
  if (
    isGluedAlnumToken(queryCompact) ||
    isGluedAlnumToken(targetCompact) ||
    /^[a-z]+\d+$/i.test(queryCompact) ||
    /^[a-z]+\d+$/i.test(targetCompact)
  ) {
    return false;
  }

  // Prefijo estricto con distinta longitud (p.ej. mazda3 ⊂ mazda30) → no.
  if (
    queryCompact.length !== targetCompact.length &&
    (targetCompact.startsWith(queryCompact) ||
      queryCompact.startsWith(targetCompact))
  ) {
    return false;
  }

  const maxLen = Math.max(queryCompact.length, targetCompact.length);
  const allowed = maxEditForLength(maxLen);
  if (allowed <= 0) return false;
  return editDistance(queryCompact, targetCompact) <= allowed;
}

/**
 * Puntúa coincidencia de modelo (mayor = mejor). `null` = sin match.
 *
 * - 4: igualdad normalize o compact en modelo
 * - 3: igualdad normalize o compact en textoCatalogo
 * - 2: tokens exactos ⊆ modelo, soft-tokens ⊆ modelo, o compact cerca en modelo
 * - 1: tokens exactos ⊆ texto, soft-tokens ⊆ texto, o compact cerca en texto
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

    if (
      anyVariantSubset(variants, modeloTokens) ||
      anyVariantSoftSubset(variants, modeloTokens) ||
      compactNearMatch(qCompact, modeloCompact)
    ) {
      score = 2;
    } else if (
      anyVariantSubset(variants, textoTokens) ||
      anyVariantSoftSubset(variants, textoTokens) ||
      compactNearMatch(qCompact, textoCompact)
    ) {
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
