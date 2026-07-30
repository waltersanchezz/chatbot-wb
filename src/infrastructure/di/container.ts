import { ConversationEngine } from '../../application/services/ConversationEngine';
import { CustomerProfileService } from '../../application/services/CustomerProfileService';
import { InteractionService } from '../../application/services/InteractionService';
import { LeadService } from '../../application/services/LeadService';
import { NotificationService } from '../../application/services/NotificationService';
import { RecommendationService } from '../../application/services/RecommendationService';
import { HandleIncomingMessage } from '../../application/use-cases/HandleIncomingMessage';
import type { AIProvider } from '../../domain/ports/AIProvider';
import type { MessagingProvider } from '../../domain/ports/MessagingProvider';
import { OpenAIProviderStub } from '../ai/OpenAIProviderStub';
import { RuleBasedAIProvider } from '../ai/RuleBasedAIProvider';
import { CatalogFileWillardBatteryKnowledge } from '../catalog/CatalogFileWillardBatteryKnowledge';
import { env } from '../config/env';
import { ConsoleMessagingProvider } from '../messaging/ConsoleMessagingProvider';
import { WhatsAppCloudProvider } from '../messaging/WhatsAppCloudProvider';
import { FileLogRepository } from '../persistence/FileLogRepository';
import { InMemoryConversationRepository } from '../persistence/InMemoryConversationRepository';
import { InMemoryCustomerRepository } from '../persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../persistence/InMemoryVehicleProfileRepository';

export function buildContainer() {
  const customers = new InMemoryCustomerRepository();
  const conversations = new InMemoryConversationRepository();
  const products = new InMemoryProductRepository();

  /** Único conocimiento Willard del flujo de baterías / WhatsApp. */
  const willardCatalogKnowledge = new CatalogFileWillardBatteryKnowledge();
  const recommendationService = new RecommendationService(willardCatalogKnowledge);
  const logs = new FileLogRepository(env.logDir);

  // CRM: memoria ahora → mañana Postgres*Repository (mismo puerto).
  const leadRepository = new InMemoryLeadRepository();
  const vehicleProfiles = new InMemoryVehicleProfileRepository();
  const interactions = new InMemoryInteractionRepository();
  const notificationService = new NotificationService();
  console.log('[DI] NotificationService creado:', notificationService?.constructor?.name);
  const leadService = new LeadService(
    leadRepository,
    notificationService,
    interactions,
  );
  console.log('[DI] LeadService creado con NotificationService + InteractionRepository');

  const customerProfileService = new CustomerProfileService(
    customers,
    leadRepository,
    vehicleProfiles,
    interactions,
  );
  const interactionService = new InteractionService(interactions);

  const ai: AIProvider =
    env.aiProvider === 'openai'
      ? new OpenAIProviderStub(env.openai.apiKey, env.openai.model)
      : new RuleBasedAIProvider();

  const messaging: MessagingProvider = env.whatsapp.accessToken
    ? new WhatsAppCloudProvider({
        accessToken: env.whatsapp.accessToken,
        phoneNumberId: env.whatsapp.phoneNumberId,
        apiVersion: env.whatsapp.apiVersion,
      })
    : new ConsoleMessagingProvider();

  const engine = new ConversationEngine(products, recommendationService, {
    appName: env.appName,
    companyName: env.companyName,
  });

  const handleIncomingMessage = new HandleIncomingMessage(
    customers,
    conversations,
    logs,
    engine,
    messaging,
    leadService,
    env.sessionTtlMinutes,
  );

  return {
    customers,
    conversations,
    products,
    willardCatalogKnowledge,
    recommendationService,
    leadRepository,
    vehicleProfiles,
    interactions,
    leadService,
    customerProfileService,
    interactionService,
    notificationService,
    logs,
    ai,
    messaging,
    engine,
    handleIncomingMessage,
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
