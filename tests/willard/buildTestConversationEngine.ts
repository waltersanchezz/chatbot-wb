import { BatteryRecommendationEngine } from '../../src/application/services/BatteryRecommendationEngine';
import { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { ConversationMemory } from '../../src/application/services/ConversationMemory';
import { ConversationOrchestrator } from '../../src/application/services/ConversationOrchestrator';
import { ConversationRecoveryEngine } from '../../src/application/services/ConversationRecoveryEngine';
import { KnowledgeEngine } from '../../src/application/services/KnowledgeEngine';
import { KnowledgeRepository } from '../../src/application/services/KnowledgeRepository';
import { RecommendationPresenter } from '../../src/application/services/RecommendationPresenter';
import { RecommendationService } from '../../src/application/services/RecommendationService';
import { SalesFlowEngine } from '../../src/application/services/SalesFlowEngine';
import { VehicleInterpreter } from '../../src/application/services/VehicleInterpreter';
import { buildVehicleCatalogIndexFromHits } from '../../src/application/services/VehicleCatalogIndex';
import type { WillardBatteryKnowledge } from '../../src/domain/ports/WillardBatteryKnowledge';
import type { WillardApplicationHit } from '../../src/domain/willard/catalogTypes';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';

export function buildTestConversationEngine(
  knowledge: WillardBatteryKnowledge,
  catalogRows?: Array<{ marca: string; modelo: string; textoCatalogo: string }>,
  options?: {
    recoveryTtlMs?: number;
    now?: () => number;
    persistence?: import('../../src/domain/ports/PersistenceRepository').PersistenceRepository;
    persistenceTtlMs?: number;
    learningEngine?: import('../../src/application/services/LearningEngine').LearningEngine;
  },
) {
  const rows =
    catalogRows ??
    ('exportUsableVehicleRows' in knowledge &&
    typeof (knowledge as CatalogFileWillardBatteryKnowledge)
      .exportUsableVehicleRows === 'function'
      ? (knowledge as CatalogFileWillardBatteryKnowledge).exportUsableVehicleRows()
      : []);

  const catalog = buildVehicleCatalogIndexFromHits(rows);
  const recommendationService = new RecommendationService(knowledge);
  const orchestrator = new ConversationOrchestrator(
    new SalesFlowEngine(),
    new VehicleInterpreter(),
    catalog,
    new BatteryRecommendationEngine(knowledge),
    new RecommendationPresenter(),
  );
  const knowledgeEngine = new KnowledgeEngine(new KnowledgeRepository(knowledge));
  const conversationMemory = new ConversationMemory({
    defaultTtlMs: options?.recoveryTtlMs ?? 24 * 60 * 60_000,
    now: options?.now,
  });
  const conversationRecoveryEngine = new ConversationRecoveryEngine(
    conversationMemory,
  );

  const engine = new ConversationEngine(
    new InMemoryProductRepository(),
    { appName: 'Test AI', companyName: 'Rodacenter' },
    orchestrator,
    recommendationService,
    knowledgeEngine,
    conversationRecoveryEngine,
    options?.persistence,
    options?.persistenceTtlMs,
    options?.learningEngine,
  );

  return {
    engine,
    orchestrator,
    recommendationService,
    knowledge,
    knowledgeEngine,
    conversationMemory,
    conversationRecoveryEngine,
    persistence: options?.persistence,
    learningEngine: options?.learningEngine,
  };
}

export function catalogRowsFromHits(
  apps: WillardApplicationHit[],
): Array<{ marca: string; modelo: string; textoCatalogo: string }> {
  return apps.map((a) => ({
    marca: a.marca,
    modelo: a.modelo,
    textoCatalogo: a.textoCatalogo,
  }));
}
