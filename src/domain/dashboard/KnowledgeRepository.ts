import type { KnowledgeArticle } from '../knowledge/knowledgeArticles';
import type {
  KnowledgeCreateInput,
  KnowledgeItemDto,
  KnowledgeListFilters,
  KnowledgeListResult,
  KnowledgeUpdateInput,
} from './knowledgeItemDto';

/**
 * Puerto del Administrador de Conocimiento (Dashboard).
 * KnowledgeEngine no depende de este puerto directamente.
 */
export interface KnowledgeRepository {
  list(filters?: KnowledgeListFilters): KnowledgeListResult;
  getById(id: string): KnowledgeItemDto | null;
  create(input: KnowledgeCreateInput): KnowledgeItemDto;
  update(id: string, input: KnowledgeUpdateInput): KnowledgeItemDto | null;
  delete(id: string): boolean;
  search(query: string): KnowledgeItemDto[];
  duplicate(id: string): KnowledgeItemDto | null;
  /** Artículos habilitados para el KnowledgeEngine (mismo formato FAQ). */
  listEnabledArticles(): KnowledgeArticle[];
  /** Semilla de artículos estáticos si el tenant no tiene ítems. */
  seedDefaultsIfEmpty(): number;
}
