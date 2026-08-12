import { ConversationEngine } from '../../application/services/ConversationEngine';
import { CustomerProfileService } from '../../application/services/CustomerProfileService';
import { InteractionService } from '../../application/services/InteractionService';
import { LeadService } from '../../application/services/LeadService';
import { NotificationService } from '../../application/services/NotificationService';
import { RecommendationService } from '../../application/services/RecommendationService';
import { VehicleInterpreter } from '../../application/services/VehicleInterpreter';
import { buildVehicleCatalogIndexFromHits } from '../../application/services/VehicleCatalogIndex';
import { BatteryRecommendationEngine } from '../../application/services/BatteryRecommendationEngine';
import { RecommendationPresenter } from '../../application/services/RecommendationPresenter';
import { SalesFlowEngine } from '../../application/services/SalesFlowEngine';
import { ConversationOrchestrator } from '../../application/services/ConversationOrchestrator';
import { MetricsService } from '../../application/services/MetricsService';
import { KnowledgeRepository } from '../../application/services/KnowledgeRepository';
import { KnowledgeEngine } from '../../application/services/KnowledgeEngine';
import { KnowledgeService } from '../../application/services/KnowledgeService';
import { AutomationService } from '../../application/services/AutomationService';
import { WorkflowService } from '../../application/services/WorkflowService';
import { BillingService } from '../../application/services/BillingService';
import { MarketplaceService } from '../../application/services/MarketplaceService';
import { CopilotService } from '../../application/services/CopilotService';
import { IntegrationService } from '../../application/services/IntegrationService';
import { ObservabilityService } from '../../application/services/ObservabilityService';
import { DeveloperService } from '../../application/services/DeveloperService';
import { ConversationMemory } from '../../application/services/ConversationMemory';
import { ConversationRecoveryEngine } from '../../application/services/ConversationRecoveryEngine';
import { WaIdTurnQueue } from '../../application/concurrency/WaIdTurnQueue';
import { WaIdTurnSerializer } from '../../application/concurrency/WaIdTurnSerializer';
import { HandleIncomingMessage } from '../../application/use-cases/HandleIncomingMessage';
import { SqliteWaIdTurnLock } from '../messaging/SqliteWaIdTurnLock';
import { SqliteWhatsAppMessageIdempotency } from '../messaging/SqliteWhatsAppMessageIdempotency';
import { LearningEngine } from '../../application/services/LearningEngine';
import { DashboardService } from '../../application/services/DashboardService';
import { ConversationService } from '../../application/services/ConversationService';
import { ConversationDetailService } from '../../application/services/ConversationDetailService';
import { ClientService } from '../../application/services/ClientService';
import { PipelineService } from '../../application/services/PipelineService';
import { TaskService } from '../../application/services/TaskService';
import { AnalyticsService } from '../../application/services/AnalyticsService';
import { RealtimeService } from '../../application/services/RealtimeService';
import { TenantService } from '../../application/services/TenantService';
import { AuthService } from '../../application/services/AuthService';
import { CompanyService } from '../../application/services/CompanyService';
import { OnboardingService } from '../../application/services/OnboardingService';
import { InMemoryEventBus } from '../realtime/InMemoryEventBus';
import { JwtService } from '../auth/JwtService';
import { PasswordHasher } from '../auth/PasswordHasher';
import { SQLitePersistenceRepository } from '../persistence/SQLitePersistenceRepository';
import { SQLiteTenantRepository } from '../persistence/SQLiteTenantRepository';
import { SQLiteUserRepository } from '../persistence/SQLiteUserRepository';
import { SQLiteCompanyRepository } from '../persistence/SQLiteCompanyRepository';
import { SQLiteOnboardingRepository } from '../persistence/SQLiteOnboardingRepository';
import { SQLiteLearningRepository } from '../persistence/SQLiteLearningRepository';
import { SQLiteDashboardRepository } from '../persistence/SQLiteDashboardRepository';
import { SQLiteConversationRepository } from '../persistence/SQLiteConversationRepository';
import { SQLiteConversationDetailRepository } from '../persistence/SQLiteConversationDetailRepository';
import { SQLiteClientRepository } from '../persistence/SQLiteClientRepository';
import { SQLitePipelineRepository } from '../persistence/SQLitePipelineRepository';
import { SQLiteTaskRepository } from '../persistence/SQLiteTaskRepository';
import { SQLiteAnalyticsRepository } from '../persistence/SQLiteAnalyticsRepository';
import { SQLiteKnowledgeRepository } from '../persistence/SQLiteKnowledgeRepository';
import { SQLiteAutomationRepository } from '../persistence/SQLiteAutomationRepository';
import { SQLiteWorkflowRepository } from '../persistence/SQLiteWorkflowRepository';
import { SQLiteBillingRepository } from '../persistence/SQLiteBillingRepository';
import { SQLiteTemplateRepository } from '../persistence/SQLiteTemplateRepository';
import { SQLitePromptRepository } from '../persistence/SQLitePromptRepository';
import { SQLiteConnectorRepository } from '../persistence/SQLiteConnectorRepository';
import { SQLiteObservabilityRepository } from '../persistence/SQLiteObservabilityRepository';
import { SQLiteApiKeyRepository } from '../persistence/SQLiteApiKeyRepository';
import { LocalPromptProvider } from '../ai/LocalPromptProvider';
import path from 'path';
import fs from 'fs';
import type { AIProvider } from '../../domain/ports/AIProvider';
import type { MessagingProvider } from '../../domain/ports/MessagingProvider';
import { OpenAIProviderStub } from '../ai/OpenAIProviderStub';
import { RuleBasedAIProvider } from '../ai/RuleBasedAIProvider';
import { CatalogFileWillardBatteryKnowledge } from '../catalog/CatalogFileWillardBatteryKnowledge';
import { env } from '../config/env';
import { ConsoleMessagingProvider } from '../messaging/ConsoleMessagingProvider';
import { WhatsAppCloudProvider } from '../messaging/WhatsAppCloudProvider';
import { FileLogRepository } from '../persistence/FileLogRepository';
import { InMemoryProductRepository } from '../persistence/InMemoryProductRepository';
import { ConversationSessionProjector } from '../../application/persistence/ConversationSessionProjector';
import { ProjectingConversationRepository } from '../persistence/ProjectingConversationRepository';
import { SQLiteChatConversationRepository } from '../persistence/SQLiteChatConversationRepository';
import { SQLiteCustomerRepository } from '../persistence/SQLiteCustomerRepository';
import { SQLiteInteractionRepository } from '../persistence/SQLiteInteractionRepository';
import { SQLiteLeadRepository } from '../persistence/SQLiteLeadRepository';
import { SQLiteVehicleProfileRepository } from '../persistence/SQLiteVehicleProfileRepository';

