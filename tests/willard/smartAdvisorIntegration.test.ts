import { describe, expect, it, vi } from 'vitest';
import type { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { isTechnicalQuestion } from '../../src/application/services/technicalQuestionDetector';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';

function build() {
  const apps = [
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['850'], increibleTitanio: ['750'] },
      fila: 1,
    }),
  ];
  const specs = new Map<string, WillardReferenceSpec>([
    [
      '850',
      {
        ...spec('850'),
        cca18C: 620,
        c20Ah: 70,
        linea: 'Willard',
        notas: 'Uso urbano',
      },
    ],
    [
      '750',
      {
        ...spec('750'),
        cca18C: 540,
        c20Ah: 60,
        linea: 'Increíble Titanio',
      },
    ],
  ]);
  return buildTestConversationEngine(
    new FakeWillardBatteryKnowledge(apps, specs),
    catalogRowsFromHits(apps),
  );
}

function conversation() {
  return {
    id: 'c-adv',
    customerId: 'u1',
    channel: 'whatsapp' as const,
    externalId: 'wa:adv',
    context: createEmptyContext(),
    messages: [] as { role: string; content: string }[],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function say(
  engine: ConversationEngine,
  conv: ReturnType<typeof conversation>,
  msg: string,
) {
  const result = await engine.process(conv as never, msg);
  conv.context = result.context;
  conv.messages.push({ role: 'customer', content: msg });
  return result;
}

async function reachRecommendation(engine: ConversationEngine) {
  const conv = conversation();
  await say(engine, conv, 'batería');
  await say(engine, conv, 'Logan 2013');
  await say(engine, conv, 'sí');
  const rec = await say(engine, conv, 'no');
  return { conv, rec };
}

describe('technicalQuestionDetector', () => {
  it('detecta preguntas técnicas y ignora sí/no/año', () => {
    expect(isTechnicalQuestion('¿Por qué esa batería?')).toBe(true);
    expect(isTechnicalQuestion('¿Qué significa CCA?')).toBe(true);
    expect(isTechnicalQuestion('¿Cuál dura más?')).toBe(true);
    expect(isTechnicalQuestion('¿Qué diferencia hay?')).toBe(true);
    expect(isTechnicalQuestion('¿Hay otra opción?')).toBe(true);
    expect(isTechnicalQuestion('¿Qué pasa si instalo una mayor?')).toBe(true);
    expect(isTechnicalQuestion('¿Le sirve una 850?')).toBe(true);
    expect(isTechnicalQuestion('¿Por qué?')).toBe(true);
    expect(isTechnicalQuestion('sí')).toBe(false);
    expect(isTechnicalQuestion('no')).toBe(false);
    expect(isTechnicalQuestion('2013')).toBe(false);
  });
});

describe('Smart Advisor Integration', () => {
  it('explicación después de recomendar usa última referencia y no pide vehículo', async () => {
    const { engine, knowledgeEngine } = build();
    const explainSpy = vi.spyOn(knowledgeEngine, 'explain');
    const { conv, rec } = await reachRecommendation(engine);

    const primary = rec.context.lastRecommendedReference;
    expect(primary).toBeTruthy();
    expect(rec.context.salesFlow?.state).toBe('WAITING_CONFIRMATION');
    const salesBefore = structuredClone(rec.context.salesFlow);

    const why = await say(engine, conv, '¿Por qué?');

    expect(explainSpy).toHaveBeenCalledWith(primary);
    expect(why.reply).toMatch(new RegExp(`CCA|${primary}`, 'i'));
    expect(why.reply).not.toMatch(/¿Para qué vehículo/i);
    expect(why.context.salesFlow).toEqual(salesBefore);
    expect(why.context.stage).toBe(rec.context.stage);
    expect(why.context.vehicle.model).toMatch(/Logan/i);
  });

  it('FAQ durante conversación sin cambiar SalesFlow', async () => {
    const { engine } = build();
    const { conv, rec } = await reachRecommendation(engine);
    const salesBefore = structuredClone(rec.context.salesFlow);
    const primary = rec.context.lastRecommendedReference;

    const faq = await say(engine, conv, '¿Qué significa CCA?');

    expect(faq.reply).toMatch(/Cold Cranking|CCA/i);
    expect(faq.context.salesFlow).toEqual(salesBefore);
    expect(faq.context.lastRecommendedReference).toBe(primary);
  });

  it('comparación con referencias presentadas', async () => {
    const { engine } = build();
    const { conv, rec } = await reachRecommendation(engine);
    // Simula presentación con dos refs (850 primaria + 750).
    conv.context.lastRecommendedReferences = ['850', '750'];
    conv.context.lastRecommendedReference = '850';
    const salesBefore = structuredClone(rec.context.salesFlow);

    const cmp = await say(engine, conv, '¿Qué diferencia hay?');

    expect(cmp.reply).toMatch(/850/);
    expect(cmp.reply).toMatch(/750/);
    expect(cmp.context.salesFlow).toEqual(salesBefore);
  });

  it('alternativas sin repetir vehículo', async () => {
    const { engine, knowledgeEngine } = build();
    const altSpy = vi.spyOn(knowledgeEngine, 'alternatives');
    const { conv, rec } = await reachRecommendation(engine);
    const salesBefore = structuredClone(rec.context.salesFlow);
    const primary = rec.context.lastRecommendedReference!;

    const alt = await say(engine, conv, '¿Hay otra opción?');

    expect(altSpy).toHaveBeenCalledWith(primary);
    expect(alt.reply).toMatch(/750|850|alternativa/i);
    expect(alt.reply).not.toMatch(/¿Para qué vehículo/i);
    expect(alt.context.salesFlow).toEqual(salesBefore);
  });

  it('vuelve al flujo normal tras la duda (sí de interés)', async () => {
    const { engine } = build();
    const { conv } = await reachRecommendation(engine);
    await say(engine, conv, '¿Qué significa CCA?');

    const accepted = await say(engine, conv, 'sí');

    expect(accepted.context.salesFlow?.state).toBe('READY_FOR_ADVISOR');
    expect(accepted.context.needsHumanHandoff).toBe(true);
  });

  it('sin duplicar respuestas: solo texto del KnowledgeEngine', async () => {
    const { engine } = build();
    const { conv } = await reachRecommendation(engine);
    const why = await say(engine, conv, '¿Por qué esa batería?');

    expect(why.reply).toMatch(/850|CCA/i);
    // No concatena ask-vehicle ni doble ASK_INTEREST.
    expect(why.reply).not.toMatch(/¿Para qué vehículo/i);
    const interestCount = (why.reply.match(/¿Te sirve esta opción/g) ?? []).length;
    expect(interestCount).toBe(0);
  });

  it('mantiene SalesFlow state y nextAction idénticos', async () => {
    const { engine } = build();
    const { conv, rec } = await reachRecommendation(engine);
    const before = rec.context.salesFlow!;

    const after = await say(engine, conv, '¿Qué pasa si instalo una mayor?');

    expect(after.context.salesFlow?.state).toBe(before.state);
    expect(after.context.salesFlow?.nextAction).toBe(before.nextAction);
    expect(after.context.salesFlow?.leadScore).toBe(before.leadScore);
    expect(after.context.salesFlow?.vehicle).toEqual(before.vehicle);
    expect(after.reply).toMatch(/mayor|CCA|Ah/i);
  });

  it('flujo no técnico sigue igual (sí/no no van a Knowledge)', async () => {
    const { engine, knowledgeEngine } = build();
    const askSpy = vi.spyOn(knowledgeEngine, 'ask');
    const conv = conversation();
    await say(engine, conv, 'batería');
    await say(engine, conv, 'Logan 2013');
    await say(engine, conv, 'sí');
    expect(askSpy).not.toHaveBeenCalled();
    const rec = await say(engine, conv, 'no');
    expect(rec.reply).toMatch(/850|Referencia/i);
  });
});
