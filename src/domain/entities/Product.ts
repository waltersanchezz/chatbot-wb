import type { ProductCategory } from '../../shared/types';

export interface BearingSpecs {
  series: string;
  boreMm?: number;
  odMm?: number;
  widthMm?: number;
  sealType?: '2RS' | 'ZZ' | 'open' | 'other';
  lubrication?: string;
  equivalences?: string[];
  applications?: string[];
}

export interface BatterySpecs {
  voltage?: number;
  amperage?: number;
  cca?: number;
  caseType?: 'europea' | 'japonesa' | 'estandar' | 'otra';
  polarity?: string;
  technology?: 'plomo_acido' | 'calcio' | 'agm' | 'efb' | 'otra';
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  brand?: string;
  description: string;
  active: boolean;
  /** Precio solo si está confirmado; nunca inventar. */
  price?: number;
  currency?: 'COP';
  inStock?: boolean;
  bearing?: BearingSpecs;
  battery?: BatterySpecs;
  tags: string[];
}
