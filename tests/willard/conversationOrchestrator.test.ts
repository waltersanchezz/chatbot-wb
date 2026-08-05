import { describe, expect, it } from 'vitest';
import { BatteryRecommendationEngine } from '../../src/application/services/BatteryRecommendationEngine';
import { ConversationOrchestrator } from '../../src/application/services/ConversationOrchestrator';
import { RecommendationPresenter } from '../../src/application/services/RecommendationPresenter';
import { SalesFlowEngine } from '../../src/application/services/SalesFlowEngine';
import { VehicleInterpreter } from '../../src/application/services/VehicleInterpreter';
import { buildVehicleCatalogIndexFromHits } from '../../src/application/services/VehicleCatalogIndex';
import {
  FakeWillardBatteryKnowledge,
  hit,
  spec,
} from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import type { OrchestratorSession } from '../../src/application/services/ConversationOrchestrator';

function buildOrchestrator() {
  const apps = [
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['REF-LOGAN'] },
      fila: 1,
    }),
  ];
  const specs = new Map<string, WillardReferenceSpec>([
    [
      'REF-LOGAN',
      { ...spec('REF-LOGAN'), cca18C: 620, linea: 'Willard', notas: null },
    ],
  ]);
  const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
  const catalog = buildVehicleCatalogIndexFromHits(
    apps.map((a) => ({
      marca: a.marca,
      modelo: a.modelo,
      textoCatalogo: a.textoCatalogo,
    })),
  );

  return new ConversationOrchestrator(
    new SalesFlowEngine(),
    new VehicleInterpreter(),
    catalog,
    new BatteryRecommendationEngine(knowledge),
    new RecommendationPresenter(),
  );
}

/** Completa vehículo vía eventos de Sales (la Conversation decide; el orquestador solo aplica). */
function completeVehicle(orch: ConversationOrchestrator, session: OrchestratorSession) {
  let result = orch.handle(session, { type: 'START_FLOW' });
  result = orch.handle(result.session, {
    type: 'USER_TEXT',
    text: 'Logan 2013',
  });
  result = orch.handle(result.session, {
    type: 'SALES_EVENT',
    event: {
      type: 'VEHICLE_UPDATED',
      vehicle: { vehicleConfirmed: true },
    },
  });
  result = orch.handle(result.session, {
    type: 'SALES_EVENT',
    event: {
      type: 'VEHICLE_UPDATED',
      vehicle: { soundSystem: false },
    },
  });
  return result;
}

