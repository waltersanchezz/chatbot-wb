import { Router } from 'express';
import {
  ObservabilityService,
  ObservabilityValidationError,
} from '../../../application/services/ObservabilityService';
import type {
  AuditLogFilters,
  MetricFilters,
  SystemLogFilters,
} from '../../../domain/dashboard/observabilityDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Observability API — Centro de Operaciones (Sprint 21).
 */
export function createObservabilityApiRouter(
  observabilityService: ObservabilityService,
): Router {
  const router = Router();

  router.get('/observability/health', (_req, res) => {
    try {
      res.json(observabilityService.getHealth());
    } catch (err) {
      logger.exception('GET /api/observability/health failed', err, {
        service: 'ObservabilityApi',
        operation: 'health',
      });
      res.status(500).json({ error: 'No se pudo obtener health' });
    }
  });

  router.post('/observability/health/check', (_req, res) => {
    try {
      const result = observabilityService.runHealthCheck();
      res.json(result);
    } catch (err) {
      if (err instanceof ObservabilityValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/observability/health/check failed', err, {
        service: 'ObservabilityApi',
        operation: 'healthCheck',
      });
      res.status(500).json({ error: 'No se pudo ejecutar health check' });
    }
  });

  router.get('/observability/logs', (req, res) => {
    try {
      const filters = parseLogFilters(req.query as Record<string, unknown>);
      const logs = observabilityService.listLogs(filters);
      res.json({ logs, total: logs.length });
    } catch (err) {
      logger.exception('GET /api/observability/logs failed', err, {
        service: 'ObservabilityApi',
        operation: 'logs',
      });
      res.status(500).json({ error: 'No se pudieron listar logs' });
    }
  });

  router.get('/observability/audit', (req, res) => {
    try {
      const filters = parseAuditFilters(req.query as Record<string, unknown>);
      const audits = observabilityService.listAudit(filters);
      res.json({ audits, total: audits.length });
    } catch (err) {
      logger.exception('GET /api/observability/audit failed', err, {
        service: 'ObservabilityApi',
        operation: 'audit',
      });
      res.status(500).json({ error: 'No se pudo listar auditoría' });
    }
  });

  router.get('/observability/metrics', (req, res) => {
    try {
      const filters = parseMetricFilters(req.query as Record<string, unknown>);
      const metrics = observabilityService.listMetrics(filters);
      res.json({ metrics, total: metrics.length });
    } catch (err) {
      logger.exception('GET /api/observability/metrics failed', err, {
        service: 'ObservabilityApi',
        operation: 'metrics',
      });
      res.status(500).json({ error: 'No se pudieron listar métricas' });
    }
  });

  router.get('/observability/system', (_req, res) => {
    try {
      res.json(observabilityService.getSystemOverview());
    } catch (err) {
      logger.exception('GET /api/observability/system failed', err, {
        service: 'ObservabilityApi',
        operation: 'system',
      });
      res.status(500).json({ error: 'No se pudo cargar el overview' });
    }
  });

  return router;
}

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseLogFilters(query: Record<string, unknown>): SystemLogFilters {
  return {
    level: typeof query.level === 'string' ? query.level : undefined,
    module: typeof query.module === 'string' ? query.module : undefined,
    q: typeof query.q === 'string' ? query.q : undefined,
    from: typeof query.from === 'string' ? query.from : undefined,
    to: typeof query.to === 'string' ? query.to : undefined,
    limit: parseLimit(query.limit),
  };
}

function parseAuditFilters(query: Record<string, unknown>): AuditLogFilters {
  return {
    userId: typeof query.userId === 'string' ? query.userId : undefined,
    action: typeof query.action === 'string' ? query.action : undefined,
    resource: typeof query.resource === 'string' ? query.resource : undefined,
    from: typeof query.from === 'string' ? query.from : undefined,
    to: typeof query.to === 'string' ? query.to : undefined,
    limit: parseLimit(query.limit),
  };
}

function parseMetricFilters(query: Record<string, unknown>): MetricFilters {
  return {
    metric: typeof query.metric === 'string' ? query.metric : undefined,
    from: typeof query.from === 'string' ? query.from : undefined,
    to: typeof query.to === 'string' ? query.to : undefined,
    limit: parseLimit(query.limit),
  };
}
