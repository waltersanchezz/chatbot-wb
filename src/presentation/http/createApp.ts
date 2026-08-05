import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { CustomerProfileService } from '../../application/services/CustomerProfileService';
import type { ClientService } from '../../application/services/ClientService';
import type { ConversationDetailService } from '../../application/services/ConversationDetailService';
import type { ConversationService } from '../../application/services/ConversationService';
import type { DashboardService } from '../../application/services/DashboardService';
import type { LeadService } from '../../application/services/LeadService';
import type { InteractionService } from '../../application/services/InteractionService';
import type { PipelineService } from '../../application/services/PipelineService';
import type { TaskService } from '../../application/services/TaskService';
import type { AnalyticsService } from '../../application/services/AnalyticsService';
import type { AuthService } from '../../application/services/AuthService';
import type { CompanyService } from '../../application/services/CompanyService';
import type { OnboardingService } from '../../application/services/OnboardingService';
import type { KnowledgeService } from '../../application/services/KnowledgeService';
import type { AutomationService } from '../../application/services/AutomationService';
import type { WorkflowService } from '../../application/services/WorkflowService';
import type { BillingService } from '../../application/services/BillingService';
import type { MarketplaceService } from '../../application/services/MarketplaceService';
import type { CopilotService } from '../../application/services/CopilotService';
import type { IntegrationService } from '../../application/services/IntegrationService';
import type { ObservabilityService } from '../../application/services/ObservabilityService';
import type { DeveloperService } from '../../application/services/DeveloperService';
import type { HandleIncomingMessage } from '../../application/use-cases/HandleIncomingMessage';
import { CurrentUser } from '../../domain/auth/CurrentUser';
import type { EventBus } from '../../domain/realtime/EventBus';
import type { LogRepository } from '../../domain/ports/LogRepository';
import type { ProductRepository } from '../../domain/ports/ProductRepository';
import {
  normalizeTenantId,
  runWithTenant,
} from '../../domain/tenant/TenantContext';
import { DEFAULT_TENANT_ID } from '../../domain/tenant/tenantDto';
import { env } from '../../infrastructure/config/env';
import type { WhatsAppIdempotencyGate } from '../../infrastructure/messaging/WhatsAppMessageIdempotency';
import { logger } from '../../infrastructure/logging/logger';
import { InMemoryEventBus } from '../../infrastructure/realtime/InMemoryEventBus';
import { ClientService as ClientServiceImpl } from '../../application/services/ClientService';
import { ConversationDetailService as ConversationDetailServiceImpl } from '../../application/services/ConversationDetailService';
import { ConversationService as ConversationServiceImpl } from '../../application/services/ConversationService';
import { DashboardService as DashboardServiceImpl } from '../../application/services/DashboardService';
import { PipelineService as PipelineServiceImpl } from '../../application/services/PipelineService';
import { TaskService as TaskServiceImpl } from '../../application/services/TaskService';
import { AnalyticsService as AnalyticsServiceImpl } from '../../application/services/AnalyticsService';
import { CompanyService as CompanyServiceImpl } from '../../application/services/CompanyService';
import { OnboardingService as OnboardingServiceImpl } from '../../application/services/OnboardingService';
import { KnowledgeService as KnowledgeServiceImpl } from '../../application/services/KnowledgeService';
import { AutomationService as AutomationServiceImpl } from '../../application/services/AutomationService';
import { WorkflowService as WorkflowServiceImpl } from '../../application/services/WorkflowService';
import { BillingService as BillingServiceImpl } from '../../application/services/BillingService';
import { MarketplaceService as MarketplaceServiceImpl } from '../../application/services/MarketplaceService';
import { CopilotService as CopilotServiceImpl } from '../../application/services/CopilotService';
import { IntegrationService as IntegrationServiceImpl } from '../../application/services/IntegrationService';
import { ObservabilityService as ObservabilityServiceImpl } from '../../application/services/ObservabilityService';
import { DeveloperService as DeveloperServiceImpl } from '../../application/services/DeveloperService';
import { PasswordHasher } from '../../infrastructure/auth/PasswordHasher';
import { SQLiteClientRepository } from '../../infrastructure/persistence/SQLiteClientRepository';
import { SQLiteConversationDetailRepository } from '../../infrastructure/persistence/SQLiteConversationDetailRepository';
import { SQLiteConversationRepository } from '../../infrastructure/persistence/SQLiteConversationRepository';
import { SQLiteDashboardRepository } from '../../infrastructure/persistence/SQLiteDashboardRepository';
import { SQLitePipelineRepository } from '../../infrastructure/persistence/SQLitePipelineRepository';
import { SQLiteTaskRepository } from '../../infrastructure/persistence/SQLiteTaskRepository';
import { SQLiteAnalyticsRepository } from '../../infrastructure/persistence/SQLiteAnalyticsRepository';
import { SQLiteCompanyRepository } from '../../infrastructure/persistence/SQLiteCompanyRepository';
import { SQLiteOnboardingRepository } from '../../infrastructure/persistence/SQLiteOnboardingRepository';
import { SQLiteKnowledgeRepository } from '../../infrastructure/persistence/SQLiteKnowledgeRepository';
import { SQLiteAutomationRepository } from '../../infrastructure/persistence/SQLiteAutomationRepository';
import { SQLiteWorkflowRepository } from '../../infrastructure/persistence/SQLiteWorkflowRepository';
import { SQLiteBillingRepository } from '../../infrastructure/persistence/SQLiteBillingRepository';
import { SQLiteTemplateRepository } from '../../infrastructure/persistence/SQLiteTemplateRepository';
import { SQLitePromptRepository } from '../../infrastructure/persistence/SQLitePromptRepository';
import { SQLiteConnectorRepository } from '../../infrastructure/persistence/SQLiteConnectorRepository';
import { SQLiteObservabilityRepository } from '../../infrastructure/persistence/SQLiteObservabilityRepository';
import { SQLiteApiKeyRepository } from '../../infrastructure/persistence/SQLiteApiKeyRepository';
import { LocalPromptProvider } from '../../infrastructure/ai/LocalPromptProvider';
import { SQLiteTenantRepository } from '../../infrastructure/persistence/SQLiteTenantRepository';
import { SQLiteUserRepository } from '../../infrastructure/persistence/SQLiteUserRepository';
import { createChatRouter } from './routes/chatRoutes';
import { createCustomerRouter } from './routes/customerRoutes';
import {
  createDashboardRouter,
  getDashboardStaticPath,
} from './routes/dashboardRoutes';
import { createDashboardApiRouter } from './routes/dashboardApiRoutes';
import { createConversationsApiRouter } from './routes/conversationsApiRoutes';
import { createClientsApiRouter } from './routes/clientsApiRoutes';
import { createPipelineApiRouter } from './routes/pipelineApiRoutes';
import { createTasksApiRouter } from './routes/tasksApiRoutes';
import { createAnalyticsApiRouter } from './routes/analyticsApiRoutes';
import { createCompanyApiRouter } from './routes/companyApiRoutes';
import { createOnboardingApiRouter } from './routes/onboardingApiRoutes';
import { createKnowledgeApiRouter } from './routes/knowledgeApiRoutes';
import { createAutomationsApiRouter } from './routes/automationsApiRoutes';
import { createWorkflowsApiRouter } from './routes/workflowsApiRoutes';
import { createBillingApiRouter } from './routes/billingApiRoutes';
import { createMarketplaceApiRouter } from './routes/marketplaceApiRoutes';
import { createCopilotApiRouter } from './routes/copilotApiRoutes';
import { createIntegrationsApiRouter } from './routes/integrationsApiRoutes';
import { createObservabilityApiRouter } from './routes/observabilityApiRoutes';
import { createDeveloperApiRouter } from './routes/developerApiRoutes';
import { createAuthRouter } from './routes/authRoutes';
import { createEventsRouter } from './routes/eventsRoutes';
import { SseController } from './sse/SseController';
import {
  extractBearerToken,
  requireAuth,
} from './middleware/authMiddleware';
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
  dashboardService?: DashboardService;
  conversationService?: ConversationService;
  conversationDetailService?: ConversationDetailService;
  clientService?: ClientService;
  pipelineService?: PipelineService;
  taskService?: TaskService;
  analyticsService?: AnalyticsService;
  companyService?: CompanyService;
  onboardingService?: OnboardingService;
  knowledgeService?: KnowledgeService;
  automationService?: AutomationService;
  workflowService?: WorkflowService;
  billingService?: BillingService;
  marketplaceService?: MarketplaceService;
  copilotService?: CopilotService;
  integrationService?: IntegrationService;
  observabilityService?: ObservabilityService;
  developerService?: DeveloperService;
  eventBus?: EventBus;
  /** Auth SaaS. Si se omite, APIs dashboard no exigen JWT (tests legacy). */
  authService?: AuthService;
  /** Override env.auth.required. */
  authRequired?: boolean;
  /** Override seguridad del webhook WhatsApp (tests Production Sprint 1). */
  whatsappSecurity?: {
    appSecret?: string;
    requireSignature?: boolean;
  };
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  const authRequired =
    deps.authRequired ?? (deps.authService ? env.auth.required : false);

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
  /** Captura raw body para X-Hub-Signature-256 (Meta WhatsApp). */
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );

  /**
   * TenantContext + CurrentUser.
   * Bearer / access_token → usuario + tenant del JWT.
   * Si no: tenant default (WhatsApp / canal).
   */
  app.use((req, _res, next) => {
    const defaultTenant = normalizeTenantId(
      req.header('x-tenant-id') || env.tenantId || DEFAULT_TENANT_ID,
    );

    const token =
      extractBearerToken(req) ||
      (typeof req.query.access_token === 'string'
        ? req.query.access_token
        : null);

    if (deps.authService && token) {
      const user = deps.authService.authenticate(token);
      if (user) {
        CurrentUser.run(user, () => {
          runWithTenant(user.tenantId, () => next());
        });
        return;
      }
    }

    runWithTenant(defaultTenant, () => next());
  });

  if (deps.authService) {
    app.use('/api', createAuthRouter(deps.authService));
  }

  const guard: Array<
    (req: Request, res: Response, next: NextFunction) => void
  > = authRequired ? [requireAuth] : [];

  /**
   * /api/debug deshabilitado fuera de WHATSAPP_DEBUG_API (siempre en production).
   * Se monta antes de los catch-all `/api` para devolver 404 y no 401.
   */
  if (!env.whatsapp.debugApiEnabled) {
    app.use('/api/debug', (_req, res) => {
      res.sendStatus(404);
    });
  }

  // CRM (UI estática + API de leads reales)
  app.use('/dashboard', express.static(getDashboardStaticPath()));
  app.use('/dashboard', createDashboardRouter());

  const dashboardService =
    deps.dashboardService ??
    new DashboardServiceImpl(new SQLiteDashboardRepository(':memory:'));
  app.use('/api/dashboard', ...guard, createDashboardApiRouter(dashboardService));

  const conversationService =
    deps.conversationService ??
    new ConversationServiceImpl(new SQLiteConversationRepository(':memory:'));
  const conversationDetailService =
    deps.conversationDetailService ??
    new ConversationDetailServiceImpl(
      new SQLiteConversationDetailRepository(':memory:'),
    );
  app.use(
    '/api/conversations',
    ...guard,
    createConversationsApiRouter(conversationService, conversationDetailService),
  );

  const clientService =
    deps.clientService ??
    new ClientServiceImpl(new SQLiteClientRepository(':memory:'));
  app.use('/api/clients', ...guard, createClientsApiRouter(clientService));

  const pipelineService =
    deps.pipelineService ??
    new PipelineServiceImpl(new SQLitePipelineRepository(':memory:'));
  app.use('/api/pipeline', ...guard, createPipelineApiRouter(pipelineService));

  const taskService =
    deps.taskService ??
    new TaskServiceImpl(new SQLiteTaskRepository(':memory:'));
  app.use('/api/tasks', ...guard, createTasksApiRouter(taskService));

  const analyticsService =
    deps.analyticsService ??
    new AnalyticsServiceImpl(new SQLiteAnalyticsRepository(':memory:'));
  app.use('/api/analytics', ...guard, createAnalyticsApiRouter(analyticsService));

  const companyService =
    deps.companyService ??
    new CompanyServiceImpl(new SQLiteCompanyRepository(':memory:'));
  app.use('/api/company', ...guard, createCompanyApiRouter(companyService));

  const onboardingService =
    deps.onboardingService ??
    new OnboardingServiceImpl(
      new SQLiteOnboardingRepository(':memory:'),
      companyService,
      new SQLiteTenantRepository(':memory:'),
      new SQLiteUserRepository(':memory:'),
      new PasswordHasher(),
    );
  app.use(
    '/api/onboarding',
    ...guard,
    createOnboardingApiRouter(onboardingService),
  );

  const knowledgeService =
    deps.knowledgeService ??
    new KnowledgeServiceImpl(new SQLiteKnowledgeRepository(':memory:'));
  app.use('/api/knowledge', ...guard, createKnowledgeApiRouter(knowledgeService));

  const eventBus = deps.eventBus ?? new InMemoryEventBus();
  const automationService =
    deps.automationService ??
    new AutomationServiceImpl(new SQLiteAutomationRepository(':memory:'));
  if (!deps.automationService) {
    automationService.start(eventBus);
  }
  app.use(
    '/api/automations',
    ...guard,
    createAutomationsApiRouter(automationService),
  );

  const workflowService =
    deps.workflowService ??
    new WorkflowServiceImpl(
      new SQLiteWorkflowRepository(':memory:'),
      automationService,
    );
  if (!deps.workflowService) {
    workflowService.start(eventBus);
  }
  app.use('/api/workflows', ...guard, createWorkflowsApiRouter(workflowService));

  const billingService =
    deps.billingService ??
    new BillingServiceImpl(new SQLiteBillingRepository(':memory:'));
  if (!deps.billingService) {
    billingService.start(eventBus);
  }
  app.use('/api', ...guard, createBillingApiRouter(billingService));

  const marketplaceService =
    deps.marketplaceService ??
    new MarketplaceServiceImpl(new SQLiteTemplateRepository(':memory:'), {
      knowledge: knowledgeService,
      automation: automationService,
      workflow: workflowService,
      company: companyService,
    });
  app.use('/api', ...guard, createMarketplaceApiRouter(marketplaceService));

  const copilotService =
    deps.copilotService ??
    new CopilotServiceImpl(
      new SQLitePromptRepository(':memory:'),
      new LocalPromptProvider(),
      {
        knowledge: knowledgeService,
        automation: automationService,
        workflow: workflowService,
        company: companyService,
        marketplace: marketplaceService,
        billing: billingService,
      },
    );
  app.use('/api', ...guard, createCopilotApiRouter(copilotService));

  const integrationService =
    deps.integrationService ??
    new IntegrationServiceImpl(new SQLiteConnectorRepository(':memory:'));
  app.use('/api', ...guard, createIntegrationsApiRouter(integrationService));

  const observabilityService =
    deps.observabilityService ??
    new ObservabilityServiceImpl(
      new SQLiteObservabilityRepository(':memory:'),
      {
        knowledge: knowledgeService,
        automation: automationService,
        workflow: workflowService,
        marketplace: marketplaceService,
        billing: billingService,
        integration: integrationService,
        copilot: copilotService,
        eventBus,
      },
    );
  app.use(
    '/api',
    ...guard,
    createObservabilityApiRouter(observabilityService),
  );

  const developerService =
    deps.developerService ??
    new DeveloperServiceImpl(new SQLiteApiKeyRepository(':memory:'));
  app.use('/api', ...guard, createDeveloperApiRouter(developerService));

  const sseController = new SseController(eventBus);
  app.use('/events', ...guard, createEventsRouter(sseController));

  app.use(createHealthRouter());
  app.use('/api/leads', ...guard, createLeadRouter(deps.leadService));
  app.use(
    '/api/customers',
    ...guard,
    createCustomerRouter(deps.customerProfileService, deps.interactionService),
  );
  app.use(
    '/api/chat',
    ...guard,
    createChatRouter(deps.handleIncomingMessage),
  );
  app.use('/api/products', createProductRouter(deps.products));
  app.use('/api/logs', ...guard, createLogsRouter(deps.logs));
  app.use(
    '/webhook/whatsapp',
    createWhatsAppRouter(
      deps.handleIncomingMessage,
      env.whatsapp.verifyToken,
      deps.whatsappIdempotency,
      {
        appSecret:
          deps.whatsappSecurity?.appSecret ?? env.whatsapp.appSecret,
        requireSignature:
          deps.whatsappSecurity?.requireSignature ??
          env.whatsapp.signatureRequired,
      },
    ),
  );
  /** /api/debug solo fuera de production y con WHATSAPP_DEBUG_API=true */
  if (env.whatsapp.debugApiEnabled) {
    app.use('/api/debug', createWhatsAppAuditRouter(env.whatsapp.verifyToken));
  }
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.exception('Unhandled HTTP error', err, {
      service: 'HTTP',
      operation: 'expressErrorMiddleware',
    });
    res.status(500).json({
      error: 'Internal server error',
    });
  });

  return app;
}
