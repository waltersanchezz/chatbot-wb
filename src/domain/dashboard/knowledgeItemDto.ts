/**
 * Ítems de conocimiento administrables por tenant (Dashboard Sprint 13).
 */

export const KNOWLEDGE_CATEGORIES = [
  'FAQ',
  'Productos',
  'Servicios',
  'Garantías',
  'Instalación',
  'Mantenimiento',
  'Promociones',
  'Otros',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export interface KnowledgeItemDto {
  id: string;
  tenantId: string;
  category: KnowledgeCategory;
  title: string;
  question: string;
  answer: string;
  tags: string[];
  priority: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCreateInput {
  category?: string;
  title: string;
  question: string;
  answer: string;
  tags?: string[];
  priority?: number;
  enabled?: boolean;
}

export interface KnowledgeUpdateInput {
  category?: string;
  title?: string;
  question?: string;
  answer?: string;
  tags?: string[];
  priority?: number;
  enabled?: boolean;
}

export interface KnowledgeListFilters {
  q?: string;
  category?: string;
  enabled?: boolean;
}

export interface KnowledgeListResult {
  items: KnowledgeItemDto[];
  total: number;
  enabledCount: number;
}

export function isKnowledgeCategory(value: string): value is KnowledgeCategory {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeKnowledgeCategory(value: unknown): KnowledgeCategory {
  const raw = String(value ?? '').trim();
  if (isKnowledgeCategory(raw)) return raw;
  return 'Otros';
}
