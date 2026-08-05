import { describe, expect, it, vi } from 'vitest';
import { ConversationOrchestrator } from '../../src/application/services/ConversationOrchestrator';
import { BatteryRecommendationEngine } from '../../src/application/services/BatteryRecommendationEngine';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { buildContainer } from '../../src/infrastructure/di/container';
import { createEmptyContext } from '../../src/domain/entities/Conversation';

describe('buildContainer Willard DI — flujo oficial Orchestrator', () => {
  it('wires ConversationEngine exclusively through ConversationOrchestrator', () => {
    const container = buildContainer();

    expect(container.willardCatalogKnowledge).toBeInstanceOf(
      CatalogFileWillardBatteryKnowledge,
    );
    expect(container.conversationOrchestrator).toBeInstanceOf(
      ConversationOrchestrator,
    );
    expect(container.batteryRecommendationEngine).toBeInstanceOf(
      BatteryRecommendationEngine,
    );
    expect(container.engine.batteryFlowMode).toBe('orchestrator');
    expect(container).not.toHaveProperty('willardKnowledge');
  });

  it('production battery path uses Orchestrator (RecommendationService.recommendByVehicle never called)', async () => {
    const container = buildContainer();
    const engine = container.engine;

    const spy = vi.spyOn(container.recommendationService, 'recommendByVehicle');
    const orchSpy = vi.spyOn(container.conversationOrchestrator, 'handle');

    const conv = {
      id: 'c-prod',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:prod',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    let result = await engine.process(conv as never, 'batería');
    conv.context = result.context;
    result = await engine.process(conv as never, 'BMW 320i 2015');
    conv.context = result.context;
    if (!result.context.vehicleConfirmed) {
      result = await engine.process(conv as never, 'sí');
      conv.context = result.context;
    }
    if (result.context.battery.soundSystem === undefined) {
      result = await engine.process(conv as never, 'no');
    }

    expect(spy).not.toHaveBeenCalled();
    expect(orchSpy).toHaveBeenCalled();
    expect(engine.batteryFlowMode).toBe('orchestrator');
  });
});
