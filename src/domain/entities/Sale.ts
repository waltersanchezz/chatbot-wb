export type SaleStatus = 'draft' | 'pending_confirmation' | 'confirmed' | 'cancelled';

export interface SaleItem {
  productId: string;
  sku: string;
  quantity: number;
  unitPrice?: number;
}

export interface Sale {
  id: string;
  customerId: string;
  conversationId: string;
  items: SaleItem[];
  status: SaleStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
