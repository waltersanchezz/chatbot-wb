import type { Conversation, ConversationContext } from '../../domain/entities/Conversation';
import {
  createEmptyContext,
  isTerminalHandoffContext,
} from '../../domain/entities/Conversation';
import { fromPersistedConversation } from '../../domain/persistence/persistedSession';
import type { PersistenceRepository } from '../../domain/ports/PersistenceRepository';
import type { ProductRepository } from '../../domain/ports/ProductRepository';
import type { SalesFlowSnapshot } from '../../domain/sales/salesFlow';
import type { ConversationIntent } from '../../shared/types';
import {
  FRIENDLY_ERROR_REPLY,
  tryCall,
  tryCallAsync,
  type Result,
} from '../../shared/result';
import { logger } from '../../infrastructure/logging/logger';
import {
  formatAskBrand,
  formatAskModel,
  formatAskSoundSystem,
  formatAskSoundReminder,
  formatAskVehicle,
  formatAskYear,
  formatAskYearReminder,
  formatModelClarification,
  formatVehicleConfirmation,
  isAffirmativeReply,
  isNegativeReply,
  isServiceDeclineReply,
  isExplicitSearchAnotherReply,
  recommendationRejectedCloseMessage,
  matchPendingModelOption,
} from '../flows/batteryFlow';
import {
  bearingNextQuestion,
  bearingTechnicalInfo,
  formatBearingRecommendation,
} from '../flows/bearingFlow';
import {
  handoffAlreadyActiveMessage,
  handoffMessage,
  isOutboundHandoffEcho,
} from '../flows/handoffFlow';

import { categoryPrompt, welcomeMessage, isPureGreetingMessage, midFlowGreetingAck } from '../flows/welcomeFlow';
import { normalizeWillardText } from '../../domain/willard/normalize';
import { ContextExtractor } from './ContextExtractor';
import type {
  ConversationOrchestrator,
  OrchestratorCommand,
  OrchestratorResult,
  OrchestratorSession,
} from './ConversationOrchestrator';
import type { ConversationRecoveryEngine } from './ConversationRecoveryEngine';
import {
  IntentDetector,
  isBareBatteryIntent,
  isBareBearingIntent,
  matchesBatteryIntent,
  matchesBearingIntent,
} from './IntentDetector';
import type { KnowledgeEngine } from './KnowledgeEngine';
import type { LearningEngine } from './LearningEngine';
import type { RecommendationService } from './RecommendationService';
import { SecurityGuard } from './SecurityGuard';
import {
  extractTechnicalReferences,
  isTechnicalQuestion,
  referencesFromProductIds,
} from './technicalQuestionDetector';

export interface EngineConfig {
  appName: string;
  companyName: string;
}

export interface EngineResult {
  reply: string;
  context: ConversationContext;
  /** No enviar WhatsApp (eco de handoff / handoff ya notificado). */
  suppressReply?: boolean;
}

const WILLARD_NOT_FOUND =
  'Referencia Willard no encontrada en base de conocimiento';

const ASK_INTEREST =
  '¿Te sirve esta opción? Responde *sí* para que un asesor te contacte, o *no* si quieres buscar otra.';

/**
 * Motor de diálogo del canal.
 * Flujo de baterías: delega por completo en ConversationOrchestrator
 * (VehicleInterpreter → SalesFlow → BatteryRecommendationEngine → Presenter).
 * No recomienda baterías por sí mismo.
 */
export class ConversationEngine {
  private readonly intentDetector = new IntentDetector();
  private readonly extractor = new ContextExtractor();
  private readonly security = new SecurityGuard();

  /** Marca de producción: el único camino de baterías es el orquestador. */
  readonly batteryFlowMode = 'orchestrator' as const;

  constructor(
    private readonly products: ProductRepository,
    private readonly config: EngineConfig,
    private readonly orchestrator: ConversationOrchestrator,
    /**
     * Solo resolución de etiqueta de modelo en catálogo (pending options).
     * No se usa para recomendar baterías.
     */
    private readonly modelCatalog?: RecommendationService,
    /** Smart Advisor: consultas técnicas sin alterar SalesFlow. */
    private readonly knowledgeEngine?: KnowledgeEngine,
    /** Conversation Recovery: retomar tras silencio vía ConversationMemory. */
    private readonly recoveryEngine?: ConversationRecoveryEngine,
    /**
     * Persistence Engine (SQLite detrás del puerto).
     * R2: solo load para recovery. save/delete de sessions → ProjectingConversationRepository.
     */
    private readonly persistence?: PersistenceRepository,
    _persistenceTtlMs: number = 24 * 60 * 60_000,
    /** Learning Engine: analítica local (SQLite), sin APIs externas. */
    private readonly learningEngine?: LearningEngine,
  ) {}

  async process(conversation: Conversation, userMessage: string): Promise<EngineResult> {
    const previousContext = structuredClone(conversation.context);

    const outcome = await tryCallAsync(
      () => this.processTurn(conversation, userMessage),
      { service: 'ConversationEngine', operation: 'process' },
    );

    if (outcome.ok) {
      this.persistRecoveryMemory(conversation, outcome.value.context);
      this.recordLearning(conversation, outcome.value.context, previousContext, userMessage);
      // Realtime SSE se emite en HandleIncomingMessage DESPUÉS de save OK
      // (evita carrera refetch vs SQLite y permite marcar inboundCustomerMessage).
      return outcome.value;
    }

    logger.exception('ConversationEngine.process — error controlado', outcome.error, {
      service: 'ConversationEngine',
      operation: 'process',
    });

    return {
      reply: FRIENDLY_ERROR_REPLY,
      context: {
        ...conversation.context,
        needsHumanHandoff: true,
        handoffReason: conversation.context.handoffReason ?? 'Error técnico controlado',
      },
    };
  }

