import type { InterpretedVehicle } from '../../domain/willard/vehicleInterpretation';
import type { VehicleCatalogIndex } from '../../domain/willard/vehicleInterpretation';
import type { BatteryRecommendationResult } from '../../domain/willard/batteryRecommendation';
import type {
  SalesFlowEvent,
  SalesFlowSnapshot,
  SalesVehicleSnapshot,
} from '../../domain/sales/salesFlow';
import type { BatteryRecommendationEngine } from './BatteryRecommendationEngine';
import type {
  PresentedRecommendation,
  RecommendationPresenter,
} from './RecommendationPresenter';
import type { SalesFlowEngine } from './SalesFlowEngine';
import type { VehicleInterpreter } from './VehicleInterpreter';

/**
 * Módulo 6 — Conversation Orchestrator (puro).
 *
 * Flujo:
 *   Conversation → VehicleInterpreter → SalesFlowEngine
 *     → BatteryRecommendationEngine → RecommendationPresenter → CRM (evento)
 *
 * No contiene reglas de negocio, no interpreta, no recomienda, no genera mensajes,
 * no toca WhatsApp / Webhook / CRM. Solo orquesta llamadas a motores existentes.
 */

export type CrmOrchestratorEventType =
  | 'RECOMMENDATION_SHOWN'
  | 'LEAD_READY_FOR_ADVISOR'
  | 'FLOW_CLOSED';

export interface CrmOrchestratorEvent {
  type: CrmOrchestratorEventType;
  sales: SalesFlowSnapshot;
  recommendation?: BatteryRecommendationResult;
}

export interface OrchestratorSession {
  sales: SalesFlowSnapshot;
}

/** Contadores para verificar que no hay llamadas duplicadas. */
export interface OrchestratorInvocations {
  vehicleInterpreter: number;
  salesFlow: number;
  batteryEngine: number;
  presenter: number;
  crmEvents: number;
}

export type OrchestratorCommand =
  | { type: 'START_FLOW' }
  | { type: 'USER_TEXT'; text: string }
  | { type: 'SALES_EVENT'; event: SalesFlowEvent };

export interface OrchestratorResult {
  session: OrchestratorSession;
  interpretation?: InterpretedVehicle;
  recommendation?: BatteryRecommendationResult;
  presented?: PresentedRecommendation;
  /** Evento para que la capa superior lo envíe al CRM (el orquestador no llama CRM). */
  crmEvent?: CrmOrchestratorEvent;
  invocations: OrchestratorInvocations;
}

export class ConversationOrchestrator {
  constructor(
    private readonly salesFlow: SalesFlowEngine,
    private readonly vehicleInterpreter: VehicleInterpreter,
    private readonly vehicleCatalog: VehicleCatalogIndex,
    private readonly batteryEngine: BatteryRecommendationEngine,
    private readonly presenter: RecommendationPresenter,
  ) {}

  createSession(): OrchestratorSession {
    return { sales: this.salesFlow.createInitial() };
  }

  /**
   * Ejecuta un comando de orquestación.
   * La capa Conversation decide el comando; aquí solo se encadenan servicios.
   */
  handle(
    session: OrchestratorSession,
    command: OrchestratorCommand,
  ): OrchestratorResult {
    const invocations = emptyInvocations();
    let sales = session.sales;
    let interpretation: InterpretedVehicle | undefined;
    let recommendation: BatteryRecommendationResult | undefined;
    let presented: PresentedRecommendation | undefined;
    let crmEvent: CrmOrchestratorEvent | undefined;

    switch (command.type) {
      case 'START_FLOW': {
        sales = this.callSales(sales, { type: 'START_BATTERY_FLOW' }, invocations);
        break;
      }

      case 'SALES_EVENT': {
        sales = this.callSales(sales, command.event, invocations);
        if (
          sales.nextAction === 'SHOW_RECOMMENDATION' ||
          sales.state === 'RECOMMENDATION_READY'
        ) {
          const built = this.buildRecommendation(sales, invocations);
          recommendation = built.recommendation;
          presented = built.presented;
          sales = built.sales;
          crmEvent = built.crmEvent;
        } else {
          crmEvent = crmEventForSales(sales, undefined, invocations);
        }
        break;
      }

      case 'USER_TEXT': {
        // 1) VehicleInterpreter (una sola vez)
        invocations.vehicleInterpreter += 1;
        interpretation = this.vehicleInterpreter.interpret({
          text: command.text,
          prior: {
            brand: sales.vehicle.brand,
            model: sales.vehicle.model,
            year: sales.vehicle.year,
          },
          catalog: this.vehicleCatalog,
        });

        // 2) SalesFlowEngine — actualizar vehículo (mapeo DTO, sin reglas)
        const vehiclePatch = toVehiclePatch(interpretation, sales.vehicle);
        sales = this.callSales(
          sales,
          { type: 'VEHICLE_UPDATED', vehicle: vehiclePatch },
          invocations,
        );

        // 3–5) Recomendación solo si el SalesFlow lo indica
        if (sales.nextAction === 'SHOW_RECOMMENDATION') {
          const built = this.buildRecommendation(sales, invocations);
          recommendation = built.recommendation;
          presented = built.presented;
          sales = built.sales;
          crmEvent = built.crmEvent;
        }
        break;
      }

      default:
        break;
    }

    return {
      session: { sales },
      interpretation,
      recommendation,
      presented,
      crmEvent,
      invocations,
    };
  }

