import { describe, expect, it } from 'vitest';
import {
  matchPendingModelOption,
  normalizeModelSelectionKey,
} from '../../src/application/flows/batteryFlow';
import type { ConversationEngine } from '../../src/application/services/ConversationEngine';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';

function buildEngine() {
  const apps = [
    hit({
      marca: 'MAZDA',
      modelo: 'Mazda 3 Skyactive',
      textoCatalogo: 'Mazda 3 Skyactive',
      refs: { willard: ['FAKE-SKY'] },
      fila: 1,
    }),
    hit({
      marca: 'MAZDA',
      modelo: 'Mazda 3 All New',
      textoCatalogo: 'Mazda 3 All New',
      refs: { willard: ['FAKE-ALLNEW'] },
      fila: 2,
    }),
  ];
  const specs = new Map<string, WillardReferenceSpec>([
    ['FAKE-SKY', { ...spec('FAKE-SKY'), cca18C: 550 }],
    ['FAKE-ALLNEW', { ...spec('FAKE-ALLNEW'), cca18C: 560 }],
  ]);
  const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
  return buildTestConversationEngine(knowledge, catalogRowsFromHits(apps)).engine;
}

function conversation() {
  return {
    id: 'c1',
    customerId: 'u1',
    channel: 'whatsapp' as const,
    externalId: 'wa:1',
    context: createEmptyContext(),
    messages: [] as { role: string; content: string }[],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

async function reachAmbiguousList(engine: ConversationEngine) {
  const conv = conversation();
  // Con Orchestrator + VehicleInterpreter, el empate aparece al pedir el modelo.
  for (const msg of ['batería', 'Mazda 3'] as const) {
    const step = await engine.process(conv as never, msg);
    conv.context = step.context;
    conv.messages.push({ role: 'customer', content: msg });
    if (msg === 'Mazda 3') {
      return { conv, result: step };
    }
  }
  throw new Error('expected ambiguous step');
}

describe('normalizeModelSelectionKey / matchPendingModelOption', () => {
  it('ignores case and spaces', () => {
    expect(normalizeModelSelectionKey('Mazda 3 Skyactive')).toBe(
      'mazda3skyactive',
    );
    expect(normalizeModelSelectionKey('  mazda  3   skyactive ')).toBe(
      'mazda3skyactive',
    );
  });

  it('matches a pending option and returns the canonical label', () => {
    const options = ['Mazda 3 Skyactive', 'Mazda 3 All New'];
    expect(matchPendingModelOption('mazda3skyactive', options)).toBe(
      'Mazda 3 Skyactive',
    );
    expect(matchPendingModelOption('Mazda  3  All New', options)).toBe(
      'Mazda 3 All New',
    );
    expect(matchPendingModelOption('CX30', options)).toBeUndefined();
  });

  it('fuzzy-matches pending options (typos / partial) without requiring exact label', () => {
    const options = ['Mazda 3 Skyactive', 'Mazda 3 All New'];
    expect(matchPendingModelOption('mazda 3 skyactiv', options)).toBe(
      'Mazda 3 Skyactive',
    );
    expect(
      matchPendingModelOption('chevrolet spark gt', options, 'chevrolet'),
    ).toBeUndefined();
    expect(matchPendingModelOption('skyactive', options)).toBe(
      'Mazda 3 Skyactive',
    );
  });
});

describe('ConversationEngine pending model selection (Orchestrator)', () => {
  it('stores pending options when interpreter returns tied models', async () => {
    const engine = buildEngine();
    const { result } = await reachAmbiguousList(engine);

    expect(result.reply).toMatch(/varias opciones parecidas|varios modelos/i);
    expect(result.reply).toContain('Mazda 3 Skyactive');
    expect(result.reply).toContain('Mazda 3 All New');
    expect(result.context.pendingModelOptions).toEqual(
      expect.arrayContaining(['Mazda 3 Skyactive', 'Mazda 3 All New']),
    );
    expect(result.context.pendingModelOptions).toHaveLength(2);
    expect(result.context.vehicle.year).toBeUndefined();
    expect(result.context.battery.soundSystem).toBeUndefined();
  });

  it('selecting a listed option sets model, clears pending, and asks for year — no loop', async () => {
    const engine = buildEngine();
    const { conv, result: ambiguous } = await reachAmbiguousList(engine);
    conv.context = ambiguous.context;

    const selected = await engine.process(conv as never, 'Mazda 3 Skyactive');

    expect(selected.context.vehicle.model).toBe('Mazda 3 Skyactive');
    expect(selected.context.pendingModelOptions).toBeUndefined();
    expect(selected.context.stage).toBe('collecting_vehicle');
    expect(selected.reply).toMatch(/a[nñ]o/i);
    expect(selected.reply).not.toContain('varios modelos');
  });

  it('matches pending option ignoring case and extra spaces', async () => {
    const engine = buildEngine();
    const { conv, result: ambiguous } = await reachAmbiguousList(engine);
    conv.context = ambiguous.context;

    const selected = await engine.process(
      conv as never,
      '  mazda  3   skyactive ',
    );

    expect(selected.context.vehicle.model).toBe('Mazda 3 Skyactive');
    expect(selected.context.pendingModelOptions).toBeUndefined();
    expect(selected.reply).toMatch(/a[nñ]o/i);
    expect(selected.reply).not.toContain('varios modelos');
  });

  it('All New selection then non-year on ASK_YEAR does not reopen model list', async () => {
    const engine = buildEngine();
    const { conv, result: ambiguous } = await reachAmbiguousList(engine);
    conv.context = ambiguous.context;

    const selected = await engine.process(conv as never, 'All New');
    expect(selected.context.vehicle.model).toBe('Mazda 3 All New');
    expect(selected.context.pendingModelOptions).toBeUndefined();
    expect(selected.reply).toMatch(/a[nñ]o/i);
    expect(selected.reply).not.toMatch(/varias opciones|varios modelos/i);

    conv.context = selected.context;
    const again = await engine.process(conv as never, 'All New');
    expect(again.reply).toMatch(/a[nñ]o/i);
    expect(again.reply).not.toMatch(/varias opciones|varios modelos/i);
    expect(again.context.vehicle.model).toBe('Mazda 3 All New');
    expect(again.context.salesFlow?.nextAction).toBe('ASK_YEAR');

    conv.context = again.context;
    const yearStep = await engine.process(conv as never, '2018');
    expect(yearStep.reply).not.toMatch(/varias opciones|varios modelos/i);
    expect(yearStep.context.vehicle.model).toBe('Mazda 3 All New');
    expect(yearStep.context.vehicle.year).toBe('2018');
    expect(yearStep.context.salesFlow?.nextAction).not.toBe('ASK_MODEL');
  });

  it('does not loop: after selection, year + sound lead to a single-model match', async () => {
    const engine = buildEngine();
    const { conv, result: ambiguous } = await reachAmbiguousList(engine);
    conv.context = ambiguous.context;

    conv.context = (await engine.process(conv as never, 'Mazda 3 Skyactive'))
      .context;
    conv.context = (await engine.process(conv as never, '2019')).context;
    const final = await engine.process(conv as never, 'no');

    expect(final.reply).not.toContain('varios modelos');
    expect(final.context.pendingModelOptions).toBeUndefined();
    expect(final.context.needsHumanHandoff).toBe(false);
    expect(final.reply).toContain('FAKE-SKY');
    expect(final.reply).not.toContain('FAKE-ALLNEW');
  });

  it('non-matching reply clears pending and uses the message as new model (no stuck loop)', async () => {
    const engine = buildEngine();
    const { conv, result: ambiguous } = await reachAmbiguousList(engine);
    conv.context = ambiguous.context;

    const next = await engine.process(conv as never, 'CX30 Hybrid');

    expect(next.context.pendingModelOptions).toBeUndefined();
    expect(next.context.vehicle.model).toBe('CX30 Hybrid');
    expect(next.reply).toMatch(/a[nñ]o/i);
  });

  it('survives lost pendingModelOptions: catalog exact match from message still selects', async () => {
    const engine = buildEngine();
    const { conv, result: ambiguous } = await reachAmbiguousList(engine);

    conv.context = {
      ...ambiguous.context,
      pendingModelOptions: undefined,
      vehicle: {
        brand: 'MAZDA',
        model: 'Mazda 3',
        year: '2018',
      },
      battery: { soundSystem: false },
      vehicleConfirmed: true,
      salesFlow: undefined,
    };

    const selected = await engine.process(conv as never, 'mazda 3 skyactive');

    expect(selected.context.vehicle.model).toBe('Mazda 3 Skyactive');
    expect(selected.reply).not.toContain('varios modelos');
    expect(selected.reply).toMatch(/FAKE-SKY|planta|Referencia|sí/i);
  });
});
