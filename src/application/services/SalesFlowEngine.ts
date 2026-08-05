import type { BatteryMatchKind } from '../../domain/willard/batteryRecommendation';
import type {
  SalesFlowEvent,
  SalesFlowSnapshot,
  SalesFlowState,
  SalesNextAction,
  SalesVehicleSnapshot,
} from '../../domain/sales/salesFlow';

/**
 * Módulo 5 — Sales Flow Engine.
 *
 * Decide el siguiente paso comercial, el leadScore y cuándo el lead
 * está listo para un asesor. No habla con CRM, WhatsApp ni el catálogo.
 */
export class SalesFlowEngine {
  createInitial(): SalesFlowSnapshot {
    return buildSnapshot({
      state: 'NEW',
      vehicle: {},
      hasRecommendation: false,
    });
  }

  /**
   * Aplica un evento al snapshot actual y devuelve el nuevo estado.
   * Transiciones inválidas se ignoran (estado sin cambios, mismo score).
   */
  transition(
    current: SalesFlowSnapshot,
    event: SalesFlowEvent,
  ): SalesFlowSnapshot {
    switch (event.type) {
      case 'START_BATTERY_FLOW':
        return buildSnapshot({
          state: 'IDENTIFYING_VEHICLE',
          vehicle: {},
          hasRecommendation: false,
        });

      case 'VEHICLE_UPDATED': {
        if (current.state === 'CLOSED') return current;
        const vehicle = { ...current.vehicle, ...event.vehicle };
        const complete = isVehicleComplete(vehicle);
        const state: SalesFlowState =
          current.state === 'NEW' ? 'IDENTIFYING_VEHICLE' : current.state;

        // Si aún identifica y ya está completo + confirmado → listo para recomendar.
        // `state` ya nunca es NEW (se normalizó arriba a IDENTIFYING_VEHICLE).
        if (
          state === 'IDENTIFYING_VEHICLE' &&
          complete &&
          vehicle.vehicleConfirmed
        ) {
          return buildSnapshot({
            state: 'RECOMMENDATION_READY',
            vehicle,
            hasRecommendation: false,
            matchKind: current.matchKind,
          });
        }

        return buildSnapshot({
          state,
          vehicle,
          hasRecommendation: current.hasRecommendation,
          matchKind: current.matchKind,
        });
      }

      case 'RECOMMENDATION_PRESENTED': {
        if (current.state === 'CLOSED') return current;
        const vehicle = current.vehicle;

        if (!event.hasOptions || event.matchKind === 'none') {
          // Sin opción usable: el asesor debe cerrar el caso.
          return buildSnapshot({
            state: 'READY_FOR_ADVISOR',
            vehicle,
            hasRecommendation: false,
            matchKind: event.matchKind,
          });
        }

        return buildSnapshot({
          state: 'WAITING_CONFIRMATION',
          vehicle,
          hasRecommendation: true,
          matchKind: event.matchKind,
        });
      }

      case 'CUSTOMER_ACCEPTS_RECOMMENDATION': {
        if (current.state !== 'WAITING_CONFIRMATION' && current.state !== 'RECOMMENDATION_READY') {
          return current;
        }
        return buildSnapshot({
          state: 'READY_FOR_ADVISOR',
          vehicle: current.vehicle,
          hasRecommendation: current.hasRecommendation,
          matchKind: current.matchKind,
        });
      }

      case 'CUSTOMER_REJECTS_RECOMMENDATION': {
        if (current.state !== 'WAITING_CONFIRMATION' && current.state !== 'RECOMMENDATION_READY') {
          return current;
        }
        return buildSnapshot({
          state: 'CLOSED',
          vehicle: current.vehicle,
          hasRecommendation: current.hasRecommendation,
          matchKind: current.matchKind,
          closeReason: 'customer_rejected_recommendation',
        });
      }

      case 'REQUEST_ADVISOR': {
        if (current.state === 'CLOSED') return current;
        return buildSnapshot({
          state: 'READY_FOR_ADVISOR',
          vehicle: current.vehicle,
          hasRecommendation: current.hasRecommendation,
          matchKind: current.matchKind,
        });
      }

      case 'CLOSE':
        return buildSnapshot({
          state: 'CLOSED',
          vehicle: current.vehicle,
          hasRecommendation: current.hasRecommendation,
          matchKind: current.matchKind,
          closeReason: event.reason ?? 'closed',
        });

      default:
        return current;
    }
  }

