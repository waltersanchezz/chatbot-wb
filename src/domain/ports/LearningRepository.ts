import type {
  LearningEventDto,
  LearningQueryOptions,
  LearningRecordInput,
  LearningStatsDto,
  RankedItemDto,
} from '../learning/learningDtos';

/**
 * Puerto de analítica / aprendizaje.
 * La implementación SQLite es detalle de infraestructura.
 */
export interface LearningRepository {
  record(event: LearningRecordInput): LearningEventDto;

  count(): number;

  topVehicles(options?: LearningQueryOptions): RankedItemDto[];
  topReferences(options?: LearningQueryOptions): RankedItemDto[];
  topBrands(options?: LearningQueryOptions): RankedItemDto[];
  topQuestions(options?: LearningQueryOptions): RankedItemDto[];
  topTechnicalQuestions(options?: LearningQueryOptions): RankedItemDto[];
  topRecommendations(options?: LearningQueryOptions): RankedItemDto[];

  finishedConversations(): number;
  abandonedConversations(): number;
  averageDurationMs(): number;

  getStats(options?: LearningQueryOptions): LearningStatsDto;

  listEvents(options?: LearningQueryOptions): LearningEventDto[];
}