  /** Turno de diálogo (puede lanzar; `process` lo convierte en Result). */
  private async processTurn(
    conversation: Conversation,
    userMessage: string,
  ): Promise<EngineResult> {
    if (this.security.isSensitiveProbe(userMessage)) {
      return {
        reply: this.security.blockedReply(),
        context: conversation.context,
      };
    }

    // Eco del propio handoff (p.ej. webhook reinyecta el texto con "asesor"):
    // no reprocesar ni reenviar el bloque completo.
    if (isOutboundHandoffEcho(userMessage)) {
      const ctx = conversation.context;
      return {
        reply: '',
        context: {
          ...ctx,
          stage: 'handoff',
          needsHumanHandoff: true,
          handoffReason:
            ctx.handoffReason ?? 'Cliente aceptó la recomendación Willard',
        },
        suppressReply: true,
      };
    }

    this.maybeRestoreFromPersistence(conversation);

    const recovered = this.tryHandleRecovery(conversation, userMessage);
    if (recovered) return recovered;

    const intentPreview = this.intentDetector.detect(
      userMessage,
      conversation.context.intent,
    );
    const contextForExtract =
      intentPreview === 'baterias' || conversation.context.category === 'baterias'
        ? { ...conversation.context, category: 'baterias' as const, intent: intentPreview }
        : intentPreview === 'rodamientos' || conversation.context.category === 'rodamientos'
          ? { ...conversation.context, category: 'rodamientos' as const, intent: intentPreview }
          : conversation.context;

    let context = this.extractor.apply(contextForExtract, userMessage);
    const intent = this.intentDetector.detect(userMessage, context.intent);
    context = { ...context, intent };

    if (intent === 'handoff') {
      if (conversation.context.needsHumanHandoff || conversation.context.stage === 'handoff') {
        return {
          reply: handoffAlreadyActiveMessage(),
          context: {
            ...context,
            stage: 'handoff',
            needsHumanHandoff: true,
            handoffReason:
              conversation.context.handoffReason ??
              context.handoffReason ??
              'Solicitud del cliente',
          },
        };
      }
      context.stage = 'handoff';
      context.needsHumanHandoff = true;
      context.handoffReason = context.handoffReason ?? 'Solicitud del cliente';
      if (context.salesFlow && context.category === 'baterias') {
        const handed = this.runOrchestrator(
          { sales: context.salesFlow },
          { type: 'SALES_EVENT', event: { type: 'REQUEST_ADVISOR' } },
        );
        context = this.mergeOrchestratorContext(context, handed);
      }
      return { reply: handoffMessage(context.handoffReason), context };
    }

    if (
      intent === 'greeting' &&
      isPureGreetingMessage(userMessage) &&
      conversation.messages.filter((m) => m.role === 'customer').length <= 1 &&
      !conversation.context.needsHumanHandoff &&
      conversation.context.stage !== 'handoff'
    ) {
      context.stage = 'awaiting_category';
      return {
        reply: welcomeMessage(
          this.config.companyName,
          this.config.appName,
          conversation.messages[0]?.metadata?.customerName as string | undefined,
        ),
        context,
      };
    }

    // Saludo puro con progreso comercial: no reemitir el prompt del paso.
    // No avanza SalesFlow / nextAction / vehicle.
    if (
      isPureGreetingMessage(userMessage) &&
      this.hasActiveCommercialProgress(conversation.context)
    ) {
      const preserved = conversation.context;
      if (preserved.needsHumanHandoff || preserved.stage === 'handoff') {
        // Reabrir canal: repetir handoffAlreadyActiveMessage lo silencia el dedup
        // de WhatsApp (mismo texto) mientras Telegram sí notifica → chat mudo.
        this.recoveryEngine?.clear(conversation.externalId);
        return {
          reply: welcomeMessage(
            this.config.companyName,
            this.config.appName,
            conversation.messages.find((m) => m.role === 'customer')?.metadata
              ?.customerName as string | undefined,
          ),
          context: {
            ...createEmptyContext(),
            stage: 'awaiting_category',
            intent: 'greeting',
          },
        };
      }
      return {
        reply: midFlowGreetingAck(),
        context: preserved,
      };
    }

    if (intent === 'baterias') {
      // Reiniciar solo con mensaje explícito ("batería"), no con "sí"/"no" sticky
      // tras closing (p.ej. confirmación de interés post-recomendación).
      const explicitBatteryStart = matchesBatteryIntent(userMessage);
      // "Bateria" a secas mid-flow no es el modelo/marca: el cliente pide el flujo.
      // Si no reiniciamos, USER_TEXT reemite el mismo prompt y el dedup silencia WhatsApp.
      const bareBatteryRestart =
        isBareBatteryIntent(userMessage) &&
        this.hasActiveCommercialProgress(conversation.context);
      const restartingAfterHandoff =
        explicitBatteryStart &&
        (conversation.context.needsHumanHandoff ||
          conversation.context.stage === 'handoff' ||
          conversation.context.stage === 'closing' ||
          bareBatteryRestart);

      context.category = 'baterias';
      context.intent = 'baterias';

      if (explicitBatteryStart) {
        context.needsHumanHandoff = false;
        context.handoffReason = undefined;
        context.recommendedProductIds = [];
      }

      if (restartingAfterHandoff) {
        context.stage = 'collecting_vehicle';
        context.vehicle = {};
        context.battery = {};
        context.pendingModelOptions = undefined;
        context.vehicleConfirmed = undefined;
        context.salesFlow = undefined;
        context.lastRecommendedReference = undefined;
        context.lastRecommendedReferences = undefined;
      } else if (
        context.stage === 'welcome' ||
        context.stage === 'awaiting_category'
      ) {
        context.stage = 'collecting_vehicle';
      }

      return this.handleBattery(context, userMessage);
    }

    if (intent === 'rodamientos') {
      const explicitBearingStart = matchesBearingIntent(userMessage);
      const bareBearingRestart =
        isBareBearingIntent(userMessage) &&
        this.hasActiveCommercialProgress(conversation.context);
      const restartingAfterHandoff =
        explicitBearingStart &&
        (conversation.context.needsHumanHandoff ||
          conversation.context.stage === 'handoff' ||
          conversation.context.stage === 'closing' ||
          bareBearingRestart);

      context.category = 'rodamientos';
      context.intent = 'rodamientos';

      if (explicitBearingStart) {
        context.needsHumanHandoff = false;
        context.handoffReason = undefined;
        context.recommendedProductIds = [];
      }

      if (restartingAfterHandoff) {
        context.stage = 'collecting_vehicle';
        context.vehicle = {};
        context.bearing = {};
      } else if (
        context.stage === 'welcome' ||
        context.stage === 'awaiting_category'
      ) {
        context.stage = 'collecting_vehicle';
      }

      return this.handleBearing(context, userMessage);
    }

    if (intent === 'otro_producto') {
      context.stage = 'handoff';
      context.needsHumanHandoff = true;
      context.handoffReason = 'Producto especial / catálogo ampliado';
      return {
        reply: [
          '💬 Claro, también manejamos retenes, grasas, lubricantes, soportes y componentes de transmisión.',
          '',
          '👨‍🔧 Uno de nuestros asesores confirmará disponibilidad y el precio actualizado para ayudarte lo antes posible.',
        ].join('\n'),
        context,
      };
    }

    // Handoff activo: no reentrar a SalesFlow por category sticky
    // (excepto start explícito "batería" / "rodamiento", ya manejado arriba).
    if (
      conversation.context.needsHumanHandoff ||
      conversation.context.stage === 'handoff'
    ) {
      return {
        reply: handoffAlreadyActiveMessage(),
        context: {
          ...conversation.context,
          stage: 'handoff',
          needsHumanHandoff: true,
          handoffReason:
            conversation.context.handoffReason ?? 'Solicitud del cliente',
        },
      };
    }

    if (context.category === 'baterias') {
      return this.handleBattery(context, userMessage);
    }
    if (context.category === 'rodamientos') {
      return this.handleBearing(context, userMessage);
    }

    if (context.stage === 'awaiting_category' || intent === 'unknown') {
      context.stage = 'awaiting_category';
      return { reply: categoryPrompt(), context };
    }

    return {
      reply: welcomeMessage(this.config.companyName, this.config.appName),
      context: { ...context, stage: 'awaiting_category', intent: 'greeting' as ConversationIntent },
    };
  }

