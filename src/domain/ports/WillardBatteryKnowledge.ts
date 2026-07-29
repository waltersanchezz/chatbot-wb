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
 * Base de conocimiento Willard.
 * Métodos legacy (`findRecommendations`) sirven al chatbot actual.
 * Métodos de catálogo estructurado alimentan RecommendationService (tests / futuro wiring).
 */
export interface WillardBatteryKnowledge {
  /** API legado — willard-batteries.json / ConversationEngine. */
  findRecommendations(query: WillardLookupQuery): WillardBatteryMatch[];

  /** Catálogo estructurado — solo aplicaciones utilizables. */
  findApplicationsByVehicle(query: VehicleApplicationQuery): WillardApplicationHit[];

  findApplicationsByReference(reference: string): WillardApplicationHit[];

  findReferenceSpec(reference: string): WillardReferenceSpec | null;
}
