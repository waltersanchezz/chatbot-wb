import { describe, expect, it } from 'vitest';
import { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { RecommendationService } from '../../src/application/services/RecommendationService';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import path from 'path';

const fixtures = path.join(process.cwd(), 'tests', 'fixtures', 'willard');

function buildEngine() {
  const knowledge = new CatalogFileWillardBatteryKnowledge(
    path.join(fixtures, 'apps-mini.json'),
    path.join(fixtures, 'refs-mini.json'),
  );
  return new ConversationEngine(
    new InMemoryProductRepository(),
    new RecommendationService(knowledge),
    { appName: 'Test AI', companyName: 'Rodacenter' },
  );
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

describe('ConversationEngine battery handoff timing', () => {
  it('asking for battery only collects vehicle — no Willard handoff yet', async () => {
    const engine = buildEngine();
    const conv = conversation();
    const result = await engine.process(conv as any, 'batería');

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
    conv.context = (await engine.process(conv as any, 'batería')).context;
    const result = await engine.process(conv as any, 'BMW');

    expect(result.context.vehicle.brand).toBe('bmw');
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
    conv.messages.push({ role: 'customer', content: 'prev' });

    const result = await engine.process(conv as any, 'batería');

    expect(result.context.needsHumanHandoff).toBe(false);
    expect(result.context.handoffReason).toBeUndefined();
    expect(result.context.stage).toBe('collecting_vehicle');
    expect(result.reply).toContain('¿Para qué vehículo');
    expect(result.reply).not.toContain('Motivo: Referencia Willard');
  });

  it('handoff with Willard-not-found only after full data and empty search', async () => {
    const engine = buildEngine();
    const conv = conversation();
    conv.context = (await engine.process(conv as any, 'batería')).context;
    conv.context = (await engine.process(conv as any, 'ZZZZ FakeCar')).context;
    // Free-text may land as brand only — force brand+model for the test.
    conv.context.vehicle = { brand: 'ZZZZ', model: 'FakeCar' };
    conv.context = (await engine.process(conv as any, '2018')).context;
    const result = await engine.process(conv as any, 'No');

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
    conv.context = (await engine.process(conv as any, 'batería')).context;
    conv.context.vehicle = { brand: 'BMW', model: '320i' };
    conv.context = (await engine.process(conv as any, '2015')).context;
    const result = await engine.process(conv as any, 'No');

    expect(result.context.stage).toBe('closing');
    expect(result.context.needsHumanHandoff).toBe(false);
    expect(result.reply).toContain('W-L5-95AH');
  });
});
