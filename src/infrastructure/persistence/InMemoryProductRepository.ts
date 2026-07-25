import type { Product } from '../../domain/entities/Product';
import type {
  ProductRepository,
  ProductSearchCriteria,
} from '../../domain/ports/ProductRepository';
import type { ProductCategory } from '../../shared/types';
import { batteryCatalog } from '../catalog/batteryCatalog';
import { bearingCatalog } from '../catalog/bearingCatalog';

export class InMemoryProductRepository implements ProductRepository {
  private readonly products: Product[];

  constructor(extra: Product[] = []) {
    this.products = [...bearingCatalog, ...batteryCatalog, ...extra];
  }

  async findById(id: string): Promise<Product | null> {
    return this.products.find((p) => p.id === id) ?? null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const key = sku.trim().toUpperCase();
    return (
      this.products.find((p) => p.sku.toUpperCase() === key) ??
      this.products.find((p) => p.bearing?.equivalences?.some((e) => e.toUpperCase() === key)) ??
      null
    );
  }

  async listByCategory(category: ProductCategory): Promise<Product[]> {
    return this.products.filter((p) => p.category === category && p.active);
  }

  async search(criteria: ProductSearchCriteria): Promise<Product[]> {
    let results = this.products.filter((p) => p.active);

    if (criteria.category) {
      results = results.filter((p) => p.category === criteria.category);
    }

    if (criteria.sku) {
      const key = criteria.sku.trim().toUpperCase();
      results = results.filter(
        (p) =>
          p.sku.toUpperCase() === key ||
          p.bearing?.equivalences?.some((e) => e.toUpperCase() === key) ||
          p.tags.some((t) => t.toUpperCase() === key),
      );
    }

    if (criteria.tags?.length) {
      results = results.filter((p) => criteria.tags!.every((t) => p.tags.includes(t)));
    }

    if (criteria.query) {
      const q = criteria.query.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.bearing?.applications?.some((a) => a.toLowerCase().includes(q)),
      );
    }

    return results;
  }
}
