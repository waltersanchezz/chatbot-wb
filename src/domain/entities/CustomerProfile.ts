import type { Channel } from '../../shared/types';
import type { Customer } from './Customer';
import type { Interaction } from './Interaction';
import type {
  Lead,
  LeadPriority,
  LeadProduct,
  LeadStatus,
} from './Lead';
import type { VehicleProfile } from './VehicleProfile';

/** Resumen de oportunidad embebido en el perfil CRM. */
export interface LeadSummary {
  id: string;
  status: LeadStatus;
  priority: LeadPriority;
  product: LeadProduct;
  createdAt: Date;
  needsHumanHandoff: boolean;
}

/**
 * Agregado CRM de lectura/escritura sobre la identidad `Customer`.
 * No sustituye la fila de `customers`; `customerId` = `Customer.id`.
 */
export interface CustomerProfile {
  customerId: string;
  phone: string;
  name?: string;
  channel: Channel;
  createdAt: Date;
  updatedAt: Date;

  /** Resumen operativo (calculado al leer o cacheado). */
  openLeadCount: number;
  lastInteractionAt?: Date;
  /** Futuro; vacío en MVP. */
  tags?: string[];

  leads: LeadSummary[];
  vehicles: VehicleProfile[];
  /** Timeline unificada; puede paginarse fuera del root. */
  interactions?: Interaction[];
}

/** Detalle hidratado (perfil + leads completos + timeline). */
export interface CustomerProfileDetail
  extends Omit<CustomerProfile, 'leads' | 'interactions'> {
  leads: Lead[];
  vehicles: VehicleProfile[];
  interactions: Interaction[];
  interactionsHasMore: boolean;
}

/** Perfil CRM vacío a partir de la identidad `Customer`. */
export function createEmptyCustomerProfile(customer: Customer): CustomerProfile {
  return {
    customerId: customer.id,
    phone: customer.phone,
    name: customer.name,
    channel: customer.channel,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    openLeadCount: 0,
    tags: [],
    leads: [],
    vehicles: [],
    interactions: [],
  };
}
