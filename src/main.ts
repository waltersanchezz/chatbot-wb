import path from 'path';
import { env } from './infrastructure/config/env';
import { buildContainer } from './infrastructure/di/container';
import { FileWhatsAppMessageIdempotency } from './infrastructure/messaging/WhatsAppMessageIdempotency';
import { logger } from './infrastructure/logging/logger';
import { createApp } from './presentation/http/createApp';

async function bootstrap(): Promise<void> {
  const container = buildContainer();
  const whatsappIdempotency = new FileWhatsAppMessageIdempotency(
    path.join(env.logDir, 'whatsapp-processed-wamids.json'),
  );
  const app = createApp({
    handleIncomingMessage: container.handleIncomingMessage,
    products: container.products,
    logs: container.logs,
    leadService: container.leadService,
    customerProfileService: container.customerProfileService,
    interactionService: container.interactionService,
    whatsappIdempotency,
  });

  app.listen(env.port, () => {
    logger.info(`${env.appName} listening`, {
      port: env.port,
      company: env.companyName,
      aiProvider: env.aiProvider,
      env: env.nodeEnv,
      whatsappIdempotency: 'file',
    });
  });
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', {
    error: err instanceof Error ? err.message : 'unknown',
  });
  process.exit(1);
});
