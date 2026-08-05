import { Router } from 'express';
import type { ClientService } from '../../../application/services/ClientService';
import type { ClientListQuery } from '../../../domain/dashboard/clientDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Client API del Dashboard React (Sprint 4).
 * Independiente del CRM /api/customers.
 */
export function createClientsApiRouter(clientService: ClientService): Router {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const sortByRaw = String(req.query.sortBy ?? 'ultimaActividad');
      const sortBy: ClientListQuery['sortBy'] =
        sortByRaw === 'primerContacto' ||
        sortByRaw === 'leadPromedio' ||
        sortByRaw === 'cantidadConversaciones'
          ? sortByRaw
          : 'ultimaActividad';

      const query: ClientListQuery = {
        page: parsePositiveInt(req.query.page, 1),
        pageSize: parsePositiveInt(req.query.pageSize, 20),
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        sortBy,
        sortOrder: req.query.sortOrder === 'asc' ? 'asc' : 'desc',
      };
      res.json(clientService.listClients(query));
    } catch (err) {
      logger.exception('GET /api/clients failed', err, {
        service: 'ClientsApi',
        operation: 'list',
      });
      res.status(500).json({ error: 'No se pudo listar clientes' });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const id = String(req.params.id ?? '');
      const detail = clientService.getById(id);
      if (!detail) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }
      res.json(detail);
    } catch (err) {
      logger.exception('GET /api/clients/:id failed', err, {
        service: 'ClientsApi',
        operation: 'getById',
      });
      res.status(500).json({ error: 'No se pudo cargar el cliente' });
    }
  });

  return router;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
