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
