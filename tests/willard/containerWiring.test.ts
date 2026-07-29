import { describe, expect, it } from 'vitest';
import { RecommendationService } from '../../src/application/services/RecommendationService';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { FileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/FileWillardBatteryKnowledge';
import { buildContainer } from '../../src/infrastructure/di/container';

describe('buildContainer Willard DI (PR1)', () => {
  it('injects RecommendationService over the catalog adapter and wires it into ConversationEngine', () => {
    const container = buildContainer();

    expect(container.willardKnowledge).toBeInstanceOf(FileWillardBatteryKnowledge);
    expect(container.willardCatalogKnowledge).toBeInstanceOf(
      CatalogFileWillardBatteryKnowledge,
    );
    expect(container.recommendationService).toBeInstanceOf(RecommendationService);

    // Smoke: service is wired to real catalog data (BMW 320i usable in lote 1).
    const result = container.recommendationService.recommendByVehicle({
      marca: 'BMW',
      modelo: '320i',
    });
    expect(result.outcome).toBe('matched');
    expect(result.options.length).toBeGreaterThan(0);
  });
});
