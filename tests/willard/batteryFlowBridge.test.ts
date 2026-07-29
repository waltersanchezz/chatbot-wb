import { describe, expect, it } from 'vitest';
import { formatBatteryRecommendation } from '../../src/application/flows/batteryFlow';
import type { ConversationContext } from '../../src/domain/entities/Conversation';
import type { RecommendationResult } from '../../src/domain/willard/catalogTypes';
import { hit, spec } from './FakeWillardBatteryKnowledge';

const emptyCtx = {
  vehicle: {},
  battery: {},
  bearing: {},
} as ConversationContext;

describe('formatBatteryRecommendation (PR2 bridge)', () => {
  it('handoffs when outcome is empty', () => {
    const result: RecommendationResult = {
      outcome: 'empty',
      query: { marca: 'ZZZZ' },
      options: [],
      applications: [],
      reasonCode: 'NO_USABLE_MATCH',
    };
    const reply = formatBatteryRecommendation(emptyCtx, result);
    expect(reply.needsHandoff).toBe(true);
    expect(reply.stage).toBe('handoff');
    expect(reply.text).toContain('validar la referencia Willard');
  });

  it('lists references when matched', () => {
    const application = hit({
      marca: 'BMW',
      modelo: '320i',
      refs: { willardAgmEfb: ['W-L5-95AH'], willard: ['49-1200'] },
    });
    const result: RecommendationResult = {
      outcome: 'matched',
      query: { marca: 'BMW', modelo: '320i' },
      applications: [application],
      options: [
        {
          application,
          productLine: 'willardAgmEfb',
          reference: 'W-L5-95AH',
          spec: spec('W-L5-95AH'),
        },
        {
          application,
          productLine: 'willard',
          reference: '49-1200',
          spec: null,
        },
      ],
    };
    const reply = formatBatteryRecommendation(emptyCtx, result);
    expect(reply.stage).toBe('closing');
    expect(reply.text).toContain('W-L5-95AH');
    expect(reply.text).toContain('49-1200');
    expect(reply.text).toContain('60 A');
  });
});
