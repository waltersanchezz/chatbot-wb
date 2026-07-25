import type { Conversation, ConversationContext } from '../../domain/entities/Conversation';
import type { ProductRepository } from '../../domain/ports/ProductRepository';
import type { WillardBatteryKnowledge } from '../../domain/ports/WillardBatteryKnowledge';
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
    private readonly willardKnowledge: WillardBatteryKnowledge,
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

    if (intent === 'handoff' || context.needsHumanHandoff) {
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

    // "Baterías" / "Rodamientos" (u otras frases) → entrar al flujo, sin repetir el menú.
    if (intent === 'baterias') {
      context.category = 'baterias';
      context.intent = 'baterias';
      context.stage =
        context.stage === 'welcome' || context.stage === 'awaiting_category'
          ? 'collecting_vehicle'
          : context.stage;
      return this.handleBattery(context);
    }

    if (intent === 'rodamientos') {
      context.category = 'rodamientos';
      context.intent = 'rodamientos';
      context.stage =
        context.stage === 'welcome' || context.stage === 'awaiting_category'
          ? 'collecting_vehicle'
          : context.stage;
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
    if (next.stage !== 'recommending') {
      return {
        reply: next.text,
        context: { ...context, stage: next.stage },
      };
    }

    const options = this.willardKnowledge.findRecommendations({
      brand: context.vehicle.brand,
      model: context.vehicle.model,
      year: context.vehicle.year,
      soundSystem: Boolean(context.battery.soundSystem),
    });

    const recommendation = formatBatteryRecommendation(context, options);

    return {
      reply: recommendation.text,
      context: {
        ...context,
        stage: recommendation.stage,
        needsHumanHandoff: Boolean(recommendation.needsHandoff),
        handoffReason: recommendation.handoffReason,
        recommendedProductIds: options.map((o) => `willard:${o.reference}`),
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
