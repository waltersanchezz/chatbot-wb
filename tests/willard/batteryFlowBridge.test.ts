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

describe('formatBatteryRecommendation formatter (PR3)', () => {
  it('keeps handoff copy when there is no match', () => {
    const result: RecommendationResult = {
      outcome: 'empty',
      query: { marca: 'ZZZZ' },
      options: [],
      applications: [],
      reasonCode: 'NO_USABLE_MATCH',
    };
    const reply = formatBatteryRecommendation(emptyCtx, result);
    expect(reply.stage).toBe('handoff');
    expect(reply.needsHandoff).toBe(true);
    expect(reply.text).toContain('validar la referencia Willard');
  });

  it('groups options by product line and shows available specs', () => {
    const application = hit({
      marca: 'BMW',
      modelo: '320i',
      textoCatalogo: '320i',
      refs: { willardAgmEfb: ['W-L5-95AH'], willard: ['49-1200'] },
    });
    const agmSpec = {
      ...spec('W-L5-95AH'),
      c20Ah: 95,
      cca18C: 850,
      polaridad: '(- +)',
      terminal: 'ESTANDAR',
      dimensionesMm: { largo: 353, ancho: 175, alto: 190 },
    };
    const result: RecommendationResult = {
      outcome: 'matched',
      query: { marca: 'BMW', modelo: '320i' },
      applications: [application],
      options: [
        {
          application,
          productLine: 'willard',
          reference: '49-1200',
          spec: null,
        },
        {
          application,
          productLine: 'willardAgmEfb',
          reference: 'W-L5-95AH',
          spec: agmSpec,
        },
      ],
    };

    const reply = formatBatteryRecommendation(emptyCtx, result);
    expect(reply.stage).toBe('closing');
    expect(reply.text).toContain('Para tu 320i');
    expect(reply.text).toContain('Willard AGM / EFB');
    expect(reply.text).toContain('W-L5-95AH');
    expect(reply.text).toContain('95 Ah');
    expect(reply.text).toContain('CCA 850');
    expect(reply.text).toContain('Willard');
    expect(reply.text).toContain('49-1200');
    // AGM group should appear before standard Willard (line order).
    expect(reply.text.indexOf('Willard AGM / EFB')).toBeLessThan(
      reply.text.indexOf('📦 Willard\n'),
    );
  });
});
