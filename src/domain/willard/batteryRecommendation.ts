/**
 * Contratos del Módulo 3 – Battery Recommendation Engine.
 * Independiente del flujo conversacional.
 */

export type BatteryMatchKind = 'exact' | 'year_range' | 'similar' | 'none';

export interface BatteryRecommendationQuery {
  marca: string;
  modelo: string;
  year?: string;
  /** Preferencia comercial; no inventa filas en el catálogo. */
  soundSystem?: boolean;
  limit?: number;
}

/** Opción recomendada al asesor / canal (sin precio ni stock). */
export interface BatteryRecommendationItem {
  reference: string;
  /** CCA a 18 °C del catálogo de referencias, si existe. */
  cca: number | null;
  /** Línea / tipo de caja del catálogo (p.ej. Willard AGM, Extrema). */
  caseType: string;
  /** Notas de especificación u observación de aplicación. */
  observations: string | null;
  productLine?: string;
  catalogLabel?: string;
}

export interface SimilarVehicleSuggestion {
  marca: string;
  modelo: string;
  textoCatalogo: string;
}

export interface BatteryRecommendationResult {
  matchKind: BatteryMatchKind;
  query: BatteryRecommendationQuery;
  recommendations: BatteryRecommendationItem[];
  similarVehicles: SimilarVehicleSuggestion[];
  reasonCode?:
    | 'EXACT_MATCH'
    | 'YEAR_RANGE_MATCH'
    | 'SIMILAR_MODEL'
    | 'NO_MATCH'
    | 'MISSING_QUERY'
    | 'MATCH_WITHOUT_REFERENCES';
}
