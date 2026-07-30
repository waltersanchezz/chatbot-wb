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

    const bmw = container.recommendationService.recommendByVehicle({
      marca: 'BMW',
      modelo: '320i',
    });
    expect(bmw.outcome).toBe('matched');
    expect(bmw.options.length).toBeGreaterThan(0);
    expect(bmw.applications.some((a) => a.modelo === '320i')).toBe(true);

    const mazda3 = container.recommendationService.recommendByVehicle({
      marca: 'MAZDA',
      modelo: 'Mazda 3',
    });
    expect(mazda3.outcome).toBe('partial');
    expect(mazda3.reasonCode).toBe('AMBIGUOUS_MODEL');
    expect(mazda3.options).toEqual([]);
    expect(mazda3.applications.length).toBeGreaterThanOrEqual(2);
  });
});
