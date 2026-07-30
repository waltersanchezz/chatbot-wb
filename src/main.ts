import { env } from './infrastructure/config/env';
import { buildContainer } from './infrastructure/di/container';
import { logger } from './infrastructure/logging/logger';
import { createApp } from './presentation/http/createApp';

async function bootstrap(): Promise<void> {
  const container = buildContainer();
  const app = createApp({
    handleIncomingMessage: container.handleIncomingMessage,
    products: container.products,
    logs: container.logs,
    leadService: container.leadService,
    customerProfileService: container.customerProfileService,
    interactionService: container.interactionService,
  });

  app.listen(env.port, () => {
    logger.info(`${env.appName} listening`, {
      port: env.port,
      company: env.companyName,
      aiProvider: env.aiProvider,
      env: env.nodeEnv,
    });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.message : 'unknown',
  });
  process.exit(1);
});
