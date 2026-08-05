import { describe, expect, it } from 'vitest';
import {
  SalesFlowEngine,
  computeLeadScore,
} from '../../src/application/services/SalesFlowEngine';
import type { SalesFlowSnapshot } from '../../src/domain/sales/salesFlow';

describe('SalesFlowEngine — transiciones de estado', () => {
  const engine = new SalesFlowEngine();

  it('NEW → IDENTIFYING_VEHICLE con START_BATTERY_FLOW', () => {
    const start = engine.createInitial();
    expect(start.state).toBe('NEW');
    expect(start.nextAction).toBe('ASK_VEHICLE');
    expect(start.leadScore).toBe(0);

    const next = engine.transition(start, { type: 'START_BATTERY_FLOW' });
    expect(next.state).toBe('IDENTIFYING_VEHICLE');
    expect(next.nextAction).toBe('ASK_VEHICLE');
    expect(next.readyForAdvisor).toBe(false);
  });

  it('IDENTIFYING_VEHICLE pide modelo / año / confirmación / planta en orden', () => {
    let snap = engine.transition(engine.createInitial(), {
      type: 'START_BATTERY_FLOW',
    });

    snap = engine.transition(snap, {
      type: 'VEHICLE_UPDATED',
      vehicle: { brand: 'MAZDA' },
    });
    expect(snap.state).toBe('IDENTIFYING_VEHICLE');
    expect(snap.nextAction).toBe('ASK_MODEL');
    expect(snap.leadScore).toBe(15);

    snap = engine.transition(snap, {
      type: 'VEHICLE_UPDATED',
      vehicle: { model: 'Mazda 2 HB All New' },
    });
    expect(snap.nextAction).toBe('ASK_YEAR');
    expect(snap.leadScore).toBe(35);

    snap = engine.transition(snap, {
      type: 'VEHICLE_UPDATED',
      vehicle: { year: '2008' },
    });
    expect(snap.nextAction).toBe('CONFIRM_VEHICLE');
    expect(snap.leadScore).toBe(50);

    snap = engine.transition(snap, {
      type: 'VEHICLE_UPDATED',
      vehicle: { vehicleConfirmed: true },
    });
    expect(snap.nextAction).toBe('ASK_SOUND');
    expect(snap.leadScore).toBe(60);
  });

  it('IDENTIFYING_VEHICLE → RECOMMENDATION_READY cuando el vehículo está completo', () => {
    let snap = engine.transition(engine.createInitial(), {
      type: 'START_BATTERY_FLOW',
    });
    snap = engine.transition(snap, {
      type: 'VEHICLE_UPDATED',
      vehicle: {
        brand: 'RENAULT',
        model: 'Logan',
        year: '2013',
        soundSystem: false,
        vehicleConfirmed: true,
      },
    });

    expect(snap.state).toBe('RECOMMENDATION_READY');
    expect(snap.nextAction).toBe('SHOW_RECOMMENDATION');
    expect(snap.leadScore).toBe(70); // 15+20+15+10+10
  });

  it('RECOMMENDATION_READY → WAITING_CONFIRMATION al presentar match usable', () => {
    const ready = recommendationReadySnapshot(engine);
    const next = engine.transition(ready, {
      type: 'RECOMMENDATION_PRESENTED',
      matchKind: 'exact',
      hasOptions: true,
    });

    expect(next.state).toBe('WAITING_CONFIRMATION');
    expect(next.nextAction).toBe('ASK_INTEREST_AFTER_RECOMMENDATION');
    expect(next.hasRecommendation).toBe(true);
    expect(next.matchKind).toBe('exact');
    expect(next.leadScore).toBe(90); // 70 + 20 exact
    expect(next.readyForAdvisor).toBe(false);
  });

  it('RECOMMENDATION_PRESENTED none → READY_FOR_ADVISOR', () => {
    const ready = recommendationReadySnapshot(engine);
    const next = engine.transition(ready, {
      type: 'RECOMMENDATION_PRESENTED',
      matchKind: 'none',
      hasOptions: false,
    });

    expect(next.state).toBe('READY_FOR_ADVISOR');
    expect(next.readyForAdvisor).toBe(true);
    expect(engine.isReadyForAdvisor(next)).toBe(true);
    expect(next.nextAction).toBe('CLARIFY_VEHICLE');
    expect(next.leadScore).toBe(80); // 70 + 10 ready
  });

  it('WAITING_CONFIRMATION → READY_FOR_ADVISOR si el cliente acepta', () => {
    const waiting = engine.transition(recommendationReadySnapshot(engine), {
      type: 'RECOMMENDATION_PRESENTED',
      matchKind: 'year_range',
      hasOptions: true,
    });
    expect(waiting.state).toBe('WAITING_CONFIRMATION');

    const next = engine.transition(waiting, {
      type: 'CUSTOMER_ACCEPTS_RECOMMENDATION',
    });
    expect(next.state).toBe('READY_FOR_ADVISOR');
    expect(next.nextAction).toBe('HANDOFF_TO_ADVISOR');
    expect(next.readyForAdvisor).toBe(true);
    expect(next.leadScore).toBe(95); // 70 + 15 year_range + 10 ready
  });

  it('WAITING_CONFIRMATION → CLOSED si el cliente rechaza', () => {
    const waiting = engine.transition(recommendationReadySnapshot(engine), {
      type: 'RECOMMENDATION_PRESENTED',
      matchKind: 'similar',
      hasOptions: true,
    });
    const next = engine.transition(waiting, {
      type: 'CUSTOMER_REJECTS_RECOMMENDATION',
    });

    expect(next.state).toBe('CLOSED');
    expect(next.nextAction).toBe('END_CONVERSATION');
    expect(next.readyForAdvisor).toBe(false);
    expect(next.closeReason).toBe('customer_rejected_recommendation');
  });

  it('REQUEST_ADVISOR desde IDENTIFYING → READY_FOR_ADVISOR', () => {
    let snap = engine.transition(engine.createInitial(), {
      type: 'START_BATTERY_FLOW',
    });
    snap = engine.transition(snap, {
      type: 'VEHICLE_UPDATED',
      vehicle: { brand: 'KIA', model: 'Picanto' },
    });
    const next = engine.transition(snap, { type: 'REQUEST_ADVISOR' });

    expect(next.state).toBe('READY_FOR_ADVISOR');
    expect(next.readyForAdvisor).toBe(true);
    expect(next.nextAction).toBe('CLARIFY_VEHICLE');
  });

  it('CLOSE → CLOSED desde cualquier estado activo', () => {
    const ready = recommendationReadySnapshot(engine);
    const next = engine.transition(ready, {
      type: 'CLOSE',
      reason: 'user_goodbye',
    });
    expect(next.state).toBe('CLOSED');
    expect(next.closeReason).toBe('user_goodbye');
    expect(next.nextAction).toBe('END_CONVERSATION');
  });

  it('eventos inválidos en CLOSED no reabren el flujo', () => {
    const closed = engine.transition(engine.createInitial(), {
      type: 'CLOSE',
    });
    const next = engine.transition(closed, {
      type: 'VEHICLE_UPDATED',
      vehicle: { brand: 'MAZDA' },
    });
    expect(next.state).toBe('CLOSED');
    expect(next.vehicle.brand).toBeUndefined();
  });
});

describe('computeLeadScore', () => {
  it('acota entre 0 y 100', () => {
    expect(computeLeadScore({}, undefined, false)).toBe(0);
    expect(
      computeLeadScore(
        {
          brand: 'A',
          model: 'B',
          year: '2020',
          soundSystem: true,
          vehicleConfirmed: true,
        },
        'exact',
        true,
      ),
    ).toBe(100);
  });
});

function recommendationReadySnapshot(engine: SalesFlowEngine): SalesFlowSnapshot {
  let snap = engine.transition(engine.createInitial(), {
    type: 'START_BATTERY_FLOW',
  });
  snap = engine.transition(snap, {
    type: 'VEHICLE_UPDATED',
    vehicle: {
      brand: 'RENAULT',
      model: 'Logan',
      year: '2013',
      soundSystem: false,
      vehicleConfirmed: true,
    },
  });
  expect(snap.state).toBe('RECOMMENDATION_READY');
  return snap;
}
