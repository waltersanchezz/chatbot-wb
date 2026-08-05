import fs from 'fs';
import { env } from './infrastructure/config/env';
import { assertProductionReady } from './infrastructure/config/productionGuard';
import { buildContainer } from './infrastructure/di/container';
import { FileWhatsAppMessageIdempotency } from './infrastructure/messaging/WhatsAppMessageIdempotency';
import { logger } from './infrastructure/logging/logger';
import { createApp } from './presentation/http/createApp';

async function bootstrap(): Promise<void> {
  assertProductionReady(env);

  fs.mkdirSync(env.dataDir, { recursive: true });
  fs.mkdirSync(env.logDir, { recursive: true });

  const container = buildContainer();
  const whatsappIdempotency = new FileWhatsAppMessageIdempotency(
    env.whatsapp.idempotencyPath,
  );
  const app = createApp({
    handleIncomingMessage: container.handleIncomingMessage,
    products: container.products,
    logs: container.logs,
    leadService: container.leadService,
    customerProfileService: container.customerProfileService,
    interactionService: container.interactionService,
    whatsappIdempotency,
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
      sqlitePath: env.sqlitePath,
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
