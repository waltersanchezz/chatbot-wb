import { Router } from 'express';
import type { CompanyService } from '../../../application/services/CompanyService';
import type { CompanyUpdateInput } from '../../../domain/dashboard/companyDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Company API — white-label por tenant (Dashboard Sprint 11).
 */
export function createCompanyApiRouter(companyService: CompanyService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      res.json(companyService.getCompany());
    } catch (err) {
      logger.exception('GET /api/company failed', err, {
        service: 'CompanyApi',
        operation: 'getCompany',
      });
      res.status(500).json({ error: 'No se pudo cargar la configuración' });
    }
  });

  router.put('/', (req, res) => {
    try {
      const body = (req.body ?? {}) as CompanyUpdateInput;
      const updated = companyService.updateCompany(sanitizeUpdate(body));
      res.json(updated);
    } catch (err) {
      logger.exception('PUT /api/company failed', err, {
        service: 'CompanyApi',
        operation: 'updateCompany',
      });
      res.status(500).json({ error: 'No se pudo actualizar la configuración' });
    }
  });

  return router;
}

function sanitizeUpdate(body: CompanyUpdateInput): CompanyUpdateInput {
  const out: CompanyUpdateInput = {};
  const keys: Array<keyof CompanyUpdateInput> = [
    'companyName',
    'logoUrl',
    'primaryColor',
    'secondaryColor',
    'phone',
    'email',
    'website',
    'address',
    'city',
    'country',
    'businessType',
    'welcomeMessage',
    'workingHours',
  ];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      const value = body[key];
      const normalized = value == null ? null : String(value);
      (out as Record<string, string | null | undefined>)[key] = normalized;
    }
  }
  return out;
}
