import { describe, expect, it } from 'vitest';
import path from 'path';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { buildTestConversationEngine } from './buildTestConversationEngine';

const fixtures = path.join(process.cwd(), 'tests', 'fixtures', 'willard');

function buildEngine() {
  const knowledge = new CatalogFileWillardBatteryKnowledge(
    path.join(fixtures, 'apps-mini.json'),
    path.join(fixtures, 'refs-mini.json'),
  );
  return buildTestConversationEngine(knowledge).engine;
}

function conversation() {
  return {
    id: 'c1',
    customerId: 'u1',
    channel: 'whatsapp' as const,
    externalId: 'wa:1',
    context: createEmptyContext(),
    messages: [] as { role: string; content: string }[],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

describe('ConversationEngine battery handoff timing (Orchestrator)', () => {
  it('asking for battery only collects vehicle — no Willard handoff yet', async () => {
    const engine = buildEngine();
    const conv = conversation();
    const result = await engine.process(conv as never, 'batería');

    expect(result.context.stage).toBe('collecting_vehicle');
    expect(result.context.needsHumanHandoff).toBe(false);
    expect(result.context.handoffReason).toBeUndefined();
    expect(result.reply).toContain('¿Para qué vehículo');
    expect(result.reply).not.toContain('Referencia Willard no encontrada');
    expect(result.reply).not.toContain('Motivo:');
  });

  it('does not recommend with brand alone (asks for model first)', async () => {
    const engine = buildEngine();
    const conv = conversation();
    conv.context = (await engine.process(conv as never, 'batería')).context;
    const result = await engine.process(conv as never, 'BMW');

    expect(result.context.vehicle.brand?.toUpperCase()).toBe('BMW');
    expect(result.context.stage).toBe('collecting_vehicle');
    expect(result.context.needsHumanHandoff).toBe(false);
    expect(result.reply.toLowerCase()).toContain('modelo');
  });

  it('sticky prior handoff is cleared when user restarts with batería', async () => {
    const engine = buildEngine();
    const conv = conversation();
    conv.context.needsHumanHandoff = true;
    conv.context.handoffReason =
      'Referencia Willard no encontrada en base de conocimiento';
    conv.context.stage = 'handoff';
    conv.context.category = 'baterias';
    conv.messages.push({ role: 'customer', content: 'prev' } as never);

    const result = await engine.process(conv as never, 'batería');

    expect(result.context.needsHumanHandoff).toBe(false);
    expect(result.context.handoffReason).toBeUndefined();
    expect(result.context.stage).toBe('collecting_vehicle');
    expect(result.reply).toContain('¿Para qué vehículo');
    expect(result.reply).not.toContain('Motivo: Referencia Willard');
  });

  it('handoff with Willard-not-found only after full data and empty search', async () => {
    const engine = buildEngine();
    const conv = conversation();
    conv.context = (await engine.process(conv as never, 'batería')).context;
    // Vehículo inexistente forzado al SalesFlow vía hidratación de contexto.
    conv.context.vehicle = { brand: 'ZZZZ', model: 'FakeCar' };
    conv.context.salesFlow = undefined;
    conv.context = (await engine.process(conv as never, '2018')).context;
    const result = await engine.process(conv as never, 'No');

    expect(result.context.battery.soundSystem).toBe(false);
    expect(result.context.stage).toBe('handoff');
    expect(result.context.needsHumanHandoff).toBe(true);
    expect(result.context.handoffReason).toBe(
      'Referencia Willard no encontrada en base de conocimiento',
    );
  });

  it('matched recommendation does not set needsHumanHandoff', async () => {
    const engine = buildEngine();
    const conv = conversation();
    conv.context = (await engine.process(conv as never, 'batería')).context;
    const afterVehicle = await engine.process(conv as never, 'BMW 320i');
    conv.context = afterVehicle.context;
    // Año aparte → auto-confirm → planta
    conv.context = (await engine.process(conv as never, '2015')).context;
    const result = await engine.process(conv as never, 'No');

    expect(result.context.stage).toBe('closing');
    expect(result.context.needsHumanHandoff).toBe(false);
    expect(result.reply).toContain('W-L5-95AH');
  });
});
