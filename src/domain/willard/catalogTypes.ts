/**
 * DTOs del catálogo Willard estructurado (spec §4).
 * Sin I/O ni dependencias de infraestructura.
 */

export type WillardProductLine =
  | 'willardAgmEfb'
  | 'increibleTitanio'
  | 'willard'
  | 'extrema';

export type RecommendationOutcome = 'matched' | 'empty' | 'partial';

export interface VehicleApplicationQuery {
  marca: string;
  modelo?: string;
  version?: string;
  /** Si true, exige igualdad normalizada con app.version. Default: false. */
  requireVersion?: boolean;
  /** Límite de aplicaciones. Default sugerido en adaptador: 20. */
  limit?: number;
}

export interface VehicleRecommendationQuery {
  marca: string;
  modelo?: string;
  version?: string;
  requireVersion?: boolean;
  limit?: number;
}

export interface ReferenceRecommendationQuery {
  referencia: string;
  limit?: number;
}

export interface WillardSourceTrace {
  lote: number;
  imagen: string;
  fila: number;
}

export interface WillardLineReferences {
  line: WillardProductLine;
  references: string[];
}

export interface WillardApplicationHit {
  marca: string;
  categoria: string;
  modelo: string;
  version: string | null;
  textoCatalogo: string;
  lines: WillardLineReferences[];
  fuente: WillardSourceTrace;
  /** Siempre false en resultados del puerto (ya filtrado). */
  revisionPendiente: false;
}

export interface WillardDimensionsMm {
  largo: number | null;
  ancho: number | null;
  alto: number | null;
}

export interface WillardReferenceSpec {
  referencia: string;
  linea: string;
  polaridad: string | null;
  dimensionesMm: WillardDimensionsMm | null;
  terminal: string | null;
  voltaje: number | null;
  c20Ah: number | null;
  cca18C: number | null;
  ca22C: number | null;
  crMin: number | null;
  notas: string | null;
  fuente: {
    lote: number;
    imagen: string;
    tabla?: string;
    fila: number;
  };
}

export interface WillardRecommendedOption {
  application: WillardApplicationHit;
  productLine: WillardProductLine;
  reference: string;
  spec: WillardReferenceSpec | null;
}

export interface RecommendationResult {
  outcome: RecommendationOutcome;
  query: VehicleRecommendationQuery | ReferenceRecommendationQuery;
  options: WillardRecommendedOption[];
  applications: WillardApplicationHit[];
  reasonCode?: string;
}

export interface ReferenceLookupResult {
  reference: string;
  spec: WillardReferenceSpec | null;
  found: boolean;
}

export const WILLARD_PRODUCT_LINES: readonly WillardProductLine[] = [
  'willardAgmEfb',
  'increibleTitanio',
  'willard',
  'extrema',
] as const;
