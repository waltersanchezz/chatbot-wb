import type { SalesFlowSnapshot } from '../sales/salesFlow';
import type {
  BatteryPreference,
  BearingPosition,
  Channel,
  ConversationIntent,
  ConversationStage,
  ProductCategory,
  TransmissionType,
} from '../../shared/types';
import type { Message } from './Message';

export interface VehicleContext {
  brand?: string;
  model?: string;
  year?: string;
  engine?: string;
}

export interface BatteryContext {
  soundSystem?: boolean;
  europeanCase?: boolean;
  standardCase?: boolean;
  preference?: BatteryPreference;
}

export interface BearingContext {
  position?: BearingPosition;
  hasAbs?: boolean;
  transmission?: TransmissionType;
  referenceHint?: string;
}

export interface ConversationContext {
  intent: ConversationIntent;
  stage: ConversationStage;
  category?: ProductCategory;
  vehicle: VehicleContext;
  battery: BatteryContext;
  bearing: BearingContext;
  notes: string[];
  recommendedProductIds: string[];
  needsHumanHandoff: boolean;
  handoffReason?: string;
  /**
   * Modelos ofrecidos tras AMBIGUOUS_MODEL.
   * Si el usuario responde con una opción (ignorando mayúsculas/espacios),
   * se selecciona sin repetir la búsqueda difusa.
   */
  pendingModelOptions?: string[];
  /**
   * Módulo 2: el cliente ya confirmó marca/modelo/año.
   * Si falta, y hay los tres datos, se pide confirmación antes de planta de sonido.
   */
  vehicleConfirmed?: boolean;
  /**
   * Snapshot del SalesFlowEngine (vía ConversationOrchestrator).
   * Fuente de verdad del flujo de baterías en producción.
   */
  salesFlow?: SalesFlowSnapshot;
  /**
   * Última referencia Willard presentada (Smart Advisor / KnowledgeEngine).
   * Permite "¿Por qué?" sin volver a pedir el vehículo.
   */
  lastRecommendedReference?: string;
  /** Referencias de la última presentación (para comparación). */
  lastRecommendedReferences?: string[];
  /**
   * Conversation Recovery: oferta de continuar pendiente (sí/no).
   * No avanza SalesFlow hasta que el usuario decida.
   */
  recoveryOfferPending?: boolean;
  /** Última pregunta técnica respondida por KnowledgeEngine (contexto recuperable). */
  lastTechnicalQuestion?: string;
  /** Última respuesta técnica (resumen/contexto). */
  lastTechnicalAnswer?: string;
}

export interface Conversation {
  id: string;
  customerId: string;
  channel: Channel;
  externalId: string;
  context: ConversationContext;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

export function createEmptyContext(): ConversationContext {
  return {
    intent: 'unknown',
    stage: 'welcome',
    vehicle: {},
    battery: {},
    bearing: {},
    notes: [],
    recommendedProductIds: [],
    needsHumanHandoff: false,
  };
}
