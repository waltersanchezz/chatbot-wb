import fs from 'fs';
import { env } from './infrastructure/config/env';
import { assertProductionReady } from './infrastructure/config/productionGuard';
import { buildContainer } from './infrastructure/di/container';
import { logger } from './infrastructure/logging/logger';
import { createApp } from './presentation/http/createApp';

async function bootstrap(): Promise<void> {
  assertProductionReady(env);

  fs.mkdirSync(env.dataDir, { recursive: true });
  fs.mkdirSync(env.logDir, { recursive: true });

  const container = buildContainer();
  /** Idempotencia SQLite: misma ruta que CRM / sessions / wa_id locks (container.sqlitePath). */
  const app = createApp({
    handleIncomingMessage: container.handleIncomingMessage,
    products: container.products,
    logs: container.logs,
    leadService: container.leadService,
    customerProfileService: container.customerProfileService,
    interactionService: container.interactionService,
    whatsappIdempotency: container.whatsappIdempotency,
    dashboardService: container.dashboardService,
    conversationService: container.conversationService,
    conversationDetailService: container.conversationDetailService,
    clientService: container.clientService,
    pipelineService: container.pipelineService,
    taskService: container.taskService,
    analyticsService: container.analyticsService,
    companyService: container.companyService,
    onboardingService: container.onboardingService,
    knowledgeService: container.knowledgeManagerService,
    automationService: container.automationService,
    workflowService: container.workflowService,
    billingService: container.billingService,
    marketplaceService: container.marketplaceService,
    copilotService: container.copilotService,
    integrationService: container.integrationService,
    observabilityService: container.observabilityService,
    developerService: container.developerService,
    eventBus: container.eventBus,
    authService: container.authService,
  });

  app.listen(env.port, () => {
    logger.info(`${env.appName} listening`, {
      port: env.port,
      company: env.companyName,
      aiProvider: env.aiProvider,
      env: env.nodeEnv,
      dataDir: env.dataDir,
      sqlitePath: container.sqlitePath,
      whatsappIdempotencyPath: env.whatsapp.idempotencyPath,
      whatsappSignatureRequired: env.whatsapp.signatureRequired,
      authRequired: env.auth.required,
    });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.message : 'unknown',
  });
  process.exit(1);
});