  /**
   * Capa Conversation: decide el comando y mapea la respuesta.
   * Toda interpretación / estado / recomendación pasa por el orquestador.
   */
  private async handleBattery(
    context: ConversationContext,
    userMessage: string,
  ): Promise<EngineResult> {
    // Smart Advisor: duda técnica → KnowledgeEngine (SalesFlow intacto).
    if (this.knowledgeEngine && isTechnicalQuestion(userMessage)) {
      return this.answerTechnicalQuestion(context, userMessage);
    }

    // "bateria" a secas nunca es un dato de vehículo / sí-no de interés.
    if (isBareBatteryIntent(userMessage)) {
      const hadProgress = Boolean(
        context.vehicle.brand?.trim() ||
          context.vehicle.model?.trim() ||
          (context.salesFlow && context.salesFlow.nextAction !== 'ASK_VEHICLE'),
      );
      const started = this.runOrchestrator(this.orchestrator.createSession(), {
        type: 'START_FLOW',
      });
      const ask = formatAskVehicle();
      return {
        reply: hadProgress
          ? ['Listo, buscamos la batería de nuevo.', '', ask].join('\n')
          : ask,
        context: {
          ...this.mergeOrchestratorContext(
            {
              ...context,
              category: 'baterias',
              intent: 'baterias',
              vehicle: {},
              battery: {},
              vehicleConfirmed: undefined,
              pendingModelOptions: undefined,
              lastRecommendedReference: undefined,
              lastRecommendedReferences: undefined,
              recommendedProductIds: [],
              needsHumanHandoff: false,
              handoffReason: undefined,
            },
            started,
          ),
          vehicle: {},
          battery: {},
          stage: 'collecting_vehicle',
        },
      };
    }

    let session = this.ensureOrchestratorSession(context);
    const cleaned = userMessage.trim();
    const yearOnly = /^\d{4}$/.test(cleaned);
    let sales = session.sales;

    // Selección de modelo pendiente (capa Conversation, antes del orquestador).
    const pendingResolved = this.resolvePendingModelSelection(context, cleaned);
    if (pendingResolved.model && pendingResolved.model !== sales.vehicle.model) {
      const patched = this.runOrchestrator(session, {
        type: 'SALES_EVENT',
        event: {
          type: 'VEHICLE_UPDATED',
          vehicle: {
            model: pendingResolved.model,
            year: undefined,
            vehicleConfirmed: undefined,
            soundSystem: undefined,
          },
        },
      });
      return this.toBatteryEngineResult(
        {
          ...context,
          pendingModelOptions: undefined,
          vehicleConfirmed: undefined,
          battery: { ...context.battery, soundSystem: undefined },
        },
        patched,
      );
    }

    let result: OrchestratorResult;
    let correctionReset = false;

    if (sales.state === 'WAITING_CONFIRMATION') {
      // Nueva búsqueda solo con intención explícita (no inferir de un simple "No").
      if (isExplicitSearchAnotherReply(cleaned)) {
        result = this.runOrchestrator(session, {
          type: 'SALES_EVENT',
          event: { type: 'CUSTOMER_REJECTS_RECOMMENDATION' },
        });
        result = this.runOrchestrator(result.session, { type: 'START_FLOW' });
        const merged = this.mergeOrchestratorContext(context, result);
        return {
          reply: formatAskVehicle(),
          context: {
            ...merged,
            vehicle: {},
            battery: {},
            vehicleConfirmed: undefined,
            pendingModelOptions: undefined,
            stage: 'collecting_vehicle',
            needsHumanHandoff: false,
            handoffReason: undefined,
            recommendedProductIds: [],
          },
        };
      }

      if (isAffirmativeReply(cleaned)) {
        result = this.runOrchestrator(session, {
          type: 'SALES_EVENT',
          event: { type: 'CUSTOMER_ACCEPTS_RECOMMENDATION' },
        });
      } else if (isServiceDeclineReply(cleaned)) {
        // CLOSED + END_CONVERSATION. Sin START_FLOW / ASK_VEHICLE.
        result = this.runOrchestrator(session, {
          type: 'SALES_EVENT',
          event: { type: 'CUSTOMER_REJECTS_RECOMMENDATION' },
        });
        const merged = this.mergeOrchestratorContext(context, result);
        return {
          reply: recommendationRejectedCloseMessage(),
          context: {
            ...merged,
            needsHumanHandoff: false,
            handoffReason: undefined,
          },
        };
      } else {
        return {
          reply: ASK_INTEREST,
          context: this.mergeOrchestratorContext(context, { session }),
        };
      }
    } else if (sales.state === 'CLOSED') {
      if (isExplicitSearchAnotherReply(cleaned)) {
        result = this.runOrchestrator(session, { type: 'START_FLOW' });
        const merged = this.mergeOrchestratorContext(context, result);
        return {
          reply: formatAskVehicle(),
          context: {
            ...merged,
            vehicle: {},
            battery: {},
            vehicleConfirmed: undefined,
            pendingModelOptions: undefined,
            stage: 'collecting_vehicle',
            needsHumanHandoff: false,
            handoffReason: undefined,
            recommendedProductIds: [],
          },
        };
      }
      // Ya cerrado: no reiniciar por "No" ni re-preguntar interés.
      return {
        reply: recommendationRejectedCloseMessage(),
        context: {
          ...this.mergeOrchestratorContext(context, { session }),
          needsHumanHandoff: false,
          handoffReason: undefined,
        },
      };
    } else if (sales.nextAction === 'CONFIRM_VEHICLE') {
      if (isAffirmativeReply(cleaned)) {
        result = this.runOrchestrator(session, {
          type: 'SALES_EVENT',
          event: {
            type: 'VEHICLE_UPDATED',
            vehicle: { vehicleConfirmed: true },
          },
        });
      } else if (isNegativeReply(cleaned)) {
        result = this.runOrchestrator(session, { type: 'START_FLOW' });
        correctionReset = true;
      } else {
        result = this.runOrchestrator(session, {
          type: 'USER_TEXT',
          text: cleaned,
        });
        result = this.maybeAutoConfirmYearOnly(result, yearOnly);
      }
    } else if (sales.nextAction === 'ASK_SOUND') {
      if (isAffirmativeReply(cleaned) || isNegativeReply(cleaned)) {
        result = this.runOrchestrator(session, {
          type: 'SALES_EVENT',
          event: {
            type: 'VEHICLE_UPDATED',
            vehicle: { soundSystem: isAffirmativeReply(cleaned) },
          },
        });
      } else {
        // No reenviar el prompt largo (Meta retries / ruido): recordatorio corto distinto.
        return {
          reply: formatAskSoundReminder(),
          context: this.mergeOrchestratorContext(context, { session }),
        };
      }
    } else if (
      sales.nextAction === 'ASK_YEAR' &&
      Boolean(sales.vehicle.model?.trim())
    ) {
      // ASK_YEAR + modelo fijado: no reinterpretar texto libre vía USER_TEXT
      // cuando el modelo ya es etiqueta canónica (p. ej. tras pending selection).
      // Si el modelo es stub corto (p. ej. extractor "mazda 3"), sí hace falta
      // USER_TEXT para desambiguar All New / Skyactive.
      const modelTrimmed = sales.vehicle.model!.trim();
      const modelIsCanonicalLabel =
        modelTrimmed.split(/\s+/).filter(Boolean).length >= 3;

      if (yearOnly) {
        result = this.runOrchestrator(session, {
          type: 'SALES_EVENT',
          event: {
            type: 'VEHICLE_UPDATED',
            vehicle: { year: cleaned },
          },
        });
        result = this.maybeAutoConfirmYearOnly(result, true);
      } else if (modelIsCanonicalLabel) {
        // Input no-año (p. ej. "Hola"): un recordatorio controlado por inbound,
        // sin reenviar indefinidamente el mismo formatAskYear.
        const brand = sales.vehicle.brand?.trim() ?? '';
        return {
          reply: formatAskYearReminder(brand || 'tu vehículo', modelTrimmed),
          context: this.mergeOrchestratorContext(context, { session }),
        };
      } else {
        result = this.runOrchestrator(session, {
          type: 'USER_TEXT',
          text: cleaned,
        });
        result = this.maybeAutoConfirmYearOnly(result, yearOnly);
      }
    } else {
      result = this.runOrchestrator(session, {
        type: 'USER_TEXT',
        text: cleaned,
      });
      result = this.maybeAutoConfirmYearOnly(result, yearOnly);
    }

    // Empates de modelo del intérprete → aclaración (Conversation).
    const interpretation = result.interpretation;
    if (
      interpretation?.candidateModels?.length &&
      interpretation.unresolved === 'model'
    ) {
      const labels = interpretation.candidateModels;
      const merged = this.mergeOrchestratorContext(context, result);
      return {
        reply: formatModelClarification(labels),
        context: {
          ...merged,
          stage: 'collecting_vehicle',
          pendingModelOptions: labels,
          vehicleConfirmed: undefined,
          battery: { ...merged.battery, soundSystem: undefined },
          needsHumanHandoff: false,
          handoffReason: undefined,
          recommendedProductIds: [],
        },
      };
    }

    if (correctionReset) {
      const merged = this.mergeOrchestratorContext(context, result);
      return {
        reply: ['Sin problema, lo corregimos.', '', formatAskVehicle()].join('\n'),
        context: {
          ...merged,
          vehicle: {},
          battery: {},
          vehicleConfirmed: undefined,
          pendingModelOptions: undefined,
          stage: 'collecting_vehicle',
          needsHumanHandoff: false,
          handoffReason: undefined,
          recommendedProductIds: [],
        },
      };
    }

    return this.toBatteryEngineResult(context, result);
  }

