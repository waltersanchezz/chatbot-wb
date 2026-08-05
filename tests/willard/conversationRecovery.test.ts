import { describe, expect, it } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { ConversationMemory } from '../../src/application/services/ConversationMemory';
import { ConversationRecoveryEngine } from '../../src/application/services/ConversationRecoveryEngine';
import type { ConversationEngine } from '../../src/application/services/ConversationEngine';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';

function buildSuite(options?: { recoveryTtlMs?: number; now?: () => number }) {
  const apps = [
    hit({
      marca: 'RENAULT',
      modelo: 'Logan',
      textoCatalogo: 'Logan',
      refs: { willard: ['FAKE-LOG', 'FAKE-LOG-B'] },
      fila: 1,
    }),
    hit({
      marca: 'MAZDA',
      modelo: 'Mazda 2 HB All New',
      textoCatalogo: 'Mazda 2 HB All New',
      refs: { willard: ['FAKE-M2'] },
      fila: 2,
    }),
  ];
  const specs = new Map<string, WillardReferenceSpec>([
    ['FAKE-LOG', { ...spec('FAKE-LOG'), cca18C: 620 }],
    ['FAKE-LOG-B', { ...spec('FAKE-LOG-B'), cca18C: 580 }],
    ['FAKE-M2', { ...spec('FAKE-M2'), cca18C: 500 }],
  ]);
  const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
  return buildTestConversationEngine(
    knowledge,
    catalogRowsFromHits(apps),
    options,
  );
}

function conversation(externalId = 'wa:recovery-1') {
  return {
    id: `c-${externalId}`,
    customerId: 'cust-1',
    channel: 'whatsapp' as const,
    externalId,
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

async function reachYearAsked(engine: ConversationEngine) {
  const conv = conversation();
  await say(engine, conv, 'batería');
  await say(engine, conv, 'Renault Logan');
  const yearAsk = await say(engine, conv, '2015');
  return { conv, yearAsk };
}

describe('ConversationMemory', () => {
  it('guarda, lee y limpia por clave', () => {
    const memory = new ConversationMemory({ defaultTtlMs: 60_000 });
    const engine = new ConversationRecoveryEngine(memory);
    const ctx = createEmptyContext();
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    const saved = engine.saveFromContext('wa:a', 'c1', ctx);
    expect(saved).toBeTruthy();
    expect(memory.get('wa:a')?.summary.vehicleLabel).toMatch(/Logan/);
    memory.clear('wa:a');
    expect(memory.get('wa:a')).toBeNull();
  });

  it('expira por TTL y purgeExpired limpia', () => {
    let now = 1_000;
    const memory = new ConversationMemory({
      defaultTtlMs: 100,
      now: () => now,
    });
    const engine = new ConversationRecoveryEngine(memory);
    const ctx = createEmptyContext();
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    engine.saveFromContext('wa:ttl', 'c1', ctx, 100);
    expect(memory.hasActive('wa:ttl')).toBe(true);
    now = 1_200;
    expect(memory.get('wa:ttl')).toBeNull();
    engine.saveFromContext('wa:ttl2', 'c1', ctx, 100);
    now = 1_400;
    expect(memory.purgeExpired()).toBe(1);
    expect(memory.size()).toBe(0);
  });
});

describe('ConversationRecoveryEngine — unit', () => {
  it('READY_FOR_ADVISOR formatea pregunta de asesor', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const ctx = createEmptyContext();
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    ctx.lastRecommendedReference = 'FAKE-LOG';
    ctx.lastRecommendedReferences = ['FAKE-LOG', 'FAKE-LOG-B'];
    ctx.salesFlow = {
      state: 'READY_FOR_ADVISOR',
      nextAction: 'HANDOFF_TO_ADVISOR',
      vehicle: {
        brand: 'RENAULT',
        model: 'Logan',
        year: '2015',
        vehicleConfirmed: true,
        soundSystem: false,
      },
      hasRecommendation: true,
      matchKind: 'exact',
      leadScore: 90,
    } as never;
    const snap = engine.saveFromContext('wa:adv', 'c1', ctx)!;
    const msg = engine.formatOfferMessage(snap);
    expect(msg).toMatch(/asesor continúe/i);
    expect(msg).toMatch(/Logan/);
    expect(msg).toMatch(/FAKE-LOG/);
  });

  it('incluye contexto técnico en el resumen', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const ctx = createEmptyContext();
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    ctx.lastTechnicalQuestion = '¿Por qué esa batería?';
    ctx.lastTechnicalAnswer = 'Porque tiene buen CCA';
    const summary = engine.buildSummary(ctx);
    expect(summary.lastTechnicalQuestion).toMatch(/por qué/i);
    expect(summary.references).toEqual([]);
  });

  it('restaurar múltiples referencias', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const ctx = createEmptyContext();
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    ctx.lastRecommendedReferences = ['FAKE-LOG', 'FAKE-LOG-B'];
    ctx.lastRecommendedReference = 'FAKE-LOG';
    ctx.recommendedProductIds = ['willard:FAKE-LOG', 'willard:FAKE-LOG-B'];
    const snap = engine.saveFromContext('wa:refs', 'c1', ctx)!;
    expect(snap.summary.references).toEqual(
      expect.arrayContaining(['FAKE-LOG', 'FAKE-LOG-B']),
    );
    const accepted = engine.accept('wa:refs');
    expect(accepted.type).toBe('CONTINUE');
    if (accepted.type === 'CONTINUE') {
      expect(accepted.context.lastRecommendedReferences).toEqual([
        'FAKE-LOG',
        'FAKE-LOG-B',
      ]);
    }
  });
});

