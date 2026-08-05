import type { BatteryMatchKind } from '../willard/batteryRecommendation';

/**
 * Módulo 5 – estados del flujo comercial de baterías.
 * Independiente de ConversationEngine / CRM / WhatsApp.
 */
export type SalesFlowState =
  | 'NEW'
  | 'IDENTIFYING_VEHICLE'
  | 'RECOMMENDATION_READY'
  | 'WAITING_CONFIRMATION'
  | 'READY_FOR_ADVISOR'
  | 'CLOSED';

/** Próximo paso de conversación que el orquestador debe ejecutar. */
export type SalesNextAction =
  | 'ASK_VEHICLE'
  | 'ASK_MODEL'
  | 'ASK_YEAR'
  | 'ASK_SOUND'
  | 'CONFIRM_VEHICLE'
  | 'SHOW_RECOMMENDATION'
  | 'ASK_INTEREST_AFTER_RECOMMENDATION'
  | 'CLARIFY_VEHICLE'
  | 'HANDOFF_TO_ADVISOR'
  | 'END_CONVERSATION';

export interface SalesVehicleSnapshot {
  brand?: string;
  model?: string;
  year?: string;
  soundSystem?: boolean;
  vehicleConfirmed?: boolean;
}

export type SalesFlowEvent =
  | { type: 'START_BATTERY_FLOW' }
  | { type: 'VEHICLE_UPDATED'; vehicle: SalesVehicleSnapshot }
  | {
      type: 'RECOMMENDATION_PRESENTED';
      matchKind: BatteryMatchKind;
      hasOptions: boolean;
    }
  | { type: 'CUSTOMER_ACCEPTS_RECOMMENDATION' }
  | { type: 'CUSTOMER_REJECTS_RECOMMENDATION' }
  | { type: 'REQUEST_ADVISOR' }
  | { type: 'CLOSE'; reason?: string };

export interface SalesFlowSnapshot {
  state: SalesFlowState;
  vehicle: SalesVehicleSnapshot;
  matchKind?: BatteryMatchKind;
  hasRecommendation: boolean;
  /** 0–100 */
  leadScore: number;
  readyForAdvisor: boolean;
  nextAction: SalesNextAction;
  closeReason?: string;
}