  private maybeAutoConfirmYearOnly(
    result: OrchestratorResult,
    yearOnly: boolean,
  ): OrchestratorResult {
    if (!yearOnly) return result;
    const v = result.session.sales.vehicle;
    if (
      v.brand?.trim() &&
      v.model?.trim() &&
      v.year?.trim() &&
      !v.vehicleConfirmed &&
      result.session.sales.nextAction === 'CONFIRM_VEHICLE'
    ) {
      return this.runOrchestrator(result.session, {
        type: 'SALES_EVENT',
        event: {
          type: 'VEHICLE_UPDATED',
          vehicle: { vehicleConfirmed: true },
        },
      });
    }
    return result;
  }

  /**
   * Llama al orquestador devolviendo Result; ante fallo lanza ControlledError
   * para que `process` responda con mensaje amable (sin romper el canal).
   */
  private runOrchestrator(
    session: OrchestratorSession,
    command: OrchestratorCommand,
  ): OrchestratorResult {
    const outcome: Result<OrchestratorResult> = tryCall(
      () => this.orchestrator.handle(session, command),
      {
        service: 'ConversationOrchestrator',
        operation: 'handle',
        code: 'ORCHESTRATOR',
        meta: { commandType: command.type },
      },
    );

    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.value;
  }

  private ensureOrchestratorSession(
    context: ConversationContext,
  ): OrchestratorSession {
    let session: OrchestratorSession = context.salesFlow
      ? { sales: context.salesFlow }
      : this.orchestrator.createSession();

    if (session.sales.state === 'NEW' || !context.salesFlow) {
      session = this.runOrchestrator(session, { type: 'START_FLOW' }).session;
    }

    // Hidratar si el contexto tiene vehículo y el SalesFlow aún no (p.ej. tests / restore).
    if (!session.sales.vehicle.brand?.trim() && context.vehicle.brand?.trim()) {
      session = this.runOrchestrator(session, {
        type: 'SALES_EVENT',
        event: {
          type: 'VEHICLE_UPDATED',
          vehicle: {
            brand: context.vehicle.brand,
            model: context.vehicle.model,
            year: context.vehicle.year,
            vehicleConfirmed: context.vehicleConfirmed === true,
            soundSystem: context.battery.soundSystem,
          },
        },
      }).session;
    }

    return session;
  }