describe('Conversation Recovery — integración', () => {
  it('recuperación completa: saludo de retorno ofrece continuar con vehículo', async () => {
    const { engine } = buildSuite();
    const { conv } = await reachYearAsked(engine);

    const offer = await say(engine, conv, 'Hola otra vez');
    expect(offer.reply).toMatch(/Hola de nuevo/i);
    expect(offer.reply).toMatch(/Renault Logan 2015/i);
    expect(offer.reply).toMatch(/continuar donde quedamos/i);
    expect(offer.context.recoveryOfferPending).toBe(true);
    // No restaura el flujo hasta el sí.
    expect(offer.context.vehicle.brand).toBeFalsy();
  });

  it('continuar: sí restaura exactamente el estado (no reinicia)', async () => {
    const { engine, conversationMemory } = buildSuite();
    const { conv, yearAsk } = await reachYearAsked(engine);
    const salesBefore = yearAsk.context.salesFlow?.state;
    const nextBefore = yearAsk.context.salesFlow?.nextAction;

    await say(engine, conv, 'Hola otra vez');
    const cont = await say(engine, conv, 'Sí');

    expect(cont.context.recoveryOfferPending).toBeFalsy();
    expect(cont.context.vehicle.brand?.toUpperCase()).toBe('RENAULT');
    expect(cont.context.vehicle.model).toMatch(/Logan/i);
    expect(cont.context.vehicle.year).toBe('2015');
    expect(cont.context.salesFlow?.state).toBe(salesBefore);
    expect(cont.context.salesFlow?.nextAction).toBe(nextBefore);
    expect(cont.reply).toMatch(/seguimos|Dale/i);
    expect(conversationMemory.hasActive(conv.externalId)).toBe(true);

    // Siguiente turno sigue el flujo (p.ej. confirmación / sonido), no welcome.
    const follow = await say(engine, conv, 'sí');
    expect(follow.reply).not.toMatch(/¿Buscas.*baterías/i);
    expect(follow.context.vehicle.brand?.toUpperCase()).toBe('RENAULT');
  });

  it('reiniciar: no limpia memoria y abre conversación nueva', async () => {
    const { engine, conversationMemory } = buildSuite();
    const { conv } = await reachYearAsked(engine);
    await say(engine, conv, 'Hola otra vez');
    const restart = await say(engine, conv, 'No');

    expect(restart.reply).toMatch(/empezamos de cero/i);
    expect(restart.context.vehicle.brand).toBeFalsy();
    expect(restart.context.salesFlow).toBeFalsy();
    expect(restart.context.recoveryOfferPending).toBeFalsy();
    expect(conversationMemory.get(conv.externalId)).toBeNull();
  });

  it('memoria expirada: no ofrece continuar', async () => {
    let now = 10_000;
    const { engine, conversationMemory } = buildSuite({
      recoveryTtlMs: 500,
      now: () => now,
    });
    const { conv } = await reachYearAsked(engine);
    expect(conversationMemory.hasActive(conv.externalId)).toBe(true);

    now = 10_000 + 600;
    // Simula sesión nueva (TTL HTTP) con el mismo externalId.
    conv.context = createEmptyContext();
    conv.messages = [];

    const greet = await say(engine, conv, 'Hola otra vez');
    expect(greet.reply).not.toMatch(/continuar donde quedamos/i);
    expect(greet.context.recoveryOfferPending).toBeFalsy();
  });

  it('READY_FOR_ADVISOR: solo pregunta por el asesor', async () => {
    const { engine, conversationRecoveryEngine } = buildSuite();
    const conv = conversation('wa:ready-adv');
    const ctx = createEmptyContext();
    ctx.category = 'baterias';
    ctx.intent = 'baterias';
    ctx.stage = 'handoff';
    ctx.needsHumanHandoff = true;
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    ctx.lastRecommendedReference = 'FAKE-LOG';
    ctx.lastRecommendedReferences = ['FAKE-LOG', 'FAKE-LOG-B'];
    ctx.recommendedProductIds = ['willard:FAKE-LOG', 'willard:FAKE-LOG-B'];
    ctx.salesFlow = {
      state: 'READY_FOR_ADVISOR',
      nextAction: 'HANDOFF_TO_ADVISOR',
      vehicle: {
        brand: 'RENAULT',
        model: 'Logan',
        year: '2015',
        vehicleConfirmed: true,
        soundSystem: false,
      },
      hasRecommendation: true,
      matchKind: 'exact',
      leadScore: 95,
    } as never;
    conv.context = ctx;
    conversationRecoveryEngine.saveFromContext(
      conv.externalId,
      conv.customerId,
      ctx,
    );

    // Sesión “nueva” + retorno.
    conv.context = createEmptyContext();
    const offer = await say(engine, conv, 'Hola otra vez');
    expect(offer.reply).toMatch(/asesor continúe con el proceso/i);
    expect(offer.reply).toMatch(/Logan/);
    expect(offer.reply).toMatch(/FAKE-LOG/);

    const cont = await say(engine, conv, 'sí');
    expect(cont.context.salesFlow?.state).toBe('READY_FOR_ADVISOR');
    expect(cont.context.lastRecommendedReference).toBe('FAKE-LOG');
    expect(cont.reply).toMatch(/asesor/i);
  });

  it('pregunta técnica: restaura contexto técnico', async () => {
    const { engine } = buildSuite();
    const conv = conversation('wa:tech');
    await say(engine, conv, 'batería');
    await say(engine, conv, 'Renault Logan 2015');
    await say(engine, conv, 'sí');
    await say(engine, conv, 'no'); // sin planta de sonido → recomendación
    const tech = await say(engine, conv, '¿Por qué esa batería?');
    expect(tech.context.lastTechnicalQuestion).toBeTruthy();
    expect(tech.context.lastTechnicalAnswer).toBeTruthy();
    const salesState = tech.context.salesFlow?.state;

    await say(engine, conv, 'Hola de nuevo');
    const cont = await say(engine, conv, 'sí');
    expect(cont.context.lastTechnicalQuestion).toBe(tech.context.lastTechnicalQuestion);
    expect(cont.context.lastTechnicalAnswer).toBe(tech.context.lastTechnicalAnswer);
    expect(cont.context.salesFlow?.state).toBe(salesState);
  });

  it('múltiples referencias: se restauran todas', async () => {
    const { engine, conversationRecoveryEngine } = buildSuite();
    const conv = conversation('wa:multi');
    const ctx = createEmptyContext();
    ctx.category = 'baterias';
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    ctx.lastRecommendedReference = 'FAKE-LOG';
    ctx.lastRecommendedReferences = ['FAKE-LOG', 'FAKE-LOG-B'];
    ctx.recommendedProductIds = ['willard:FAKE-LOG', 'willard:FAKE-LOG-B'];
    ctx.salesFlow = {
      state: 'WAITING_CONFIRMATION',
      nextAction: 'ASK_INTEREST_AFTER_RECOMMENDATION',
      vehicle: {
        brand: 'RENAULT',
        model: 'Logan',
        year: '2015',
        vehicleConfirmed: true,
        soundSystem: false,
      },
      hasRecommendation: true,
      matchKind: 'exact',
      leadScore: 70,
    } as never;
    conversationRecoveryEngine.saveFromContext(
      conv.externalId,
      conv.customerId,
      ctx,
    );

    await say(engine, conv, 'Hola otra vez');
    const cont = await say(engine, conv, 'sí');
    expect(cont.context.lastRecommendedReferences).toEqual([
      'FAKE-LOG',
      'FAKE-LOG-B',
    ]);
    expect(cont.context.recommendedProductIds).toEqual([
      'willard:FAKE-LOG',
      'willard:FAKE-LOG-B',
    ]);
  });

  it('conversación nueva: primer hola no ofrece recuperación', async () => {
    const { engine } = buildSuite();
    const conv = conversation('wa:fresh');
    const greet = await say(engine, conv, 'Hola');
    expect(greet.reply).not.toMatch(/continuar donde quedamos/i);
    expect(greet.context.recoveryOfferPending).toBeFalsy();
    expect(greet.reply).toMatch(/Rodacenter|baterías|rodamientos/i);
  });

  it('dos conversaciones simultáneas: memorias aisladas por externalId', async () => {
    const { engine, conversationMemory } = buildSuite();
    const a = conversation('wa:user-a');
    const b = conversation('wa:user-b');

    await say(engine, a, 'batería');
    await say(engine, a, 'Renault Logan');
    await say(engine, a, '2015');

    await say(engine, b, 'batería');
    await say(engine, b, 'Mazda');
    await say(engine, b, 'Mazda 2 HB All New');

    const offerA = await say(engine, a, 'Hola otra vez');
    const offerB = await say(engine, b, 'Hola otra vez');

    expect(offerA.reply).toMatch(/Logan/i);
    expect(offerA.reply).not.toMatch(/Mazda/i);
    expect(offerB.reply).toMatch(/Mazda/i);
    expect(offerB.reply).not.toMatch(/Logan/i);

    expect(conversationMemory.get('wa:user-a')?.summary.vehicleLabel).toMatch(
      /Logan/i,
    );
    expect(conversationMemory.get('wa:user-b')?.summary.vehicleLabel).toMatch(
      /Mazda/i,
    );
  });

  it('accept sin memoria → reinicio amable', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const decision = engine.accept('missing');
    expect(decision.type).toBe('RESTART');
  });

  it('oferta pendiente con respuesta ambigua re-pregunta', async () => {
    const { engine } = buildSuite();
    const { conv } = await reachYearAsked(engine);
    await say(engine, conv, 'Hola otra vez');
    const again = await say(engine, conv, 'tal vez');
    expect(again.reply).toMatch(/continuar donde quedamos/i);
    expect(again.context.recoveryOfferPending).toBe(true);
  });

  it('hola simple con sesión viva no interrumpe (NONE)', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const ctx = createEmptyContext();
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    engine.saveFromContext('wa:live', 'c1', ctx);
    const decision = engine.evaluateReturn('wa:live', 'Hola', ctx);
    expect(decision.type).toBe('NONE');
  });

  it('hola simple con sesión vacía sí ofrece', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const ctx = createEmptyContext();
    ctx.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    engine.saveFromContext('wa:empty', 'c1', ctx);
    const decision = engine.evaluateReturn(
      'wa:empty',
      'Hola',
      createEmptyContext(),
    );
    expect(decision.type).toBe('OFFER');
  });
});

