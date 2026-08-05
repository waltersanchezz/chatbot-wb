import { normalizeWillardText } from '../../domain/willard/normalize';

/**
 * Alias de modelo (o modelo+versión corta) → marca + query de modelo.
 * Usado cuando el cliente escribe solo el modelo ("logan", "spark gt").
 */
export interface VehicleModelAlias {
  /** Marca canónica preferida (se resuelve contra el índice). */
  brand: string;
  /** Texto de modelo a puntuar contra el catálogo. */
  modelQuery: string;
}

const MODEL_ALIASES: Record<string, VehicleModelAlias> = {
  logan: { brand: 'RENAULT', modelQuery: 'Logan' },
  symbol: { brand: 'RENAULT', modelQuery: 'Symbol' },
  sandero: { brand: 'RENAULT', modelQuery: 'Sandero' },
  duster: { brand: 'RENAULT', modelQuery: 'Duster' },
  kwid: { brand: 'RENAULT', modelQuery: 'Kwid' },
  twingo: { brand: 'RENAULT', modelQuery: 'Twingo' },
  clio: { brand: 'RENAULT', modelQuery: 'Clio' },
  spark: { brand: 'CHEVROLET', modelQuery: 'Spark' },
  'spark gt': { brand: 'CHEVROLET', modelQuery: 'Spark GT' },
  'spark gti': { brand: 'CHEVROLET', modelQuery: 'Spark GTI' },
  sail: { brand: 'CHEVROLET', modelQuery: 'Sail' },
  aveo: { brand: 'CHEVROLET', modelQuery: 'Aveo' },
  onix: { brand: 'CHEVROLET', modelQuery: 'Onix' },
  tracker: { brand: 'CHEVROLET', modelQuery: 'Tracker' },
  picanto: { brand: 'KIA', modelQuery: 'Picanto' },
  rio: { brand: 'KIA', modelQuery: 'Rio' },
  sportage: { brand: 'KIA', modelQuery: 'Sportage' },
  accent: { brand: 'HYUNDAI', modelQuery: 'Accent' },
  tucson: { brand: 'HYUNDAI', modelQuery: 'Tucson' },
  corolla: { brand: 'TOYOTA', modelQuery: 'Corolla' },
  hilux: { brand: 'TOYOTA', modelQuery: 'Hilux' },
  march: { brand: 'NISSAN', modelQuery: 'March' },
  versa: { brand: 'NISSAN', modelQuery: 'Versa' },
  sentra: { brand: 'NISSAN', modelQuery: 'Sentra' },
};

/**
 * Resuelve alias de modelo en el texto (match exacto normalize o como frase completa).
 */
export function resolveModelAlias(fragment: string): VehicleModelAlias | undefined {
  const norm = normalizeWillardText(fragment);
  if (!norm) return undefined;

  const exact = MODEL_ALIASES[norm];
  if (exact) return exact;

  // Prefijo más largo primero (spark gt antes que spark)
  const keys = Object.keys(MODEL_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm === key || norm.startsWith(`${key} `) || norm.endsWith(` ${key}`)) {
      return MODEL_ALIASES[key];
    }
  }

  return undefined;
}

export function listModelAliases(): Readonly<Record<string, VehicleModelAlias>> {
  return MODEL_ALIASES;
}
