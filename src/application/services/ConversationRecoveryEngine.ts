import type {
  ConversationMemorySnapshot,
  ConversationMemorySummary,
} from '../../domain/conversation/conversationMemory';
import type { ConversationContext } from '../../domain/entities/Conversation';
import { createEmptyContext } from '../../domain/entities/Conversation';
import type { ConversationMemory } from './ConversationMemory';

export type RecoveryDecision =
  | { type: 'NONE' }
  | { type: 'OFFER'; snapshot: ConversationMemorySnapshot; message: string }
  | { type: 'EXPIRED' }
  | {
      type: 'CONTINUE';
      context: ConversationContext;
      message: string;
    }
  | { type: 'RESTART'; context: ConversationContext; message: string };

/**
 * Conversation Recovery Engine.
 * Lee/escribe ConversationMemory y decide ofrecer continuar / restaurar / reiniciar.
 * No recomienda baterías ni modifica SalesFlowEngine.
 */
export class ConversationRecoveryEngine {
  constructor(private readonly memory: ConversationMemory) {}

  isExplicitReturnGreeting(text: string): boolean {
    return /^(hola\s+otra\s+vez|hola\s+de\s+nuevo|buenas\s+de\s+nuevo|hey\s+de\s+nuevo|hola\s+nuevamente)\b/i.test(
      text.trim(),
    );
  }

  isPlainGreeting(text: string): boolean {
    return /^(hola|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey|hi|hello|saludos)\b/i.test(
      text.trim(),
    );
  }

  isReturnGreeting(text: string): boolean {
    return this.isExplicitReturnGreeting(text) || this.isPlainGreeting(text);
  }

  isContinueReply(text: string): boolean {
    return /^(si|sí|sip|sep|ok|okay|dale|claro|continuar|seguimos|yes)$/i.test(
      text.trim(),
    );
  }

  isDeclineReply(text: string): boolean {
    return /^(no|nop|negativo|reiniciar|desde\s+cero|otra\s+cosa)$/i.test(
      text.trim(),
    );
  }

  /** ¿Hay progreso recuperable (vehículo, recomendación, sales, técnico)? */
  hasRecoverableProgress(context: ConversationContext): boolean {
    const v = context.vehicle;
    const hasVehicle = Boolean(
      v.brand?.trim() || v.model?.trim() || v.year?.trim(),
    );
    const sales = context.salesFlow;
    const salesAdvanced = Boolean(
      sales && sales.state !== 'NEW' && sales.state !== 'CLOSED',
    );
    const hasRefs =
      Boolean(context.lastRecommendedReference) ||
      (context.lastRecommendedReferences?.length ?? 0) > 0 ||
      context.recommendedProductIds.length > 0;
    const hasTechnical = Boolean(
      context.lastTechnicalQuestion || context.lastTechnicalAnswer,
    );
    return hasVehicle || salesAdvanced || hasRefs || hasTechnical;
  }

  buildSnapshot(
    memoryKey: string,
    customerId: string,
    context: ConversationContext,
  ): ConversationMemorySnapshot | null {
    if (!this.hasRecoverableProgress(context)) return null;
    const cloned = structuredClone(context);
    // No persistir el flag de oferta pendiente.
    cloned.recoveryOfferPending = false;
    return {
      memoryKey,
      customerId,
      savedAt: 0,
      expiresAt: 0,
      context: cloned,
      summary: this.buildSummary(cloned),
    };
  }

  saveFromContext(
    memoryKey: string,
    customerId: string,
    context: ConversationContext,
    ttlMs?: number,
  ): ConversationMemorySnapshot | null {
    const snap = this.buildSnapshot(memoryKey, customerId, context);
    if (!snap) return null;
    return this.memory.save(snap, ttlMs);
  }

  getActive(memoryKey: string): ConversationMemorySnapshot | null {
    return this.memory.get(memoryKey);
  }

  clear(memoryKey: string): void {
    this.memory.clear(memoryKey);
  }

  /**
   * Evalúa un saludo de retorno: ofrece continuar si hay memoria válida.
   * - "Hola otra vez" / "Hola de nuevo": ofrece si hay memoria.
   * - "Hola" simple: solo si la sesión actual no tiene progreso (p.ej. TTL de sesión).
   * - Memoria expirada: EXPIRED (no ofrecer; flujo nuevo).
   */
  evaluateReturn(
    memoryKey: string,
    userMessage: string,
    currentContext?: ConversationContext,
  ): RecoveryDecision {
    const explicit = this.isExplicitReturnGreeting(userMessage);
    const plain = this.isPlainGreeting(userMessage);
    if (!explicit && !plain) {
      return { type: 'NONE' };
    }

    const active = this.memory.get(memoryKey);
    if (!active) {
      return { type: 'EXPIRED' };
    }
    if (!this.hasRecoverableProgress(active.context)) {
      return { type: 'NONE' };
    }

    // Saludo simple en sesión viva con progreso: no interrumpir el flujo.
    if (
      !explicit &&
      currentContext &&
      this.hasRecoverableProgress(currentContext)
    ) {
      return { type: 'NONE' };
    }

    return {
      type: 'OFFER',
      snapshot: active,
      message: this.formatOfferMessage(active),
    };
  }

