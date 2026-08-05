import type { TemplatePayload } from './templateDto';
import { summarizePayload } from './templateDto';

export const COPILOT_SESSION_STATUSES = [
  'draft',
  'ready',
  'applied',
  'failed',
] as const;

export type CopilotSessionStatus = (typeof COPILOT_SESSION_STATUSES)[number];

export const COPILOT_INTENTS = [
  'taller',
  'veterinaria',
  'inmobiliaria',
  'restaurante',
  'ferreteria',
  'personalizada',
] as const;

export type CopilotIntent = (typeof COPILOT_INTENTS)[number];

export const COPILOT_TEMPLATE_TYPES = [
  'knowledge',
  'company',
  'workflow',
  'automation',
  'pipeline',
  'marketplace',
  'widgets',
  'full',
] as const;

export type CopilotTemplateType = (typeof COPILOT_TEMPLATE_TYPES)[number];

/** Respuesta estructurada generada por el proveedor de IA. */
export interface CopilotGeneratedResponse {
  intent: CopilotIntent;
  industry: string;
  summary: string;
  /** Bundle aplicable vía APIs públicas (misma forma que Marketplace). */
  payload: TemplatePayload;
  /** Si el proveedor sugiere instalar una plantilla del catálogo. */
  suggestedMarketplaceTemplateId?: string | null;
  /** Metadatos de plantilla Marketplace generada (declarativa). */
  marketplaceTemplate?: {
    name: string;
    category: string;
    description: string;
  } | null;
}

export interface CopilotSessionDto {
  id: string;
  tenantId: string;
  prompt: string;
  response: CopilotGeneratedResponse;
  status: CopilotSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CopilotTemplateDto {
  id: string;
  tenantId: string;
  type: CopilotTemplateType;
  payload: CopilotGeneratedResponse;
  createdAt: string;
}

export interface CopilotApplyResult {
  session: CopilotSessionDto;
  applied: {
    knowledge: number;
    automations: number;
    workflows: number;
    company: boolean;
    marketplaceInstalled: boolean;
    pipeline: boolean;
    widgets: number;
  };
  template: CopilotTemplateDto | null;
  billingWarning: string | null;
}

export function isCopilotSessionStatus(
  value: string,
): value is CopilotSessionStatus {
  return (COPILOT_SESSION_STATUSES as readonly string[]).includes(value);
}

export function isCopilotTemplateType(
  value: string,
): value is CopilotTemplateType {
  return (COPILOT_TEMPLATE_TYPES as readonly string[]).includes(value);
}

export function isCopilotIntent(value: string): value is CopilotIntent {
  return (COPILOT_INTENTS as readonly string[]).includes(value);
}

export function summarizeCopilotResponse(
  response: CopilotGeneratedResponse,
): ReturnType<typeof summarizePayload> {
  return summarizePayload(response.payload);
}