  /** Atajo: ¿el lead debe pasar a un asesor humano? */
  isReadyForAdvisor(snapshot: SalesFlowSnapshot): boolean {
    return snapshot.readyForAdvisor;
  }

  /** Recalcula score sin cambiar estado (útil para telemetría). */
  score(vehicle: SalesVehicleSnapshot, matchKind?: BatteryMatchKind): number {
    return computeLeadScore(vehicle, matchKind, false);
  }
}

function buildSnapshot(partial: {
  state: SalesFlowState;
  vehicle: SalesVehicleSnapshot;
  hasRecommendation: boolean;
  matchKind?: BatteryMatchKind;
  closeReason?: string;
}): SalesFlowSnapshot {
  const readyForAdvisor = partial.state === 'READY_FOR_ADVISOR';
  const leadScore = computeLeadScore(
    partial.vehicle,
    partial.matchKind,
    readyForAdvisor,
  );
  return {
    state: partial.state,
    vehicle: partial.vehicle,
    matchKind: partial.matchKind,
    hasRecommendation: partial.hasRecommendation,
    leadScore,
    readyForAdvisor,
    nextAction: resolveNextAction(partial.state, partial.vehicle, partial.matchKind),
    closeReason: partial.closeReason,
  };
}

function isVehicleComplete(v: SalesVehicleSnapshot): boolean {
  return Boolean(
    v.brand?.trim() &&
      v.model?.trim() &&
      v.year?.trim() &&
      v.soundSystem !== undefined,
  );
}

function resolveNextAction(
  state: SalesFlowState,
  vehicle: SalesVehicleSnapshot,
  matchKind?: BatteryMatchKind,
): SalesNextAction {
  switch (state) {
    case 'NEW':
      return 'ASK_VEHICLE';

    case 'IDENTIFYING_VEHICLE': {
      if (!vehicle.brand?.trim() && !vehicle.model?.trim()) return 'ASK_VEHICLE';
      if (!vehicle.brand?.trim() || !vehicle.model?.trim()) {
        return vehicle.brand?.trim() ? 'ASK_MODEL' : 'ASK_VEHICLE';
      }
      if (!vehicle.year?.trim()) return 'ASK_YEAR';
      if (!vehicle.vehicleConfirmed) return 'CONFIRM_VEHICLE';
      if (vehicle.soundSystem === undefined) return 'ASK_SOUND';
      return 'SHOW_RECOMMENDATION';
    }

    case 'RECOMMENDATION_READY':
      return 'SHOW_RECOMMENDATION';

    case 'WAITING_CONFIRMATION':
      return 'ASK_INTEREST_AFTER_RECOMMENDATION';

    case 'READY_FOR_ADVISOR':
      return matchKind === 'none' || matchKind === undefined
        ? 'CLARIFY_VEHICLE'
        : 'HANDOFF_TO_ADVISOR';

    case 'CLOSED':
      return 'END_CONVERSATION';

    default:
      return 'ASK_VEHICLE';
  }
}

/**
 * leadScore 0–100 según información recopilada + calidad de match.
 *
 * | Señal                         | Puntos |
 * |-------------------------------|--------|
 * | Marca                         | 15     |
 * | Modelo                        | 20     |
 * | Año                           | 15     |
 * | Planta de sonido respondida   | 10     |
 * | Vehículo confirmado           | 10     |
 * | Match exact / year_range / similar | 20 / 15 / 10 |
 * | Listo para asesor             | 10     |
 */
export function computeLeadScore(
  vehicle: SalesVehicleSnapshot,
  matchKind?: BatteryMatchKind,
  readyForAdvisor = false,
): number {
  let score = 0;
  if (vehicle.brand?.trim()) score += 15;
  if (vehicle.model?.trim()) score += 20;
  if (vehicle.year?.trim()) score += 15;
  if (vehicle.soundSystem !== undefined) score += 10;
  if (vehicle.vehicleConfirmed) score += 10;

  if (matchKind === 'exact') score += 20;
  else if (matchKind === 'year_range') score += 15;
  else if (matchKind === 'similar') score += 10;

  if (readyForAdvisor) score += 10;

  return Math.min(100, Math.max(0, score));
}
