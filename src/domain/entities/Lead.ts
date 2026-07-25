export type LeadStatus = 'nuevo' | 'cotizado' | 'vendido' | 'perdido';
export type LeadProduct = 'Batería' | 'Rodamiento';

export interface Lead {
  id: string;
  /** Fecha de creación del lead. */
  createdAt: Date;
  phone: string;
  product: LeadProduct;
  vehicleBrand: string;
  vehicleModel: string;
  year: string;
  /** "Planta de sonido" | "ABS" */
  optionLabel: string;
  /** true = Sí, false = No, null = sin dato */
  optionValue: boolean | null;
  recommendation: string;
  status: LeadStatus;
  conversationId: string;
  customerId: string;
  name?: string;
  /** Evita perder la notificación si el primer intento falló o se omitió. */
  telegramNotified?: boolean;
}
