import type { Product } from '../entities/Product';
import type { ProductCategory } from '../../shared/types';

export interface ProductSearchCriteria {
  category?: ProductCategory;
  sku?: string;
  query?: string;
  tags?: string[];
}

export interface ProductRepository {
  findById(id: string): Promise<Product | null>;
  findBySku(sku: string): Promise<Product | null>;
  search(criteria: ProductSearchCriteria): Promise<Product[]>;
  listByCategory(category: ProductCategory): Promise<Product[]>;
}
