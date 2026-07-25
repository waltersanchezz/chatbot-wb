import type { Product } from '../../domain/entities/Product';

/**
 * Catálogo orientativo de baterías Willard.
 * Precios y stock se confirman con asesor/inventario — nunca inventar.
 * La recomendación al cliente solo muestra marca, amperaje y tipo de caja.
 */
export const batteryCatalog: Product[] = [
  {
    id: 'bat-willard-750-42',
    sku: 'WILLARD-750-42',
    name: 'Willard 750',
    category: 'baterias',
    brand: 'Willard',
    description: 'Willard 750 A caja 42',
    active: true,
    tags: ['willard', 'caja-42', 'economica'],
    battery: {
      voltage: 12,
      amperage: 750,
      caseType: 'estandar',
    },
  },
  {
    id: 'bat-willard-850-42',
    sku: 'WILLARD-850-42',
    name: 'Willard 850',
    category: 'baterias',
    brand: 'Willard',
    description: 'Willard 850 A caja 42',
    active: true,
    tags: ['willard', 'caja-42', 'estandar'],
    battery: {
      voltage: 12,
      amperage: 850,
      caseType: 'estandar',
    },
  },
  {
    id: 'bat-willard-900-47',
    sku: 'WILLARD-900-47',
    name: 'Willard 900',
    category: 'baterias',
    brand: 'Willard',
    description: 'Willard 900 A caja 47',
    active: true,
    tags: ['willard', 'caja-47', 'europea'],
    battery: {
      voltage: 12,
      amperage: 900,
      caseType: 'europea',
    },
  },
  {
    id: 'bat-willard-1000-47',
    sku: 'WILLARD-1000-47',
    name: 'Willard 1000',
    category: 'baterias',
    brand: 'Willard',
    description: 'Willard 1000 A caja 47',
    active: true,
    tags: ['willard', 'caja-47', 'premium'],
    battery: {
      voltage: 12,
      amperage: 1000,
      caseType: 'europea',
    },
  },
  {
    id: 'bat-willard-1100-48',
    sku: 'WILLARD-1100-48',
    name: 'Willard 1100',
    category: 'baterias',
    brand: 'Willard',
    description: 'Willard 1100 A caja 48',
    active: true,
    tags: ['willard', 'caja-48', 'premium', 'agm'],
    battery: {
      voltage: 12,
      amperage: 1100,
      caseType: 'europea',
      technology: 'agm',
    },
  },
];