  /**
   * Responde una duda técnica sin avanzar ni reiniciar el SalesFlow.
   */
  private answerTechnicalQuestion(
    context: ConversationContext,
    userMessage: string,
  ): EngineResult {
    const knowledge = this.knowledgeEngine!;
    const salesBefore = context.salesFlow;
    const lastRef =
      context.lastRecommendedReference ??
      referencesFromProductIds(context.recommendedProductIds)[0];
    const lastRefs =
      context.lastRecommendedReferences?.length
        ? context.lastRecommendedReferences
        : referencesFromProductIds(context.recommendedProductIds);

    const response = this.resolveTechnicalKnowledge(
      knowledge,
      userMessage,
      context,
      lastRef,
      lastRefs,
    );

    // Una sola respuesta de conocimiento; no re-preguntar vehículo ni re-presentar.
    return {
      reply: response.answer,
      context: {
        ...context,
        // Preservar snapshot exacto del flujo comercial.
        salesFlow: salesBefore,
        stage: context.stage,
        vehicle: { ...context.vehicle },
        battery: { ...context.battery },
        vehicleConfirmed: context.vehicleConfirmed,
        recommendedProductIds: [...context.recommendedProductIds],
        lastRecommendedReference: context.lastRecommendedReference,
        lastRecommendedReferences: context.lastRecommendedReferences
          ? [...context.lastRecommendedReferences]
          : undefined,
        needsHumanHandoff: context.needsHumanHandoff,
        handoffReason: context.handoffReason,
        pendingModelOptions: context.pendingModelOptions,
        lastTechnicalQuestion: userMessage.trim(),
        lastTechnicalAnswer: response.answer,
      },
    };
  }

