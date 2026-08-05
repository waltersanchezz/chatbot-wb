/**
 * Contratos del Knowledge Engine (independiente del canal).
 */

export type KnowledgeIntent =
  | 'explanation'
  | 'comparison'
  | 'alternatives'
  | 'faq'
  | 'compatibility'
  | 'unknown';

export type KnowledgeQuery =
  | { type: 'EXPLAIN'; reference: string }
  | { type: 'COMPARE'; left: string; right: string }
  | { type: 'ALTERNATIVES'; reference: string }
  | { type: 'FAQ'; topicOrQuestion: string }
  | {
      type: 'COMPATIBILITY';
      reference: string;
      marca: string;
      modelo: string;
      year?: string;
    }
  | { type: 'ASK'; text: string };

export interface KnowledgeSpecSummary {
  reference: string;
  linea: string | null;
  cca: number | null;
  ah: number | null;
  caseType: string | null;
  terminal: string | null;
  polaridad: string | null;
  observations: string | null;
  dimensionsMm: string | null;
}

export interface KnowledgeComparisonPoint {
  field: string;
  left: string;
  right: string;
  note?: string;
}

export interface KnowledgeAlternativeItem {
  reference: string;
  reason: string;
  spec: KnowledgeSpecSummary;
}

export interface KnowledgeCompatibilityHit {
  marca: string;
  modelo: string;
  textoCatalogo: string;
  version: string | null;
}

/** DTO de respuesta — solo datos + texto; no envía mensajes. */
export interface KnowledgeResponse {
  intent: KnowledgeIntent;
  /** Texto listo para presentar (el canal lo usa después). */
  answer: string;
  /** true si hubo evidencia de catálogo o artículo. */
  found: boolean;
  explanation?: {
    reference: string;
    spec: KnowledgeSpecSummary;
    catalogVehicles: KnowledgeCompatibilityHit[];
  };
  comparison?: {
    left: KnowledgeSpecSummary;
    right: KnowledgeSpecSummary;
    points: KnowledgeComparisonPoint[];
    recommendation: string;
  };
  alternatives?: {
    reference: string;
    items: KnowledgeAlternativeItem[];
  };
  faq?: {
    articleId: string;
    title: string;
  };
  compatibility?: {
    reference: string;
    marca: string;
    modelo: string;
    compatible: boolean;
    matchingVehicles: KnowledgeCompatibilityHit[];
  };
}
