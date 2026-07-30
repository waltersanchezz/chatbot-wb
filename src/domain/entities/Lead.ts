import type { Channel } from '../../shared/types';

export type LeadProduct = 'Batería' | 'Rodamiento';

/** Prioridad comercial — etiquetas en español (dominio + API). */
export type LeadPriority = 'Alta' | 'Media' | 'Baja';

/**
 * Estados comerciales (pipeline CRM).
 * Legacy MVP: `nuevo` | `cotizado` | `vendido` | `perdido`.
 * Extensión CRM: `asignado` | `en_gestion` | `recontacto` | `cerrado`.
 */
export type LeadStatus =
  | 'nuevo'
  | 'asignado'
  | 'en_gestion'
  | 'cotizado'
  | 'recontacto'
  | 'vendido'
  | 'perdido'
  | 'cerrado';

export type LeadSource = 'whatsapp_flow' | 'whatsapp_handoff' | 'api_test';

export type RecommendationOutcomeSnapshot =
  | 'matched'
  | 'partial'
  | 'empty'
  | 'unknown';

export interface LeadVehicleQuery {
  marca?: string;
  modelo?: string;
  version?: string;
  /** Slot conversacional; no implica catálogo Willard. */
  year?: string;
}

/** Opción recomendada — solo literales ya producidos por RecommendationResult. */
export interface LeadRecommendedOption {
  reference: string;
  productLine?: string;
  /** Trazabilidad si estaba en el result; no inventar. */
  fuenteImagen?: string;
  fuenteFila?: number;
}

export interface LeadRecommendationSnapshot {
  outcome: RecommendationOutcomeSnapshot;
  reasonCode?: string;
  query: LeadVehicleQuery;
  options: LeadRecommendedOption[];
  /**
   * Resumen humano para Telegram/panel; derivado de options o handoffReason —
   * nunca precio/stock inventado.
   */
  summary: string;
}

export interface LeadAssignment {
  assigneeId?: string;
  assigneeName?: string;
  assignedAt?: Date;
}

export interface LeadSla {
  firstResponseDueAt?: Date;
  firstResponseAt?: Date;
  breached?: boolean;
}

export interface LeadRecontact {
  dueAt?: Date;
  attempts: number;
  lastAttemptAt?: Date;
  note?: string;
}

/**
 * Oportunidad comercial (no identidad de cliente).
 * Campos ★ del CRM_SPEC son opcionales para compatibilidad con LeadService actual.
 */
export interface Lead {
  id: string;
  /** Fecha de creación del lead. */
  createdAt: Date;
  /** ★ Última actualización CRM. */
  updatedAt?: Date;

  // Identidad: referencia al perfil; phone/name = denormalización de lectura
  customerId: string;
  conversationId: string;
  phone: string;
  name?: string;
  /** ★ Canal de origen; default implícito whatsapp en callers legacy. */
  channel?: Channel;
  /** ★ Origen del lead. */
  source?: LeadSource;

  // Vehículo de esta oportunidad
  /** ★ Referencia opcional a VehicleProfile. */
  vehicleProfileId?: string;
  product: LeadProduct;
  vehicleBrand: string;
  vehicleModel: string;
  year: string;
  /** "Planta de sonido" | "ABS" */
  optionLabel: string;
  /** true = Sí, false = No, null = sin dato */
  optionValue: boolean | null;

  // Recomendación / handoff
  /** Resumen legacy (compat panel). */
  recommendation: string;
  /** ★ Snapshot congelado; no re-query Willard. */
  recommendationSnapshot?: LeadRecommendationSnapshot;
  /** ★ Desde ConversationContext. */
  handoffReason?: string;
  /** ★ Señal CRM de handoff humano. */
  needsHumanHandoff?: boolean;

  status: LeadStatus;
  /** ★ Prioridad almacenada; recalculable por PriorityPolicy (PR posterior). */
  priority?: LeadPriority;
  priorityUpdatedAt?: Date;
  assignment?: LeadAssignment;
  sla?: LeadSla;
  recontact?: LeadRecontact;
  /** ★ Notas internas asesor. */
  notes?: string;

  /** Evita perder la notificación si el primer intento falló o se omitió. */
  telegramNotified?: boolean;
  /** ★ Motivo opcional al pasar a perdido. */
  lostReason?: string;
}
