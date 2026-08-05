import { normalizeWillardText } from '../../domain/willard/normalize';

/**
 * Alias de marca → forma canónica preferida en catálogo Willard.
 * No muta el JSON; solo ayuda a interpretar habla del cliente.
 *
 * Si el catálogo tiene dos grafías (CHANA/CHANGAN), el alias apunta a la
 * forma más usada en Colombia / la que el índice resuelva primero.
 */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  vw: 'VOLKSWAGEN',
  volkswagen: 'VOLKSWAGEN',
  'volks wagen': 'VOLKSWAGEN',
  mercedes: 'MERCEDES BENZ',
  'mercedes benz': 'MERCEDES BENZ',
  'mercedes-benz': 'MERCEDES BENZ',
  mb: 'MERCEDES BENZ',
  chevy: 'CHEVROLET',
  chevrolet: 'CHEVROLET',
  chevrole: 'CHEVROLET',
  changan: 'CHANGAN',
  chana: 'CHANA',
  chery: 'CHERY',
  cherry: 'CHERRY',
  citroën: 'CITROEN',
  citroen: 'CITROEN',
  'ssang yong': 'SSANG YONG',
  ssangyong: 'SSANG YONG',
  'land rover': 'LAND ROVER',
  landrover: 'LAND ROVER',
  'great wall': 'GREAT WALL',
  greatwall: 'GREAT WALL',
  'dong feng': 'DONG FENG',
  dongfeng: 'DONG FENG',
  'alfa romeo': 'ALFA ROMEO',
  alfaromeo: 'ALFA ROMEO',
  bmw: 'BMW',
  mazda: 'MAZDA',
  kia: 'KIA',
  hyundai: 'HYUNDAI',
  toyota: 'TOYOTA',
  nissan: 'NISSAN',
  renault: 'RENAULT',
  ford: 'FORD',
  fiat: 'FIAT',
  honda: 'HONDA',
  suzuki: 'SUZUKI',
  mitsubishi: 'MITSUBISHI',
  peugeot: 'PEUGEOT',
  audi: 'AUDI',
  jeep: 'JEEP',
  subaru: 'SUBARU',
  volvo: 'VOLVO',
  byd: 'BYD',
};

/**
 * Resuelve un fragmento de texto a marca canónica del catálogo.
 * Prioridad: alias → match exacto normalize contra marcas del índice.
 */
export function resolveBrandAlias(
  fragment: string,
  catalogCanonicalByNorm: Map<string, string>,
): string | undefined {
  const norm = normalizeWillardText(fragment);
  if (!norm) return undefined;

  const fromAlias = ALIAS_TO_CANONICAL[norm];
  if (fromAlias) {
    const aliasNorm = normalizeWillardText(fromAlias);
    const inCatalog = catalogCanonicalByNorm.get(aliasNorm);
    if (inCatalog) return inCatalog;
    // Alias apunta a marca que existe con otra grafía cercana
    for (const [cNorm, canonical] of catalogCanonicalByNorm) {
      if (cNorm === aliasNorm || cNorm.startsWith(aliasNorm) || aliasNorm.startsWith(cNorm)) {
        return canonical;
      }
    }
  }

  const exact = catalogCanonicalByNorm.get(norm);
  if (exact) return exact;

  // Prefijo de marca multi-palabra: "mercedes benz clase c" → probar tokens acumulados
  const tokens = norm.split(' ').filter(Boolean);
  for (let len = Math.min(tokens.length, 3); len >= 1; len -= 1) {
    const slice = tokens.slice(0, len).join(' ');
    const aliased = ALIAS_TO_CANONICAL[slice];
    if (aliased) {
      const hit = catalogCanonicalByNorm.get(normalizeWillardText(aliased));
      if (hit) return hit;
    }
    const hit = catalogCanonicalByNorm.get(slice);
    if (hit) return hit;
  }

  return undefined;
}

export function listBrandAliases(): Readonly<Record<string, string>> {
  return ALIAS_TO_CANONICAL;
}