  /**
   * Conversation Recovery: oferta pendiente o saludo de retorno.
   * No toca SalesFlowEngine / RecommendationEngine / KnowledgeEngine.
   */
  private tryHandleRecovery(
    conversation: Conversation,
    userMessage: string,
  ): EngineResult | null {
    const recovery = this.recoveryEngine;
    if (!recovery) return null;

    const memoryKey = conversation.externalId;
    const cleaned = userMessage.trim();

    if (conversation.context.recoveryOfferPending) {
      // Intención explícita de producto: salir de la oferta y dejar IntentDetector
      // enrutar (evita re-emitir la misma oferta → suppressReply silencia WhatsApp).
      if (matchesBatteryIntent(cleaned) || matchesBearingIntent(cleaned)) {
        recovery.clear(memoryKey);
        conversation.context = {
          ...conversation.context,
          recoveryOfferPending: false,
        };
        return null;
      }
      if (recovery.isContinueReply(cleaned) || isAffirmativeReply(cleaned)) {
        const decision = recovery.accept(memoryKey);
        if (decision.type === 'CONTINUE') {
          return { reply: decision.message, context: decision.context };
        }
        if (decision.type === 'RESTART') {
          return { reply: decision.message, context: decision.context };
        }
      }
      if (recovery.isDeclineReply(cleaned) || isNegativeReply(cleaned)) {
        const decision = recovery.decline(memoryKey);
        // R2: no delete de persisted_sessions aquí (C2). El save CRM proyectado sobrescribe.
        if (decision.type === 'RESTART') {
          return { reply: decision.message, context: decision.context };
        }
      }
      const active = recovery.getActive(memoryKey);
      if (active) {
        return {
          reply: recovery.formatOfferMessage(active),
          context: {
            ...conversation.context,
            recoveryOfferPending: true,
          },
        };
      }
      recovery.clear(memoryKey);
      return {
        reply:
          'La conversación anterior ya no está disponible. Empecemos de nuevo.\n\n¿Buscas 🔋 baterías o ⚙️ rodamientos?',
        context: createEmptyContext(),
      };
    }

    // Asegurar snapshot actual antes de evaluar retorno (sesión aún viva).
    if (recovery.hasRecoverableProgress(conversation.context)) {
      recovery.saveFromContext(
        memoryKey,
        conversation.customerId,
        conversation.context,
      );
    }

    const decision = recovery.evaluateReturn(
      memoryKey,
      cleaned,
      conversation.context,
    );
    if (decision.type === 'OFFER') {
      return {
        reply: decision.message,
        context: {
          ...createEmptyContext(),
          recoveryOfferPending: true,
        },
      };
    }

    return null;
  }

  private persistRecoveryMemory(
    conversation: Conversation,
    context: ConversationContext,
  ): void {
    const recovery = this.recoveryEngine;
    if (!recovery) return;
    if (context.recoveryOfferPending) return;
    if (!recovery.hasRecoverableProgress(context)) return;
    recovery.saveFromContext(
      conversation.externalId,
      conversation.customerId,
      context,
    );
  }

  /** Learning Engine: registra señales del turno (sin SQL aquí). */
  private recordLearning(
    conversation: Conversation,
    context: ConversationContext,
    previousContext: ConversationContext,
    userMessage: string,
  ): void {
    if (!this.learningEngine) return;
    try {
      this.learningEngine.recordTurn({
        conversation,
        context,
        previousContext,
        userMessage,
      });
    } catch (err) {
      logger.exception('LearningEngine.recordTurn — error controlado', err, {
        service: 'LearningEngine',
        operation: 'recordTurn',
      });
    }
  }

  /**
   * Progreso comercial activo: saludo mid-flow no debe reemitir prompts.
   */
  private hasActiveCommercialProgress(context: ConversationContext): boolean {
    if (context.needsHumanHandoff || context.stage === 'handoff') return true;
    if (context.recoveryOfferPending) return true;
    if (context.vehicle.brand?.trim() || context.vehicle.model?.trim()) return true;
    const sales = context.salesFlow;
    if (sales && sales.state !== 'NEW' && sales.state !== 'CLOSED') return true;
    if (
      context.stage === 'collecting_vehicle' ||
      context.stage === 'collecting_product_details' ||
      context.stage === 'recommending' ||
      context.stage === 'closing'
    ) {
      return true;
    }
    if (
      (context.category === 'baterias' || context.category === 'rodamientos') &&
      context.stage !== 'welcome' &&
      context.stage !== 'awaiting_category'
    ) {
      return true;
    }
    return false;
  }

  /**
   * Restaura conversación (+ memoria) desde PersistenceRepository.load
   * cuando la sesión en memoria está vacía (p.ej. reinicio del proceso).
   */
  private maybeRestoreFromPersistence(conversation: Conversation): void {
    const repo = this.persistence;
    if (!repo) return;

    const current = conversation.context;
    const hasProgress =
      this.recoveryEngine?.hasRecoverableProgress(current) ||
      Boolean(current.salesFlow) ||
      Boolean(current.vehicle.brand?.trim()) ||
      Boolean(current.recoveryOfferPending);
    if (hasProgress) return;

    const loaded = repo.load(conversation.externalId);
    if (!loaded) return;

    const restored = fromPersistedConversation(loaded.conversation);
    // Sesión nueva/vacía no debe heredar un handoff ya cerrado: el cliente
    // vuelve (Hola / bateria) y el canal tiene que responder de nuevo.
    if (isTerminalHandoffContext(restored.context)) {
      this.recoveryEngine?.clear(conversation.externalId);
      return;
    }

    conversation.context = restored.context;

    const recovery = this.recoveryEngine;
    if (recovery) {
      const memoryContext = loaded.memory?.context ?? restored.context;
      if (recovery.hasRecoverableProgress(memoryContext)) {
        recovery.saveFromContext(
          conversation.externalId,
          conversation.customerId,
          memoryContext,
        );
      }
    }
  }

