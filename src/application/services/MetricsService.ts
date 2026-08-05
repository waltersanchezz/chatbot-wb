import type { ConversationContext } from '../../domain/entities/Conversation';
import type { BatteryMatchKind } from '../../domain/willard/batteryRecommendation';

/**
 * Métricas de producto (hardening) — servicio independiente del flujo conversacional.
 * Contadores en memoria; no I/O, no WhatsApp, no CRM.
 */
export type MetricName =
  | 'conversations_started'
  | 'recommendations_exact'
  | 'recommendations_similar'
  | 'recommendations_none'
  | 'handoff_to_advisor'
  | 'errors';

export type MetricsSnapshot = Record<MetricName, number>;

const METRIC_NAMES: MetricName[] = [
  'conversations_started',
  'recommendations_exact',
  'recommendations_similar',
  'recommendations_none',
  'handoff_to_advisor',
  'errors',
];

export class MetricsService {
  private readonly counters = new Map<MetricName, number>(
    METRIC_NAMES.map((name) => [name, 0]),
  );

  increment(name: MetricName, by = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + by);
  }

  get(name: MetricName): number {
    return this.counters.get(name) ?? 0;
  }

  snapshot(): MetricsSnapshot {
    const out = {} as MetricsSnapshot;
    for (const name of METRIC_NAMES) {
      out[name] = this.get(name);
    }
    return out;
  }

  reset(): void {
    for (const name of METRIC_NAMES) {
      this.counters.set(name, 0);
    }
  }

  /**
   * Actualiza contadores a partir del delta de un turno (sin side-effects de negocio).
   */
  recordTurn(input: {
    isNewConversation: boolean;
    previous: ConversationContext;
    next: ConversationContext;
    isError: boolean;
  }): void {
    if (input.isNewConversation) {
      this.increment('conversations_started');
    }
    if (input.isError) {
      this.increment('errors');
    }

    const prevKind = input.previous.salesFlow?.matchKind;
    const nextKind = input.next.salesFlow?.matchKind;
    if (nextKind && nextKind !== prevKind) {
      this.incrementRecommendation(nextKind);
    }

    const handedOff =
      (!input.previous.needsHumanHandoff && input.next.needsHumanHandoff) ||
      (input.previous.stage !== 'handoff' && input.next.stage === 'handoff');
    if (handedOff) {
      this.increment('handoff_to_advisor');
    }
  }

  private incrementRecommendation(kind: BatteryMatchKind): void {
    switch (kind) {
      case 'exact':
      case 'year_range':
        this.increment('recommendations_exact');
        break;
      case 'similar':
        this.increment('recommendations_similar');
        break;
      case 'none':
        this.increment('recommendations_none');
        break;
      default:
        break;
    }
  }
}
