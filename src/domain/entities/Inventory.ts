export interface InventoryItem {
  id: string;
  productId: string;
  sku: string;
  quantity: number;
  location?: string;
  updatedAt: Date;
}