  private resolveTechnicalKnowledge(
    knowledge: KnowledgeEngine,
    userMessage: string,
    context: ConversationContext,
    lastRef: string | undefined,
    lastRefs: string[],
  ) {
    const trimmed = userMessage.trim();
    const refsInMsg = extractTechnicalReferences(trimmed);

    // "¿Por qué?" / "¿Por qué esa batería?" → última recomendación.
    if (
      lastRef &&
      (/^¿?\s*por\s*qu[eé]\s*\??$/i.test(trimmed) ||
        /por\s*qu[eé].*(esa|esta|la).*(bater|recomend)/i.test(trimmed) ||
        (/por\s*qu[eé]/i.test(trimmed) && refsInMsg.length === 0))
    ) {
      return knowledge.explain(lastRef);
    }

    // Alternativas sin referencia explícita → última recomendación.
    if (
      lastRef &&
      refsInMsg.length === 0 &&
      /\b(hay\s+otra|otra\s+opci|alternativa|equivalente|no\s+tengo)\b/i.test(
        trimmed,
      )
    ) {
      return knowledge.alternatives(lastRef);
    }

    // Comparación / "cuál dura más" / "qué diferencia" con 2+ refs presentadas.
    if (
      lastRefs.length >= 2 &&
      refsInMsg.length < 2 &&
      /\b(diferencia|dura\s+m[aá]s|vs\.?|versus|compar)/i.test(trimmed)
    ) {
      return knowledge.compare(lastRefs[0]!, lastRefs[1]!);
    }

    // Compatibilidad con ref en mensaje + vehículo del contexto.
    if (
      refsInMsg.length >= 1 &&
      /\b(sirve|compatible|compatibilidad)\b/i.test(trimmed) &&
      context.vehicle.brand?.trim() &&
      context.vehicle.model?.trim()
    ) {
      const fromAsk = knowledge.ask(trimmed);
      if (fromAsk.found && fromAsk.intent === 'compatibility') return fromAsk;
      return knowledge.compatibility(
        refsInMsg[0]!,
        context.vehicle.brand,
        context.vehicle.model,
        context.vehicle.year,
      );
    }

    const asked = knowledge.ask(trimmed);
    if (asked.found || asked.intent !== 'unknown') return asked;

    // Fallback: FAQ/explicación con última ref si la duda es genérica.
    if (lastRef && /\b(por\s*qu[eé]|recomienda|esa\s+bater)/i.test(trimmed)) {
      return knowledge.explain(lastRef);
    }

    return asked;
  }

  private toBatteryEngineResult(
    context: ConversationContext,
    result: OrchestratorResult,
  ): EngineResult {
    const merged = this.mergeOrchestratorContext(context, result);
    const sales = result.session.sales;
    const presentedRefs =
      result.recommendation?.recommendations.map((r) => r.reference) ?? [];

    if (result.presented?.text) {
      const reply =
        sales.state === 'WAITING_CONFIRMATION'
          ? [result.presented.text, '', ASK_INTEREST].join('\n')
          : result.presented.text;
      return {
        reply,
        context: {
          ...merged,
          lastRecommendedReference:
            presentedRefs[0] ?? context.lastRecommendedReference,
          lastRecommendedReferences:
            presentedRefs.length > 0
              ? presentedRefs
              : context.lastRecommendedReferences,
        },
      };
    }

    if (sales.state === 'READY_FOR_ADVISOR') {
      const alreadyNotified =
        context.needsHumanHandoff === true ||
        context.stage === 'handoff' ||
        context.salesFlow?.state === 'READY_FOR_ADVISOR';
      return {
        reply: alreadyNotified
          ? handoffAlreadyActiveMessage()
          : handoffMessage(merged.handoffReason ?? WILLARD_NOT_FOUND),
        context: merged,
      };
    }

    return {
      reply: replyFromNextAction(sales),
      context: merged,
    };
  }

  private mergeOrchestratorContext(
    context: ConversationContext,
    result: Pick<OrchestratorResult, 'session' | 'recommendation'>,
  ): ConversationContext {
    const sales = result.session.sales;
    const v = sales.vehicle;
    const refs =
      result.recommendation?.recommendations.map((r) => `willard:${r.reference}`) ??
      context.recommendedProductIds;

    const { stage, needsHumanHandoff, handoffReason } = mapSalesToChannel(sales);

    return {
      ...context,
      salesFlow: sales,
      vehicle: {
        brand: v.brand,
        model: v.model,
        year: v.year,
        engine: context.vehicle.engine,
      },
      battery: {
        ...context.battery,
        soundSystem: v.soundSystem,
      },
      vehicleConfirmed: v.vehicleConfirmed,
      recommendedProductIds:
        result.recommendation && result.recommendation.recommendations.length > 0
          ? refs
          : sales.state === 'WAITING_CONFIRMATION' || sales.hasRecommendation
            ? refs
            : context.recommendedProductIds,
      stage,
      needsHumanHandoff,
      handoffReason,
      pendingModelOptions:
        sales.nextAction === 'ASK_MODEL' || sales.nextAction === 'ASK_YEAR'
          ? context.pendingModelOptions
          : sales.state === 'IDENTIFYING_VEHICLE'
            ? context.pendingModelOptions
            : undefined,
    };
  }

  /**
   * Resuelve selección de modelo pendiente / etiqueta exacta de catálogo.
   * No invoca el motor de recomendación.
   */
  private resolvePendingModelSelection(
    context: ConversationContext,
    cleaned: string,
  ): { model?: string } {
    if (!cleaned) return {};
    if (/^\d{4}$/.test(cleaned)) return {};
    if (/^(si|sí|no)$/i.test(cleaned)) return {};

    const pending = context.pendingModelOptions;
    if (pending?.length) {
      const matched = matchPendingModelOption(
        cleaned,
        pending,
        context.vehicle.brand ?? context.salesFlow?.vehicle.brand,
      );
      if (matched) return { model: matched };
    }

    const brand =
      context.salesFlow?.vehicle.brand?.trim() || context.vehicle.brand?.trim();
    if (brand && this.modelCatalog) {
      if (normalizeWillardText(cleaned) === normalizeWillardText(brand)) {
        return {};
      }
      const catalogLabel = tryCall(
        () => this.modelCatalog!.resolveExactModelLabel(brand, cleaned),
        {
          service: 'RecommendationService',
          operation: 'resolveExactModelLabel',
          code: 'CATALOG',
        },
      );
      if (!catalogLabel.ok) {
        logger.exception(
          'Catalog label lookup failed (controlled)',
          catalogLabel.error,
        );
        return {};
      }
      if (catalogLabel.value) return { model: catalogLabel.value };
    }

    if (pending?.length) {
      return { model: cleaned };
    }

    return {};
  }

