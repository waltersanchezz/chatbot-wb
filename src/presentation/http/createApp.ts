import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { CustomerProfileService } from '../../application/services/CustomerProfileService';
import type { LeadService } from '../../application/services/LeadService';
import type { InteractionService } from '../../application/services/InteractionService';
import type { HandleIncomingMessage } from '../../application/use-cases/HandleIncomingMessage';
import type { LogRepository } from '../../domain/ports/LogRepository';
import type { ProductRepository } from '../../domain/ports/ProductRepository';
import { env } from '../../infrastructure/config/env';
import type { WhatsAppIdempotencyGate } from '../../infrastructure/messaging/WhatsAppMessageIdempotency';
import { logger } from '../../infrastructure/logging/logger';
import { createChatRouter } from './routes/chatRoutes';
import { createCustomerRouter } from './routes/customerRoutes';
import {
  createDashboardRouter,
  getDashboardStaticPath,
} from './routes/dashboardRoutes';
import { createHealthRouter } from './routes/healthRoutes';
import { createLeadRouter } from './routes/leadRoutes';
import { createLogsRouter } from './routes/logsRoutes';
import { createProductRouter } from './routes/productRoutes';
import { createWhatsAppAuditRouter } from './routes/whatsappAuditRoutes';
import { createWhatsAppRouter } from './routes/whatsappRoutes';

export interface AppDeps {
  handleIncomingMessage: HandleIncomingMessage;
  products: ProductRepository;
  logs: LogRepository;
  leadService: LeadService;
  customerProfileService: CustomerProfileService;
  interactionService: InteractionService;
  whatsappIdempotency?: WhatsAppIdempotencyGate;
}

export function createApp(deps: AppDeps): Express {
  const app = express();

  // TEMPORAL: depuración — ¿llega tráfico de Meta / túnel?
  app.use((req, _res, next) => {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    console.log('[HTTP IN]', {
      method: req.method,
      url: req.originalUrl,
      time: new Date().toISOString(),
      ip,
    });
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // CRM (UI estática + API de leads reales)
  app.use('/dashboard', express.static(getDashboardStaticPath()));
  app.use('/dashboard', createDashboardRouter());

  app.use(createHealthRouter());
  app.use('/api/leads', createLeadRouter(deps.leadService));
  app.use(
    '/api/customers',
    createCustomerRouter(deps.customerProfileService, deps.interactionService),
  );
  app.use('/api/chat', createChatRouter(deps.handleIncomingMessage));
  app.use('/api/products', createProductRouter(deps.products));
  app.use('/api/logs', createLogsRouter(deps.logs));
  app.use(
    '/webhook/whatsapp',
    createWhatsAppRouter(
      deps.handleIncomingMessage,
      env.whatsapp.verifyToken,
      deps.whatsappIdempotency,
    ),
  );
  app.use('/api/debug', createWhatsAppAuditRouter(env.whatsapp.verifyToken));
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    res.status(500).json({
      error: 'Internal server error',
    });
  });

  return app;
}