  accept(memoryKey: string): RecoveryDecision {
    const active = this.memory.get(memoryKey);
    if (!active) {
      return {
        type: 'RESTART',
        context: createEmptyContext(),
        message:
          'La conversación anterior ya no está disponible. Empecemos de nuevo.\n\n¿Buscas 🔋 baterías o ⚙️ rodamientos?',
      };
    }

    const restored = structuredClone(active.context);
    restored.recoveryOfferPending = false;
    const message = this.formatContinueMessage(active);
    return { type: 'CONTINUE', context: restored, message };
  }

  decline(memoryKey: string): RecoveryDecision {
    this.memory.clear(memoryKey);
    return {
      type: 'RESTART',
      context: createEmptyContext(),
      message:
        'Perfecto, empezamos de cero.\n\n¿Buscas 🔋 baterías o ⚙️ rodamientos?',
    };
  }

  formatOfferMessage(snapshot: ConversationMemorySnapshot): string {
    const { summary } = snapshot;
    const salesState = summary.salesState;

    if (salesState === 'READY_FOR_ADVISOR') {
      const vehicle = summary.vehicleLabel || 'tu vehículo';
      const ref = summary.primaryReference
        ? ` (referencia *${summary.primaryReference}*)`
        : '';
      return [
        'Hola de nuevo 👋.',
        `Teníamos listo el proceso de asesor para *${vehicle}*${ref}.`,
        '',
        '¿Deseas que un asesor continúe con el proceso?',
        'Responde *sí* o *no*.',
      ].join('\n');
    }

    const vehicle = summary.vehicleLabel || 'tu vehículo';
    const refLine = summary.primaryReference
      ? ` Estábamos con la referencia *${summary.primaryReference}*.`
      : summary.references.length > 1
        ? ` Estábamos revisando las referencias *${summary.references.join('*, *')}*.`
        : '';

    const techLine =
      summary.lastTechnicalQuestion && !summary.primaryReference
        ? ` También habíamos tocado: _${truncate(summary.lastTechnicalQuestion, 80)}_.`
        : '';

    return [
      'Hola de nuevo 👋.',
      `Estábamos revisando una batería para tu *${vehicle}*.${refLine}${techLine}`,
      '',
      '¿Quieres continuar donde quedamos?',
      'Responde *sí* para seguir o *no* para empezar de nuevo.',
    ].join('\n');
  }

  formatContinueMessage(snapshot: ConversationMemorySnapshot): string {
    if (snapshot.summary.salesState === 'READY_FOR_ADVISOR') {
      return [
        'Perfecto, mantenemos tu caso listo para el asesor.',
        '',
        '👨‍🔧 Un asesor de Rodacenter Manizales continúa contigo con los datos ya anotados.',
      ].join('\n');
    }

    const nextHint = hintFromSales(snapshot.context);
    return ['¡Dale, seguimos donde íbamos!', '', nextHint].filter(Boolean).join('\n');
  }

  buildSummary(context: ConversationContext): ConversationMemorySummary {
    const brand = context.vehicle.brand?.trim();
    const model = context.vehicle.model?.trim();
    const year = context.vehicle.year?.trim();
    const vehicleLabel = [brand, model, year].filter(Boolean).join(' ') || '';

    const refsFromIds = context.recommendedProductIds
      .map((id) => {
        const m = id.match(/^willard:(.+)$/i);
        return m?.[1];
      })
      .filter((x): x is string => Boolean(x));

    const references = unique([
      ...(context.lastRecommendedReferences ?? []),
      ...(context.lastRecommendedReference
        ? [context.lastRecommendedReference]
        : []),
      ...refsFromIds,
    ]);

    return {
      vehicleLabel,
      primaryReference: context.lastRecommendedReference ?? references[0],
      references,
      salesState: context.salesFlow?.state,
      lastTechnicalQuestion: context.lastTechnicalQuestion,
      lastTechnicalAnswer: context.lastTechnicalAnswer,
    };
  }
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const k = item.trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function hintFromSales(context: ConversationContext): string {
  const sales = context.salesFlow;
  if (!sales) {
    if (context.category === 'baterias') {
      return '¿Seguimos con tu batería Willard?';
    }
    return '¿En qué te ayudo?';
  }

  switch (sales.nextAction) {
    case 'ASK_VEHICLE':
      return '¿Para qué vehículo necesitas la batería?';
    case 'ASK_MODEL':
      return sales.vehicle.brand
        ? `¿Qué modelo es tu *${sales.vehicle.brand}*?`
        : '¿Qué modelo es?';
    case 'ASK_YEAR':
      return '¿De qué año es el vehículo?';
    case 'CONFIRM_VEHICLE':
      return '¿Confirmamos marca, modelo y año? Responde *sí* o *no*.';
    case 'ASK_SOUND':
      return '¿El vehículo tiene planta de sonido? Responde *sí* o *no*.';
    case 'ASK_INTEREST_AFTER_RECOMMENDATION':
    case 'SHOW_RECOMMENDATION':
      return '¿Te sirve la recomendación? Responde *sí* o *no*.';
    case 'HANDOFF_TO_ADVISOR':
      return '¿Deseas que un asesor continúe con el proceso?';
    default:
      return '¿Seguimos?';
  }
}
