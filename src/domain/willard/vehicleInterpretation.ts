/**
 * Resultado de interpretar habla libre → vehículo estructurado.
 * No inventa marcas/modelos: solo resuelve contra índice de catálogo usable.
 */
export type InterpretationConfidence = 'high' | 'medium' | 'low' | 'none';

export type VehicleUnresolvedField =
  | 'brand'
  | 'model'
  | 'year'
  | 'vehicle';

export interface InterpretedVehicle {
  raw: string;
  /** Marca canónica del catálogo cuando se resolvió. */
  marca?: string;
  /** Mejor query de modelo para RecommendationService (preferir textoCatalogo). */
  modelo?: string;
  version?: string;
  /** Año en 4 dígitos, si se detectó. */
  year?: string;
  confidence: InterpretationConfidence;
  /** Etiquetas para aclaración cuando no hay ganador único. */
  candidateModels?: string[];
  unresolved?: VehicleUnresolvedField;
  /** Telemetría / debug — no mostrar al cliente. */
  notes?: string[];
}

export interface VehicleCatalogModelEntry {
  modelo: string;
  textoCatalogo: string;
}

export interface VehicleCatalogIndex {
  /** marca normalizada → forma canónica en catálogo */
  canonicalBrandByNorm: Map<string, string>;
  /** marca canónica → modelos utilizables */
  modelsByBrand: Map<string, VehicleCatalogModelEntry[]>;
}

export interface VehicleInterpreterPrior {
  brand?: string;
  model?: string;
  year?: string;
}

export interface VehicleInterpreterInput {
  text: string;
  prior?: VehicleInterpreterPrior;
  catalog: VehicleCatalogIndex;
}