export function buildContainer() {
  const products = new InMemoryProductRepository();

  /** Único conocimiento Willard del flujo de baterías / WhatsApp. */
  const willardCatalogKnowledge = new CatalogFileWillardBatteryKnowledge();
  const recommendationService = new RecommendationService(willardCatalogKnowledge);
  const logs = new FileLogRepository(env.logDir);

  const notificationService = new NotificationService();
  console.log('[DI] NotificationService creado:', notificationService?.constructor?.name);

  const ai: AIProvider =
    env.aiProvider === 'openai'
      ? new OpenAIProviderStub(env.openai.apiKey, env.openai.model)
      : new RuleBasedAIProvider();

  /**
   * Producción exige ACCESS_TOKEN + PHONE_NUMBER_ID (productionGuard).
   * Console solo en development/test — nunca stub silencioso en prod.
   */
  const messaging: MessagingProvider =
    env.whatsapp.accessToken && env.whatsapp.phoneNumberId
      ? new WhatsAppCloudProvider({
          accessToken: env.whatsapp.accessToken,
          phoneNumberId: env.whatsapp.phoneNumberId,
          apiVersion: env.whatsapp.apiVersion,
        })
      : env.nodeEnv === 'production'
        ? (() => {
            throw new Error(
              'WhatsApp Cloud credentials missing in production — refusing ConsoleMessagingProvider',
            );
          })()
        : new ConsoleMessagingProvider();

  const vehicleCatalogIndex = buildVehicleCatalogIndexFromHits(
    willardCatalogKnowledge.exportUsableVehicleRows(),
  );
  const vehicleInterpreter = new VehicleInterpreter();
  /** Módulo 3–6: único flujo de baterías en producción (vía ConversationOrchestrator). */
  const batteryRecommendationEngine = new BatteryRecommendationEngine(
    willardCatalogKnowledge,
  );
  const recommendationPresenter = new RecommendationPresenter();
  const salesFlowEngine = new SalesFlowEngine();
  const conversationOrchestrator = new ConversationOrchestrator(
    salesFlowEngine,
    vehicleInterpreter,
    vehicleCatalogIndex,
    batteryRecommendationEngine,
    recommendationPresenter,
  );

  /** Conversation Recovery: memoria con TTL propio + motor de reanudación. */
  const conversationMemory = new ConversationMemory({
    defaultTtlMs: env.recoveryTtlMinutes * 60_000,
  });
  const conversationRecoveryEngine = new ConversationRecoveryEngine(
    conversationMemory,
  );

  /** Persistence Engine: SQLite detrás de PersistenceRepository (el resto no ve SQL). */
  const sqlitePath =
    env.sqlitePath === ':memory:'
      ? ':memory:'
      : path.isAbsolute(env.sqlitePath)
        ? env.sqlitePath
        : path.resolve(process.cwd(), env.sqlitePath);
  if (sqlitePath !== ':memory:') {
    fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  }

  /**
   * CRM durable (Production Sprint 2) — mismos puertos, SQLite + tenant_id.
   * Cero InMemory*Repository de CRM en el path de producción.
   */
  const customers = new SQLiteCustomerRepository(sqlitePath);
  const crmConversations = new SQLiteChatConversationRepository(sqlitePath);
  const leadRepository = new SQLiteLeadRepository(sqlitePath);
  const vehicleProfiles = new SQLiteVehicleProfileRepository(sqlitePath);
  const interactions = new SQLiteInteractionRepository(sqlitePath);
  const leadService = new LeadService(
    leadRepository,
    notificationService,
    interactions,
  );
  console.log('[DI] LeadService creado con NotificationService + SQLite CRM');
  const customerProfileService = new CustomerProfileService(
    customers,
    leadRepository,
    vehicleProfiles,
    interactions,
  );
  const interactionService = new InteractionService(interactions);

  /**
   * Knowledge Manager (SQLite) + KnowledgeEngine.
   * Solo cambia la fuente de artículos FAQ; la API pública del engine no se toca.
   */
  const sqliteKnowledgeRepository = new SQLiteKnowledgeRepository(sqlitePath);
  sqliteKnowledgeRepository.seedDefaultsIfEmpty();
  const knowledgeManagerService = new KnowledgeService(sqliteKnowledgeRepository);
  const knowledgeRepository = new KnowledgeRepository(
    willardCatalogKnowledge,
    undefined,
    sqliteKnowledgeRepository,
  );
  const knowledgeEngine = new KnowledgeEngine(knowledgeRepository);

  /** tenantId vía TenantContext ALS (default rodacenter); no se fija en el motor. */
  const persistenceRepository = new SQLitePersistenceRepository(sqlitePath, {
    defaultTtlMs: env.persistenceTtlMinutes * 60_000,
  });

  /** R2: CRM save → proyección persisted_sessions (writer único). */
  const conversations = new ProjectingConversationRepository(
    crmConversations,
    persistenceRepository,
    new ConversationSessionProjector(),
  );

  /** Learning Engine: analítica en SQLite (mismo archivo, tablas propias). */
  const learningRepository = new SQLiteLearningRepository(sqlitePath);
  const learningEngine = new LearningEngine(learningRepository);

  /** Multi-tenant: catálogo + tenant por defecto rodacenter. */
  const tenantRepository = new SQLiteTenantRepository(sqlitePath);
  const tenantService = new TenantService(tenantRepository);
  tenantService.ensureDefault();

  /** Auth SaaS (usuarios por tenant). ConversationEngine no conoce usuarios. */
  const userRepository = new SQLiteUserRepository(sqlitePath);
  const passwordHasher = new PasswordHasher();
  const jwtService = new JwtService(env.jwtSecret, env.jwtTtlSeconds);
  const authService = new AuthService(userRepository, jwtService, passwordHasher);
  authService.ensureSeedAdmin({
    tenantId: env.tenantId || 'rodacenter',
    email: env.auth.adminEmail,
    name: env.auth.adminName,
    password: env.auth.adminPassword,
  });

  /** Dashboard API: lectura SQLite independiente (no modifica motores). */
  const dashboardRepository = new SQLiteDashboardRepository(sqlitePath);
  const dashboardService = new DashboardService(dashboardRepository);

  /** Conversations API (lista + detalle para Dashboard Sprint 2–3). */
  const conversationListRepository = new SQLiteConversationRepository(sqlitePath);
  const conversationService = new ConversationService(conversationListRepository);
  const conversationDetailRepository = new SQLiteConversationDetailRepository(
    sqlitePath,
  );
  const conversationDetailService = new ConversationDetailService(
    conversationDetailRepository,
    willardCatalogKnowledge,
  );

  /** Client API (agregación por waId — Dashboard Sprint 4). */
  const clientRepository = new SQLiteClientRepository(sqlitePath);
  const clientService = new ClientService(clientRepository);

  /** Pipeline API (Kanban SalesFlow — Dashboard Sprint 5). */
  const pipelineRepository = new SQLitePipelineRepository(sqlitePath);
  const pipelineService = new PipelineService(pipelineRepository);

  /** Task Center API (tareas comerciales — Dashboard Sprint 6). */
  const taskRepository = new SQLiteTaskRepository(sqlitePath);
  const taskService = new TaskService(taskRepository);

  /** Analytics API (analítica comercial — Dashboard Sprint 7). */
  const analyticsRepository = new SQLiteAnalyticsRepository(sqlitePath);
  const analyticsService = new AnalyticsService(analyticsRepository);

  /** Company API (white-label — Dashboard Sprint 11). */
  const companyRepository = new SQLiteCompanyRepository(sqlitePath);
  const companyService = new CompanyService(companyRepository);

  /** Onboarding wizard (Sprint 12) — reutiliza company/users/tenants. */
  const onboardingRepository = new SQLiteOnboardingRepository(sqlitePath);
  const onboardingService = new OnboardingService(
    onboardingRepository,
    companyService,
    tenantRepository,
    userRepository,
    passwordHasher,
  );

  /** Realtime SSE (EventBus en memoria — Dashboard Sprint 8). */
  const eventBus = new InMemoryEventBus();
  const realtimeService = new RealtimeService(eventBus);

  /** Automation Manager (Sprint 14) — escucha EventBus; no modifica motores. */
  const sqliteAutomationRepository = new SQLiteAutomationRepository(sqlitePath);
  const automationService = new AutomationService(sqliteAutomationRepository);
  automationService.start(eventBus);

  /** Workflow Builder (Sprint 15) — orquestación; reutiliza AutomationService. */
  const sqliteWorkflowRepository = new SQLiteWorkflowRepository(sqlitePath);
  const workflowService = new WorkflowService(
    sqliteWorkflowRepository,
    automationService,
  );
  workflowService.start(eventBus);

  /** Billing & Subscription (Sprint 17) — SaaS; no bloquea módulos. */
  const sqliteBillingRepository = new SQLiteBillingRepository(sqlitePath);
  const billingService = new BillingService(sqliteBillingRepository);
  billingService.start(eventBus);

  /** Marketplace de plantillas (Sprint 18) — consume APIs públicas. */
  const sqliteTemplateRepository = new SQLiteTemplateRepository(sqlitePath);
  const marketplaceService = new MarketplaceService(sqliteTemplateRepository, {
    knowledge: knowledgeManagerService,
    automation: automationService,
    workflow: workflowService,
    company: companyService,
  });

  /** AI Copilot (Sprint 19) — capa nueva; consume APIs públicas. */
  const sqlitePromptRepository = new SQLitePromptRepository(sqlitePath);
  const copilotAiProvider = new LocalPromptProvider();
  const copilotService = new CopilotService(
    sqlitePromptRepository,
    copilotAiProvider,
    {
      knowledge: knowledgeManagerService,
      automation: automationService,
      workflow: workflowService,
      company: companyService,
      marketplace: marketplaceService,
      billing: billingService,
    },
  );

  /** Integration Hub (Sprint 20) — conectores externos desacoplados. */
  const sqliteConnectorRepository = new SQLiteConnectorRepository(sqlitePath);
  const integrationService = new IntegrationService(sqliteConnectorRepository);

  /** Observability & Operations (Sprint 21) — monitoreo desacoplado. */
  const sqliteObservabilityRepository = new SQLiteObservabilityRepository(
    sqlitePath,
  );
  const observabilityService = new ObservabilityService(
    sqliteObservabilityRepository,
    {
      knowledge: knowledgeManagerService,
      automation: automationService,
      workflow: workflowService,
      marketplace: marketplaceService,
      billing: billingService,
      integration: integrationService,
      copilot: copilotService,
      eventBus,
      aiProvider: ai,
    },
  );

  /** Developer Platform (Sprint 22) — API Keys hasheadas + SDKs. */
  const sqliteApiKeyRepository = new SQLiteApiKeyRepository(sqlitePath);
  const developerService = new DeveloperService(sqliteApiKeyRepository);

  const engine = new ConversationEngine(
    products,
    {
      appName: env.appName,
      companyName: env.companyName,
    },
    conversationOrchestrator,
    recommendationService,
    knowledgeEngine,
    conversationRecoveryEngine,
    persistenceRepository,
    env.persistenceTtlMinutes * 60_000,
    learningEngine,
  );

  /** Hardening: métricas independientes del flujo conversacional. */
  const metricsService = new MetricsService();

  /** Un turno a la vez por wa_id (in-process + lease SQLite para overlapping deploys). */
  const waIdTurnSerializer = new WaIdTurnSerializer(
    new WaIdTurnQueue(),
    new SqliteWaIdTurnLock(sqlitePath),
  );

  /** Misma SQLITE_PATH que CRM / sessions / locks — claim atómico de wamid. */
  const whatsappIdempotency = new SqliteWhatsAppMessageIdempotency(sqlitePath, {
    legacyFilePath: env.whatsapp.idempotencyPath,
  });

  const handleIncomingMessage = new HandleIncomingMessage(
    customers,
    conversations,
    logs,
    engine,
    messaging,
    leadService,
    env.sessionTtlMinutes,
    metricsService,
    env.timeouts,
    waIdTurnSerializer,
    whatsappIdempotency,
    realtimeService,
    notificationService,
  );

  return {
    customers,
    conversations,
    products,
    willardCatalogKnowledge,
    recommendationService,
    batteryRecommendationEngine,
    recommendationPresenter,
    salesFlowEngine,
    conversationOrchestrator,
    metricsService,
    knowledgeRepository,
    knowledgeEngine,
    sqliteKnowledgeRepository,
    knowledgeManagerService,
    conversationMemory,
    conversationRecoveryEngine,
    persistenceRepository,
    learningRepository,
    learningEngine,
    dashboardRepository,
    dashboardService,
    conversationListRepository,
    conversationService,
    conversationDetailRepository,
    conversationDetailService,
    clientRepository,
    clientService,
    pipelineRepository,
    pipelineService,
    taskRepository,
    taskService,
    analyticsRepository,
    analyticsService,
    companyRepository,
    companyService,
    onboardingRepository,
    onboardingService,
    tenantRepository,
    tenantService,
    userRepository,
    passwordHasher,
    jwtService,
    authService,
    eventBus,
    realtimeService,
    sqliteAutomationRepository,
    automationService,
    sqliteWorkflowRepository,
    workflowService,
    sqliteBillingRepository,
    billingService,
    sqliteTemplateRepository,
    marketplaceService,
    sqlitePromptRepository,
    copilotAiProvider,
    copilotService,
    sqliteConnectorRepository,
    integrationService,
    sqliteObservabilityRepository,
    observabilityService,
    sqliteApiKeyRepository,
    developerService,
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
    whatsappIdempotency,
    sqlitePath,
  };
}

export type AppContainer = ReturnType<typeof buildContainer>;
