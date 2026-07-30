import { describe, expect, it } from 'vitest';
import { RecommendationService } from '../../src/application/services/RecommendationService';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { buildContainer } from '../../src/infrastructure/di/container';

describe('buildContainer Willard DI', () => {
  it('wires WhatsApp battery flow exclusively through RecommendationService + catalog', () => {
    const container = buildContainer();

    expect(container.willardCatalogKnowledge).toBeInstanceOf(
      CatalogFileWillardBatteryKnowledge,
    );
    expect(container.recommendationService).toBeInstanceOf(RecommendationService);
    expect(container).not.toHaveProperty('willardKnowledge');

    const mazda = container.recommendationService.recommendByVehicle({
      marca: 'MAZDA',
      modelo: 'Mazda 3',
    });
    expect(mazda.outcome).toBe('matched');
    expect(mazda.options.length).toBeGreaterThan(0);
    expect(
      mazda.applications.some((a) => /mazda 3/i.test(a.textoCatalogo)),
    ).toBe(true);
  });
});