  private async handleBearing(
    context: ConversationContext,
    userMessage: string,
  ): Promise<EngineResult> {
    if (isBareBearingIntent(userMessage)) {
      const empty = {
        ...context,
        category: 'rodamientos' as const,
        intent: 'rodamientos' as const,
        vehicle: {},
        bearing: {},
        needsHumanHandoff: false,
        handoffReason: undefined,
      };
      const next = bearingNextQuestion(empty);
      return {
        reply: next.text,
        context: { ...empty, stage: next.stage },
      };
    }

    if (context.bearing.referenceHint && /\b(qu[eé] es|medidas?|equivalen|sello|significa)\b/i.test(userMessage)) {
      const found = await tryCallAsync(
        () => this.products.findBySku(context.bearing.referenceHint!),
        { service: 'ProductRepository', operation: 'findBySku', code: 'CATALOG' },
      );
      if (!found.ok) throw found.error;
      return {
        reply: bearingTechnicalInfo(
          context.bearing.referenceHint,
          found.value ?? undefined,
        ),
        context: { ...context, stage: 'recommending' },
      };
    }

    const next = bearingNextQuestion(context);
    if (next.stage !== 'recommending') {
      return {
        reply: next.text,
        context: { ...context, stage: next.stage },
      };
    }

    const primary = await tryCallAsync(
      () =>
        context.bearing.referenceHint
          ? this.products.search({
              category: 'rodamientos',
              sku: context.bearing.referenceHint,
            })
          : this.products.search({
              category: 'rodamientos',
              query: context.bearing.position,
            }),
      { service: 'ProductRepository', operation: 'search', code: 'CATALOG' },
    );
    if (!primary.ok) throw primary.error;

    let products = primary.value;
    if (!products.length && context.bearing.referenceHint) {
      const fallback = await tryCallAsync(
        () =>
          this.products.search({
            category: 'rodamientos',
            query: context.bearing.referenceHint,
          }),
        {
          service: 'ProductRepository',
          operation: 'searchFallback',
          code: 'CATALOG',
        },
      );
      if (!fallback.ok) throw fallback.error;
      products = fallback.value;
    }

    const recommendation = formatBearingRecommendation(context, products);

    return {
      reply: recommendation.text,
      context: {
        ...context,
        stage: recommendation.stage,
        needsHumanHandoff: Boolean(recommendation.needsHandoff),
        handoffReason: recommendation.handoffReason,
        recommendedProductIds: products.slice(0, 3).map((p) => p.id),
      },
    };
  }
}

function replyFromNextAction(sales: SalesFlowSnapshot): string {
  const brand = sales.vehicle.brand?.trim();
  const model = sales.vehicle.model?.trim();
  const year = sales.vehicle.year?.trim();

  switch (sales.nextAction) {
    case 'ASK_VEHICLE':
      return formatAskVehicle();
    case 'ASK_MODEL':
      return brand ? formatAskModel(brand) : formatAskBrand();
    case 'ASK_YEAR':
      return brand && model
        ? formatAskYear(brand, model)
        : formatAskVehicle();
    case 'CONFIRM_VEHICLE':
      return brand && model && year
        ? formatVehicleConfirmation(brand, model, year)
        : formatAskVehicle();
    case 'ASK_SOUND':
      return formatAskSoundSystem();
    case 'ASK_INTEREST_AFTER_RECOMMENDATION':
      return ASK_INTEREST;
    case 'HANDOFF_TO_ADVISOR':
    case 'CLARIFY_VEHICLE':
      return handoffMessage(WILLARD_NOT_FOUND);
    case 'END_CONVERSATION':
      return recommendationRejectedCloseMessage();
    case 'SHOW_RECOMMENDATION':
      return formatAskSoundSystem();
    default:
      return formatAskVehicle();
  }
}

function mapSalesToChannel(sales: SalesFlowSnapshot): {
  stage: ConversationContext['stage'];
  needsHumanHandoff: boolean;
  handoffReason?: string;
} {
  switch (sales.state) {
    case 'WAITING_CONFIRMATION':
      return {
        stage: 'closing',
        needsHumanHandoff: false,
        handoffReason: undefined,
      };
    case 'READY_FOR_ADVISOR':
      if (!sales.hasRecommendation || sales.matchKind === 'none') {
        return {
          stage: 'handoff',
          needsHumanHandoff: true,
          handoffReason: WILLARD_NOT_FOUND,
        };
      }
      return {
        stage: 'handoff',
        needsHumanHandoff: true,
        handoffReason: 'Cliente aceptó la recomendación Willard',
      };
    case 'CLOSED':
      return {
        stage: 'closing',
        needsHumanHandoff: false,
        handoffReason: undefined,
      };
    case 'RECOMMENDATION_READY':
      return {
        stage: 'recommending',
        needsHumanHandoff: false,
        handoffReason: undefined,
      };
    case 'IDENTIFYING_VEHICLE':
    case 'NEW':
    default:
      if (sales.nextAction === 'ASK_SOUND') {
        return {
          stage: 'collecting_product_details',
          needsHumanHandoff: false,
          handoffReason: undefined,
        };
      }
      return {
        stage: 'collecting_vehicle',
        needsHumanHandoff: false,
        handoffReason: undefined,
      };
  }
}
