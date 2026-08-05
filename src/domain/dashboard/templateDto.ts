/**
 * Template Marketplace (Dashboard Sprint 18).
 * Catálogo de plantillas instalables por tenant.
 */

export const TEMPLATE_CATEGORIES = [
  'Automotriz',
  'Veterinaria',
  'Restaurante',
  'Ferretería',
  'Clínica',
  'Inmobiliaria',
  'Retail',
  'Genérico',
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Contenido declarativo de una plantilla (se aplica vía APIs públicas). */
export interface TemplatePayload {
  knowledge?: Array<{
    category?: string;
    title: string;
    question: string;
    answer: string;
    tags?: string[];
    priority?: number;
  }>;
  automations?: Array<{
    name: string;
    trigger: string;
    enabled?: boolean;
    priority?: number;
    condition?: {
      field: string;
      op?: string;
      value: string | number | boolean;
    } | null;
    action: {
      type: string;
      label?: string;
      priority?: string;
      tag?: string;
      eventName?: string;
    };
    config?: Record<string, unknown>;
  }>;
  workflows?: Array<{
    name: string;
    description?: string;
    trigger: string;
    enabled?: boolean;
    graph?: { edges: Array<{ id: string; source: string; target: string; label?: string | null }> };
    steps?: Array<{
      nodeId: string;
      type: string;
      config?: Record<string, unknown>;
      positionX?: number;
      positionY?: number;
    }>;
  }>;
  company?: {
    companyName?: string;
    businessType?: string;
    welcomeMessage?: string;
    workingHours?: string;
    primaryColor?: string;
    secondaryColor?: string;
    city?: string;
    country?: string;
  };
  /** Declarativo (sin API de escritura pública). */
  pipeline?: { stages?: string[]; notes?: string };
  tasks?: Array<{ title: string; priority?: string; notes?: string }>;
  widgets?: Array<{ id: string; title: string; type?: string }>;
}

export interface TemplateDto {
  id: string;
  category: TemplateCategory;
  name: string;
  description: string;
  thumbnail: string | null;
  version: string;
  author: string;
  enabled: boolean;
  createdAt: string;
  /** Contenido completo (preview / install). */
  payload: TemplatePayload;
  /** Resumen para listados. */
  summary: TemplateContentSummary;
}

export interface TemplateContentSummary {
  knowledge: number;
  automations: number;
  workflows: number;
  company: boolean;
  pipeline: boolean;
  tasks: number;
  widgets: number;
}

export interface TemplateInstallDto {
  id: string;
  tenantId: string;
  templateId: string;
  installedAt: string;
  version: string;
  /** Recursos creados (para update/uninstall). */
  resources: TemplateInstallResources;
}

export interface TemplateInstallResources {
  knowledgeIds: string[];
  automationIds: string[];
  workflowIds: string[];
  companyApplied: boolean;
  pipeline?: TemplatePayload['pipeline'];
  tasks?: TemplatePayload['tasks'];
  widgets?: TemplatePayload['widgets'];
}

export interface TemplateInstallResult {
  install: TemplateInstallDto;
  template: TemplateDto;
  created: {
    knowledge: number;
    automations: number;
    workflows: number;
    company: boolean;
  };
  updated: boolean;
}

export interface TemplateListFilters {
  q?: string;
  category?: string;
}

export function isTemplateCategory(value: string): value is TemplateCategory {
  return (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

export function summarizePayload(payload: TemplatePayload): TemplateContentSummary {
  return {
    knowledge: payload.knowledge?.length ?? 0,
    automations: payload.automations?.length ?? 0,
    workflows: payload.workflows?.length ?? 0,
    company: Boolean(payload.company && Object.keys(payload.company).length),
    pipeline: Boolean(payload.pipeline),
    tasks: payload.tasks?.length ?? 0,
    widgets: payload.widgets?.length ?? 0,
  };
}
