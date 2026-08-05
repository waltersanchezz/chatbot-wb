import type { WillardBatteryKnowledge } from '../../domain/ports/WillardBatteryKnowledge';
import { normalizeWillardText } from '../../domain/willard/normalize';
import type {
  VehicleCatalogIndex,
  VehicleCatalogModelEntry,
} from '../../domain/willard/vehicleInterpretation';

/**
 * Índice de solo lectura sobre aplicaciones utilizables del puerto Willard.
 * Se construye una vez en DI (o en tests con fake).
 */
export function buildVehicleCatalogIndex(
  knowledge: WillardBatteryKnowledge,
  brands: string[],
): VehicleCatalogIndex {
  const canonicalBrandByNorm = new Map<string, string>();
  const modelsByBrand = new Map<string, VehicleCatalogModelEntry[]>();

  for (const brand of brands) {
    const canonical = brand.trim();
    if (!canonical) continue;
    canonicalBrandByNorm.set(normalizeWillardText(canonical), canonical);

    const apps = knowledge.findApplicationsByVehicle({
      marca: canonical,
      limit: 500,
    });

    const seen = new Set<string>();
    const entries: VehicleCatalogModelEntry[] = [];
    for (const app of apps) {
      const key = `${app.modelo}||${app.textoCatalogo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({
        modelo: app.modelo,
        textoCatalogo: app.textoCatalogo,
      });
    }
    modelsByBrand.set(canonical, entries);
  }

  return { canonicalBrandByNorm, modelsByBrand };
}

/**
 * Construye el índice listando marcas vía búsquedas conocidas.
 * Para el adaptador de archivo, preferir `buildVehicleCatalogIndexFromHits`.
 */
export function buildVehicleCatalogIndexFromHits(
  hits: Array<{ marca: string; modelo: string; textoCatalogo: string }>,
): VehicleCatalogIndex {
  const canonicalBrandByNorm = new Map<string, string>();
  const modelsByBrand = new Map<string, VehicleCatalogModelEntry[]>();

  for (const hit of hits) {
    const brand = hit.marca.trim();
    if (!brand) continue;
    const bNorm = normalizeWillardText(brand);
    if (!canonicalBrandByNorm.has(bNorm)) {
      canonicalBrandByNorm.set(bNorm, brand);
    }
    const canonical = canonicalBrandByNorm.get(bNorm)!;
    const list = modelsByBrand.get(canonical) ?? [];
    const key = `${hit.modelo}||${hit.textoCatalogo}`;
    if (!list.some((e) => `${e.modelo}||${e.textoCatalogo}` === key)) {
      list.push({ modelo: hit.modelo, textoCatalogo: hit.textoCatalogo });
    }
    modelsByBrand.set(canonical, list);
  }

  return { canonicalBrandByNorm, modelsByBrand };
}