  /**
   * Presenta recomendación cuando el SalesFlow ya está en RECOMMENDATION_READY
   * (p.ej. tras un SALES_EVENT que completó el vehículo).
   */
  presentRecommendation(session: OrchestratorSession): OrchestratorResult {
    const invocations = emptyInvocations();
    let sales = session.sales;

    if (
      sales.nextAction !== 'SHOW_RECOMMENDATION' &&
      sales.state !== 'RECOMMENDATION_READY'
    ) {
      return {
        session,
        invocations,
      };
    }

    const built = this.buildRecommendation(sales, invocations);
    return {
      session: { sales: built.sales },
      recommendation: built.recommendation,
      presented: built.presented,
      crmEvent: built.crmEvent,
      invocations,
    };
  }

  private buildRecommendation(
    sales: SalesFlowSnapshot,
    invocations: OrchestratorInvocations,
  ): {
    sales: SalesFlowSnapshot;
    recommendation: BatteryRecommendationResult;
    presented: PresentedRecommendation;
    crmEvent: CrmOrchestratorEvent;
  } {
    const v = sales.vehicle;

    // 3) BatteryRecommendationEngine (una sola vez)
    invocations.batteryEngine += 1;
    const recommendation = this.batteryEngine.recommend({
      marca: v.brand ?? '',
      modelo: v.model ?? '',
      year: v.year,
      soundSystem: v.soundSystem,
    });

    // 4) RecommendationPresenter (una sola vez)
    invocations.presenter += 1;
    const presented = this.presenter.present(recommendation);

    // 5) SalesFlow post-recomendación (una sola vez)
    sales = this.callSales(
      sales,
      {
        type: 'RECOMMENDATION_PRESENTED',
        matchKind: recommendation.matchKind,
        hasOptions: recommendation.recommendations.length > 0,
      },
      invocations,
    );

    // 6) CRM solo como evento (no se invoca el CRM)
    const crmEvent = crmEventForSales(sales, recommendation, invocations)!;

    return { sales, recommendation, presented, crmEvent };
  }

  private callSales(
    sales: SalesFlowSnapshot,
    event: SalesFlowEvent,
    invocations: OrchestratorInvocations,
  ): SalesFlowSnapshot {
    invocations.salesFlow += 1;
    return this.salesFlow.transition(sales, event);
  }
}

/** Mapeo DTO interpretación → snapshot de vehículo (sin reglas de flujo). */
function toVehiclePatch(
  interpreted: InterpretedVehicle,
  prior: SalesVehicleSnapshot,
): SalesVehicleSnapshot {
  const patch: SalesVehicleSnapshot = { ...prior };
  if (interpreted.marca) patch.brand = interpreted.marca;
  if (interpreted.modelo && interpreted.unresolved !== 'model') {
    patch.model = interpreted.modelo;
  }
  if (interpreted.unresolved === 'model' && !interpreted.modelo) {
    patch.model = undefined;
  }
  if (interpreted.year) patch.year = interpreted.year;
  return patch;
}

function crmEventForSales(
  sales: SalesFlowSnapshot,
  recommendation: BatteryRecommendationResult | undefined,
  invocations: OrchestratorInvocations,
): CrmOrchestratorEvent | undefined {
  if (sales.state === 'WAITING_CONFIRMATION') {
    invocations.crmEvents += 1;
    return {
      type: 'RECOMMENDATION_SHOWN',
      sales,
      recommendation,
    };
  }
  if (sales.state === 'READY_FOR_ADVISOR') {
    invocations.crmEvents += 1;
    return {
      type: 'LEAD_READY_FOR_ADVISOR',
      sales,
      recommendation,
    };
  }
  if (sales.state === 'CLOSED') {
    invocations.crmEvents += 1;
    return {
      type: 'FLOW_CLOSED',
      sales,
      recommendation,
    };
  }
  return undefined;
}

function emptyInvocations(): OrchestratorInvocations {
  return {
    vehicleInterpreter: 0,
    salesFlow: 0,
    batteryEngine: 0,
    presenter: 0,
    crmEvents: 0,
  };
}
