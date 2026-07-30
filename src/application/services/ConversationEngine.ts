import type { Conversation, ConversationContext } from '../../domain/entities/Conversation';
import type { ProductRepository } from '../../domain/ports/ProductRepository';
import type { ConversationIntent } from '../../shared/types';
import {
  batteryNextQuestion,
  formatBatteryRecommendation,
} from '../flows/batteryFlow';
import {
  bearingNextQuestion,
  bearingTechnicalInfo,
  formatBearingRecommendation,
} from '../flows/bearingFlow';
import { handoffMessage } from '../flows/handoffFlow';
import { categoryPrompt, welcomeMessage } from '../flows/welcomeFlow';
import { ContextExtractor } from './ContextExtractor';
import { IntentDetector } from './IntentDetector';
import { RecommendationService } from './RecommendationService';
import { SecurityGuard } from './SecurityGuard';

export interface EngineConfig {
  appName: string;
  companyName: string;
}

export interface EngineResult {
  reply: string;
  context: ConversationContext;
}

export class ConversationEngine {
  private readonly intentDetector = new IntentDetector();
  private readonly extractor = new ContextExtractor();
  private readonly security = new SecurityGuard();

  constructor(
    private readonly products: ProductRepository,
    private readonly recommendations: RecommendationService,
    private readonly config: EngineConfig,
  ) {}

  async process(conversation: Conversation, userMessage: string): Promise<EngineResult> {
    if (this.security.isSensitiveProbe(userMessage)) {
      return {
        reply: this.security.blockedReply(),
        context: conversation.context,
      };
    }

    const intentPreview = this.intentDetector.detect(
      userMessage,
      conversation.context.intent,
    );
    // Marca categoría antes de extraer (slots de baterías / ABS de rodamientos).
    const contextForExtract =
      intentPreview === 'baterias' || conversation.context.category === 'baterias'
        ? { ...conversation.context, category: 'baterias' as const, intent: intentPreview }
        : intentPreview === 'rodamientos' || conversation.context.category === 'rodamientos'
          ? { ...conversation.context, category: 'rodamientos' as const, intent: intentPreview }
          : conversation.context;

    let context = this.extractor.apply(contextForExtract, userMessage);
    const intent = this.intentDetector.detect(userMessage, context.intent);
    context = { ...context, intent };

    // Handoff explícito del cliente (pide asesor). No usar needsHumanHandoff pegado
    // de un intento anterior: eso se limpia al reiniciar baterías/rodamientos.
    if (intent === 'handoff') {
      context.stage = 'handoff';
      context.needsHumanHandoff = true;
      context.handoffReason = context.handoffReason ?? 'Solicitud del cliente';
      return { reply: handoffMessage(context.handoffReason), context };
    }

    // Bienvenida solo si el primer mensaje es un saludo (no si ya eligió categoría).
    if (
      intent === 'greeting' &&
      conversation.messages.filter((m) => m.role === 'customer').length <= 1
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

    // "Baterías" / "Rodamientos" → entrar/reiniciar flujo de recolección.
    // Limpia handoff previo para no transferir antes de terminar la búsqueda.
    if (intent === 'baterias') {
      const restartingAfterHandoff =
        conversation.context.needsHumanHandoff ||
        conversation.context.stage === 'handoff' ||
        conversation.context.stage === 'closing';

      context.category = 'baterias';
      context.intent = 'baterias';
      context.needsHumanHandoff = false;
      context.handoffReason = undefined;
      context.recommendedProductIds = [];

      if (restartingAfterHandoff) {
        context.stage = 'collecting_vehicle';
        context.vehicle = {};
        context.battery = {};
      } else if (
        context.stage === 'welcome' ||
        context.stage === 'awaiting_category'
      ) {
        context.stage = 'collecting_vehicle';
      }

      return this.handleBattery(context);
    }

    if (intent === 'rodamientos') {
      const restartingAfterHandoff =
        conversation.context.needsHumanHandoff ||
        conversation.context.stage === 'handoff' ||
        conversation.context.stage === 'closing';

      context.category = 'rodamientos';
      context.intent = 'rodamientos';
      context.needsHumanHandoff = false;
      context.handoffReason = undefined;
      context.recommendedProductIds = [];

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

    // Handoff ya decidido por el flujo (búsqueda fallida al final) y sin reinicio.
    if (context.needsHumanHandoff) {
      context.stage = 'handoff';
      context.handoffReason = context.handoffReason ?? 'Solicitud del cliente';
      return { reply: handoffMessage(context.handoffReason), context };
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

    // Continuación por categoría activa
    if (context.category === 'baterias') {
      return this.handleBattery(context);
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

  private async handleBattery(context: ConversationContext): Promise<EngineResult> {
    const next = batteryNextQuestion(context);
    // Mientras faltan vehículo / año / planta de sonido: solo preguntar.
    // Nunca recomendar ni marcar handoff en esta fase.
    if (next.stage !== 'recommending') {
      return {
        reply: next.text,
        context: {
          ...context,
          stage: next.stage,
          needsHumanHandoff: false,
          handoffReason: undefined,
        },
      };
    }

    const marca = context.vehicle.brand?.trim() || '';
    const modelo = context.vehicle.model?.trim() || undefined;
    if (!marca || !modelo) {
      // Defensa: no buscar Willard incompleto.
      const ask = batteryNextQuestion({
        ...context,
        vehicle: {
          ...context.vehicle,
          brand: marca || undefined,
          model: modelo,
        },
        battery: { ...context.battery, soundSystem: undefined },
      });
      return {
        reply: ask.text || '🚗 ¿Para qué vehículo necesitas la batería?',
        context: {
          ...context,
          stage: 'collecting_vehicle',
          needsHumanHandoff: false,
          handoffReason: undefined,
        },
      };
    }

    const result = this.recommendations.recommendByVehicle({
      marca,
      modelo,
    });

    const recommendation = formatBatteryRecommendation(context, result);

    return {
      reply: recommendation.text,
      context: {
        ...context,
        stage: recommendation.stage,
        needsHumanHandoff: Boolean(recommendation.needsHandoff),
        handoffReason: recommendation.handoffReason,
        recommendedProductIds: result.options.map((o) => `willard:${o.reference}`),
      },
    };
  }

  private async handleBearing(
    context: ConversationContext,
    userMessage: string,
  ): Promise<EngineResult> {
    // Consulta técnica directa por referencia
    if (context.bearing.referenceHint && /\b(qu[eé] es|medidas?|equivalen|sello|significa)\b/i.test(userMessage)) {
      const product = await this.products.findBySku(context.bearing.referenceHint);
      return {
        reply: bearingTechnicalInfo(context.bearing.referenceHint, product ?? undefined),
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

    let products = context.bearing.referenceHint
      ? await this.products.search({ category: 'rodamientos', sku: context.bearing.referenceHint })
      : await this.products.search({ category: 'rodamientos', query: context.bearing.position });

    if (!products.length && context.bearing.referenceHint) {
      products = await this.products.search({
        category: 'rodamientos',
        query: context.bearing.referenceHint,
      });
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
