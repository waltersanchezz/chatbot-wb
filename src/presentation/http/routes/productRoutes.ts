import { Router } from 'express';
import type { ProductRepository } from '../../../domain/ports/ProductRepository';
import type { ProductCategory } from '../../../shared/types';

export function createProductRouter(products: ProductRepository): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const category = req.query.category as ProductCategory | undefined;
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const sku = typeof req.query.sku === 'string' ? req.query.sku : undefined;

      const results = await products.search({ category, query: q, sku });
      res.json({
        count: results.length,
        items: results.map((p) => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category,
          description: p.description,
          // Nunca exponer precios inventados; solo si existen en catálogo confirmado
          price: p.price ?? null,
          inStock: p.inStock ?? null,
          battery: p.battery,
          bearing: p.bearing,
          tags: p.tags,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:sku', async (req, res, next) => {
    try {
      const product = await products.findBySku(req.params.sku);
      if (!product) {
        res.status(404).json({
          error: 'Referencia no encontrada en catálogo base',
          hint: 'Un asesor puede verificar equivalencias e inventario',
        });
        return;
      }
      res.json(product);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