describe('ConversationOrchestrator — orquestación pura', () => {
  it('flujo completo exitoso hasta WAITING_CONFIRMATION con presentación', () => {
    const orch = buildOrchestrator();
    let result = orch.handle(orch.createSession(), { type: 'START_FLOW' });
    result = orch.handle(result.session, {
      type: 'USER_TEXT',
      text: 'Logan 2013',
    });
    expect(result.invocations.vehicleInterpreter).toBe(1);
    expect(result.session.sales.vehicle.brand).toBeTruthy();
    expect(result.session.sales.vehicle.model).toBeTruthy();
    expect(result.session.sales.vehicle.year).toBe('2013');

    result = orch.handle(result.session, {
      type: 'SALES_EVENT',
      event: {
        type: 'VEHICLE_UPDATED',
        vehicle: { vehicleConfirmed: true },
      },
    });
    result = orch.handle(result.session, {
      type: 'SALES_EVENT',
      event: {
        type: 'VEHICLE_UPDATED',
        vehicle: { soundSystem: false },
      },
    });

    expect(result.session.sales.state).toBe('WAITING_CONFIRMATION');
    expect(result.recommendation?.matchKind).toBe('exact');
    expect(result.presented?.text).toMatch(/REF-LOGAN|Referencia/i);
    expect(result.crmEvent?.type).toBe('RECOMMENDATION_SHOWN');
    // Invocaciones del turno que presenta (sin reinterpretar)
    expect(result.invocations.vehicleInterpreter).toBe(0);
    expect(result.invocations.batteryEngine).toBe(1);
    expect(result.invocations.presenter).toBe(1);
  });

  it('vehículo incompleto → no llama BatteryEngine ni Presenter', () => {
    const orch = buildOrchestrator();
    let result = orch.handle(orch.createSession(), { type: 'START_FLOW' });
    result = orch.handle(result.session, { type: 'USER_TEXT', text: 'Renault' });

    expect(result.session.sales.state).toBe('IDENTIFYING_VEHICLE');
    expect(result.session.sales.nextAction).toBe('ASK_MODEL');
    expect(result.recommendation).toBeUndefined();
    expect(result.presented).toBeUndefined();
    expect(result.invocations.batteryEngine).toBe(0);
    expect(result.invocations.presenter).toBe(0);
    expect(result.invocations.crmEvents).toBe(0);
  });

  it('sin recomendación (marca inexistente) → READY_FOR_ADVISOR + evento CRM', () => {
    const orch = buildOrchestrator();
    let result = orch.handle(orch.createSession(), { type: 'START_FLOW' });
    result = orch.handle(result.session, {
      type: 'SALES_EVENT',
      event: {
        type: 'VEHICLE_UPDATED',
        vehicle: {
          brand: 'FERRARI',
          model: 'F40',
          year: '1990',
          vehicleConfirmed: true,
          soundSystem: false,
        },
      },
    });

    expect(result.session.sales.state).toBe('READY_FOR_ADVISOR');
    expect(result.recommendation?.matchKind).toBe('none');
    expect(result.presented?.matchKind).toBe('none');
    expect(result.crmEvent?.type).toBe('LEAD_READY_FOR_ADVISOR');
    expect(result.invocations.batteryEngine).toBe(1);
    expect(result.invocations.presenter).toBe(1);
  });

  it('confirmación del cliente → READY_FOR_ADVISOR', () => {
    const orch = buildOrchestrator();
    let result = completeVehicle(orch, orch.createSession());
    expect(result.session.sales.state).toBe('WAITING_CONFIRMATION');

    result = orch.handle(result.session, {
      type: 'SALES_EVENT',
      event: { type: 'CUSTOMER_ACCEPTS_RECOMMENDATION' },
    });

    expect(result.session.sales.state).toBe('READY_FOR_ADVISOR');
    expect(result.session.sales.readyForAdvisor).toBe(true);
    expect(result.crmEvent?.type).toBe('LEAD_READY_FOR_ADVISOR');
    // No vuelve a recomendar al confirmar
    expect(result.invocations.batteryEngine).toBe(0);
    expect(result.invocations.presenter).toBe(0);
  });

  it('paso a READY_FOR_ADVISOR vía REQUEST_ADVISOR', () => {
    const orch = buildOrchestrator();
    let result = orch.handle(orch.createSession(), { type: 'START_FLOW' });
    result = orch.handle(result.session, {
      type: 'SALES_EVENT',
      event: { type: 'REQUEST_ADVISOR' },
    });

    expect(result.session.sales.state).toBe('READY_FOR_ADVISOR');
    expect(result.crmEvent?.type).toBe('LEAD_READY_FOR_ADVISOR');
    expect(result.invocations.batteryEngine).toBe(0);
  });

  it('sin llamadas duplicadas en un turno de recomendación', () => {
    const orch = buildOrchestrator();
    const result = completeVehicle(orch, orch.createSession());

    expect(result.invocations.batteryEngine).toBe(1);
    expect(result.invocations.presenter).toBe(1);
    expect(result.invocations.crmEvents).toBe(1);
    // Sales: VEHICLE_UPDATED (confirm) + VEHICLE_UPDATED (sound) + RECOMMENDATION_PRESENTED
    // (el USER_TEXT Logan va en otro turno; este result es el del sound)
    expect(result.invocations.salesFlow).toBe(2);
  });
});
