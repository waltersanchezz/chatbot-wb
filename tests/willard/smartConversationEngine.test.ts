import { describe, expect, it } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import type { ConversationEngine } from '../../src/application/services/ConversationEngine';

function buildEngine() {
  const apps = [
    hit({
      marca: 'MAZDA',
      modelo: 'Mazda 2 HB All New',
      textoCatalogo: 'Mazda 2 HB All New',
      refs: { willard: ['FAKE-M2'] },
      fila: 1,
    }),
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['FAKE-LOG'] },
      fila: 2,
    }),
    hit({
      marca: 'CHEVROLET',
      modelo: 'Spark',
      textoCatalogo: 'Spark GTI 1.2LT',
      refs: { willard: ['FAKE-SP'] },
      fila: 3,
    }),
  ];
  const specs = new Map<string, WillardReferenceSpec>([
    ['FAKE-M2', { ...spec('FAKE-M2'), cca18C: 500 }],
    ['FAKE-LOG', { ...spec('FAKE-LOG'), cca18C: 620 }],
    ['FAKE-SP', { ...spec('FAKE-SP'), cca18C: 450 }],
  ]);
  const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
  return buildTestConversationEngine(knowledge, catalogRowsFromHits(apps)).engine;
}

function conversation() {
  return {
    id: 'c-m2',
    customerId: 'u1',
    channel: 'whatsapp' as const,
    externalId: 'wa:m2',
    context: createEmptyContext(),
    messages: [] as { role: string; content: string }[],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function say(
  engine: ConversationEngine,
  conv: ReturnType<typeof conversation>,
  msg: string,
) {
  const result = await engine.process(conv as never, msg);
  conv.context = result.context;
  conv.messages.push({ role: 'customer', content: msg });
  return result;
}

describe('Módulo 2 — Smart Conversation Engine (vía Orchestrator)', () => {
  it('solo marca → pide el modelo con tono de asesor', async () => {
    const engine = buildEngine();
    const conv = conversation();
    await say(engine, conv, 'batería');
    const step = await say(engine, conv, 'Mazda');

    expect(step.reply).toMatch(/Mazda|MAZDA/i);
    expect(step.reply).toMatch(/modelo/i);
    expect(step.reply).not.toMatch(/¿De qué año/i);
    expect(step.context.vehicle.brand).toBe('MAZDA');
    expect(step.context.vehicle.model).toBeFalsy();
    expect(step.context.stage).toBe('collecting_vehicle');
  });

  it('marca + modelo → pide únicamente el año', async () => {
    const engine = buildEngine();
    const conv = conversation();
    await say(engine, conv, 'batería');
    const step = await say(engine, conv, 'Renault Logan');

    expect(step.context.vehicle.brand?.toUpperCase()).toBe('RENAULT');
    expect(step.context.vehicle.model).toMatch(/Logan/i);
    expect(step.context.vehicle.year).toBeFalsy();
    expect(step.reply).toMatch(/año/i);
    expect(step.reply).not.toMatch(/planta de sonido/i);
    expect(step.reply).not.toMatch(/anoté esto/i);
  });

  it('marca+modelo+año en un mensaje → resumen y confirmación', async () => {
    const engine = buildEngine();
    const conv = conversation();
    await say(engine, conv, 'batería');
    const step = await say(engine, conv, 'Logan 2013');

    expect(step.context.vehicle.brand).toBe('RENAULT');
    expect(step.context.vehicle.model).toMatch(/Logan/i);
    expect(step.context.vehicle.year).toBe('2013');
    expect(step.context.vehicleConfirmed).toBeFalsy();
    expect(step.reply).toMatch(/anoté esto|Está bien así/i);
    expect(step.reply).toMatch(/2013/);
    expect(step.reply).not.toMatch(/planta de sonido/i);
    expect(step.context.stage).toBe('collecting_vehicle');
  });

  it('tras confirmar → pregunta solo planta de sonido (sí de confirmación no marca planta)', async () => {
    const engine = buildEngine();
    const conv = conversation();
    await say(engine, conv, 'batería');
    await say(engine, conv, 'Mazda2 2008');
    const confirm = await say(engine, conv, 'sí');

    expect(confirm.context.vehicleConfirmed).toBe(true);
    expect(confirm.context.battery.soundSystem).toBeUndefined();
    expect(confirm.reply).toMatch(/planta de sonido/i);
    expect(confirm.context.stage).toBe('collecting_product_details');
  });

  it('paso a paso (año solo) → salta confirmación y pide planta', async () => {
    const engine = buildEngine();
    const conv = conversation();
    await say(engine, conv, 'batería');
    await say(engine, conv, 'Renault Logan');
    const step = await say(engine, conv, '2015');

    expect(step.context.vehicle.year).toBe('2015');
    expect(step.context.vehicleConfirmed).toBe(true);
    expect(step.reply).toMatch(/planta de sonido/i);
    expect(step.reply).not.toMatch(/anoté esto/i);
  });

  it('no en confirmación → reinicia pregunta del vehículo', async () => {
    const engine = buildEngine();
    const conv = conversation();
    await say(engine, conv, 'batería');
    await say(engine, conv, 'Spark GT 2018');
    const step = await say(engine, conv, 'no');

    expect(step.context.vehicle.brand).toBeFalsy();
    expect(step.context.vehicleConfirmed).toBeFalsy();
    expect(step.reply).toMatch(/corregimos|qué vehículo/i);
  });

  it('conversación corta: one-shot + sí + no (planta) llega a recomendación', async () => {
    const engine = buildEngine();
    const conv = conversation();
    await say(engine, conv, 'batería');
    await say(engine, conv, 'Logan 2013');
    await say(engine, conv, 'sí');
    const step = await say(engine, conv, 'no');

    expect(step.context.battery.soundSystem).toBe(false);
    expect(step.context.stage).toMatch(/recommending|handoff|closing/);
    expect(step.reply).toMatch(/FAKE-LOG|Referencia/i);
    expect(step.reply.length).toBeGreaterThan(20);
    expect(engine.batteryFlowMode).toBe('orchestrator');
  });
});
