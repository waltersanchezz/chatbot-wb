/**
 * Números en español → dígitos (MVP: 1–30 + años comunes).
 * Puro dominio; sin I/O.
 */

const UNIT: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  dieciséis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintidós: 22,
  veintitres: 23,
  veintitrés: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintiséis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
};

const TENS: Record<string, number> = {
  veinte: 20,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Reemplaza palabras numéricas en un texto por dígitos.
 * Ej: "mazda tres" → "mazda 3", "año dos mil dieciocho" → maneja años aparte.
 */
export function replaceNumberWordsInText(text: string): string {
  const tokens = text.split(/(\s+)/);
  return tokens
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      const key = stripDiacritics(token.toLowerCase());
      if (key in UNIT) return String(UNIT[key]);
      return token;
    })
    .join('');
}

/**
 * Intenta extraer un año 19xx/20xx desde dígitos o frases tipo
 * "dos mil dieciocho", "veinte dieciocho".
 */
export function extractYearFromSpeech(text: string): string | undefined {
  const digit = text.match(/\b((?:19|20)\d{2})\b/);
  if (digit) return digit[1];

  const lower = stripDiacritics(text.toLowerCase());

  // dos mil XX / dos mil X
  const dosMil = lower.match(
    /\bdos\s+mil\s+(veinti(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)|dieci(?:seis|siete|ocho|nueve)|veinte|treinta|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|\d{1,2})\b/,
  );
  if (dosMil) {
    const tail = dosMil[1]!;
    if (/^\d+$/.test(tail)) {
      const n = Number(tail);
      if (n >= 0 && n <= 99) return String(2000 + n);
    }
    const unit = UNIT[tail];
    if (unit != null && unit <= 99) return String(2000 + unit);
  }

  // veinte XX (2010–2029 spoken as "veinte dieciocho")
  const veinte = lower.match(
    /\bveinte\s+(dieci(?:seis|siete|ocho|nueve)|veinti(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/,
  );
  if (veinte) {
    const unit = UNIT[veinte[1]!];
    if (unit != null && unit <= 99) return String(2000 + unit);
  }

  return undefined;
}

/** Convierte un solo token numérico en español a número, o null. */
export function numberWordToInt(token: string): number | null {
  const key = stripDiacritics(token.toLowerCase().trim());
  if (key in UNIT) return UNIT[key]!;
  if (key in TENS) return TENS[key]!;
  return null;
}