describe('ConversationRecoveryEngine — cobertura de mensajes', () => {
  it('oferta con varias referencias sin primaryReference', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const snap = {
      memoryKey: 'k',
      customerId: 'c',
      savedAt: 1,
      expiresAt: 9e12,
      context: createEmptyContext(),
      summary: {
        vehicleLabel: 'RENAULT Logan 2015',
        references: ['FAKE-LOG', 'FAKE-LOG-B'],
        lastTechnicalQuestion: undefined,
      },
    };
    const msg = engine.formatOfferMessage(snap);
    expect(msg).toMatch(/FAKE-LOG/);
    expect(msg).toMatch(/FAKE-LOG-B/);
  });

  it('oferta técnica sin referencia + truncate', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const longQ = `¿${'x'.repeat(120)}?`;
    const snap = {
      memoryKey: 'k',
      customerId: 'c',
      savedAt: 1,
      expiresAt: 9e12,
      context: createEmptyContext(),
      summary: {
        vehicleLabel: '',
        references: [] as string[],
        lastTechnicalQuestion: longQ,
      },
    };
    const msg = engine.formatOfferMessage(snap);
    expect(msg).toMatch(/tu vehículo/i);
    expect(msg).toMatch(/habíamos tocado/i);
    expect(msg).toMatch(/…/);
  });

  it('READY_FOR_ADVISOR sin referencia', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    const msg = engine.formatOfferMessage({
      memoryKey: 'k',
      customerId: 'c',
      savedAt: 1,
      expiresAt: 9e12,
      context: createEmptyContext(),
      summary: {
        vehicleLabel: '',
        references: [],
        salesState: 'READY_FOR_ADVISOR',
      },
    });
    expect(msg).toMatch(/asesor continúe/i);
    expect(msg).toMatch(/tu vehículo/i);
  });

  it('hints de nextAction cubren el switch', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);

    const actions = [
      'ASK_VEHICLE',
      'ASK_MODEL',
      'ASK_YEAR',
      'CONFIRM_VEHICLE',
      'ASK_SOUND',
      'ASK_INTEREST_AFTER_RECOMMENDATION',
      'SHOW_RECOMMENDATION',
      'HANDOFF_TO_ADVISOR',
      'CLARIFY_VEHICLE',
    ] as const;

    for (const nextAction of actions) {
      const ctx = createEmptyContext();
      ctx.salesFlow = {
        state: 'IDENTIFYING_VEHICLE',
        nextAction,
        vehicle: {
          brand: nextAction === 'ASK_MODEL' ? 'RENAULT' : undefined,
          model: undefined,
          year: undefined,
        },
        hasRecommendation: false,
        leadScore: 10,
        readyForAdvisor: false,
      } as never;
      const cont = engine.formatContinueMessage({
        memoryKey: 'k',
        customerId: 'c',
        savedAt: 1,
        expiresAt: 9e12,
        context: ctx,
        summary: { vehicleLabel: 'x', references: [] },
      });
      expect(cont).toMatch(/Dale|seguimos|modelo|año|Confirmamos|sonido|recomendación|asesor|Seguimos|vehículo|ayudo/i);
    }

    const noSales = createEmptyContext();
    noSales.category = 'baterias';
    expect(
      engine.formatContinueMessage({
        memoryKey: 'k',
        customerId: 'c',
        savedAt: 1,
        expiresAt: 9e12,
        context: noSales,
        summary: { vehicleLabel: '', references: [] },
      }),
    ).toMatch(/batería Willard/i);

    expect(
      engine.formatContinueMessage({
        memoryKey: 'k',
        customerId: 'c',
        savedAt: 1,
        expiresAt: 9e12,
        context: createEmptyContext(),
        summary: { vehicleLabel: '', references: [] },
      }),
    ).toMatch(/En qué te ayudo/i);

    const askModelNoBrand = createEmptyContext();
    askModelNoBrand.salesFlow = {
      state: 'IDENTIFYING_VEHICLE',
      nextAction: 'ASK_MODEL',
      vehicle: {},
      hasRecommendation: false,
      leadScore: 0,
      readyForAdvisor: false,
    } as never;
    expect(
      engine.formatContinueMessage({
        memoryKey: 'k',
        customerId: 'c',
        savedAt: 1,
        expiresAt: 9e12,
        context: askModelNoBrand,
        summary: { vehicleLabel: '', references: [] },
      }),
    ).toMatch(/Qué modelo es\?/i);
  });

  it('buildSnapshot null sin progreso; decline limpia', () => {
    const memory = new ConversationMemory();
    const engine = new ConversationRecoveryEngine(memory);
    expect(engine.buildSnapshot('k', 'c', createEmptyContext())).toBeNull();
    expect(engine.saveFromContext('k', 'c', createEmptyContext())).toBeNull();

    const ctx = createEmptyContext();
    ctx.lastTechnicalAnswer = 'cca';
    engine.saveFromContext('k', 'c', ctx);
    const declined = engine.decline('k');
    expect(declined.type).toBe('RESTART');
    expect(memory.get('k')).toBeNull();
  });

  it('detecta continue/decline variants y return greetings', () => {
    const engine = new ConversationRecoveryEngine(new ConversationMemory());
    expect(engine.isContinueReply('continuar')).toBe(true);
    expect(engine.isDeclineReply('desde cero')).toBe(true);
    expect(engine.isExplicitReturnGreeting('Hola nuevamente')).toBe(true);
    expect(engine.isReturnGreeting('buenas tardes')).toBe(true);
    expect(engine.evaluateReturn('x', 'quiero batería').type).toBe('NONE');
  });
});
