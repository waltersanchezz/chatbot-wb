import type {
  VehicleApplicationQuery,
  WillardApplicationHit,
  WillardReferenceSpec,
} from '../willard/catalogTypes';

export type {
  RecommendationOutcome,
  RecommendationResult,
  ReferenceLookupResult,
  ReferenceRecommendationQuery,
  VehicleApplicationQuery,
  VehicleRecommendationQuery,
  WillardApplicationHit,
  WillardDimensionsMm,
  WillardLineReferences,
  WillardProductLine,
  WillardRecommendedOption,
  WillardReferenceSpec,
  WillardSourceTrace,
} from '../willard/catalogTypes';

export interface WillardBatteryOption {
  reference: string;
  amperage: number;
  caseType: string;
  soundSystem: boolean;
}

export interface WillardBatteryMatch extends WillardBatteryOption {
  vehicleBrand: string;
  vehicleModel: string;
}

export interface WillardLookupQuery {
  brand?: string;
  model?: string;
  year?: string;
  soundSystem: boolean;
}

/**
 * Base de conocimiento Willard (catálogo estructurado).
 * El flujo de baterías / WhatsApp consume RecommendationService sobre este puerto.
 * `findRecommendations` se conserva solo por compatibilidad de interfaz (no lo usa el chatbot).
 */
export interface WillardBatteryKnowledge {
  /** Compatibilidad legada — no usado por ConversationEngine. */
  findRecommendations(query: WillardLookupQuery): WillardBatteryMatch[];

  /** Catálogo estructurado — solo aplicaciones utilizables. */
  findApplicationsByVehicle(query: VehicleApplicationQuery): WillardApplicationHit[];

  findApplicationsByReference(reference: string): WillardApplicationHit[];

  findReferenceSpec(reference: string): WillardReferenceSpec | null;
}
