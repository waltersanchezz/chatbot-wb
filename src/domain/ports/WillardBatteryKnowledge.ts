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
 * Base de conocimiento Willard (archivo de datos externo).
 */
export interface WillardBatteryKnowledge {
  findRecommendations(query: WillardLookupQuery): WillardBatteryMatch[];
}
