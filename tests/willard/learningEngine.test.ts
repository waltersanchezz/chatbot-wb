import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, afterEach } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { LearningEngine } from '../../src/application/services/LearningEngine';
import { SQLiteLearningRepository } from '../../src/infrastructure/persistence/SQLiteLearningRepository';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';
import type { ConversationEngine } from '../../src/application/services/ConversationEngine';

describe('LearningEngine + SQLiteLearningRepository', () => {
  const repos: SQLiteLearningRepository[] = [];

  afterEach(() => {
    for (const r of repos) {
      try {
        r.close();
      } catch {
        /* ignore */
      }
    }
    repos.length = 0;
  });

  function build(now = () => 1_000_000) {
    const repository = new SQLiteLearningRepository(':memory:', { now });
    repos.push(repository);
    const engine = new LearningEngine(repository, now);
    return { engine, repository };
  }

  it('registro: guarda marca, modelo, año, referencia, matchKind, intent, técnico', () => {
    const { engine } = build();
    const event = engine.record({
      conversationId: 'c1',
      waId: 'wa:1',
      brand: 'RENAULT',
      model: 'Logan',
      year: '2015',
      reference: 'FAKE-LOG',
      matchKind: 'exact',
      intent: 'baterias',
      technicalQuestion: '¿Por qué esa batería?',
      accepted: null,
      abandoned: false,
      durationMs: 12_000,
      salesState: 'WAITING_CONFIRMATION',
    });

    expect(event.id).toBeTruthy();
    expect(event.brand).toBe('RENAULT');
    expect(event.model).toBe('Logan');
    expect(event.year).toBe('2015');
    expect(event.reference).toBe('FAKE-LOG');
    expect(event.matchKind).toBe('exact');
    expect(event.intent).toBe('baterias');
    expect(event.technicalQuestion).toMatch(/por qué/i);
    expect(event.timestamp).toBe(1_000_000);
    expect(engine.count()).toBe(1);
  });

  it('conteo y listEvents', () => {
    const { engine } = build();
    engine.record({ conversationId: 'a', waId: 'wa:a', brand: 'A' });
    engine.record({ conversationId: 'b', waId: 'wa:b', brand: 'B' });
    expect(engine.count()).toBe(2);
    expect(engine.listEvents({ limit: 10 })).toHaveLength(2);
  });

  it('ranking: top vehículos, marcas, referencias, preguntas, técnicas, recomendaciones', () => {
    const { engine } = build();

    for (let i = 0; i < 3; i += 1) {
      engine.record({
        conversationId: `logan-${i}`,
        waId: `wa:l-${i}`,
        brand: 'RENAULT',
        model: 'Logan',
        year: '2015',
        reference: 'FAKE-LOG',
        matchKind: 'exact',
        question: 'necesito batería para logan',
        salesState: 'WAITING_CONFIRMATION',
        accepted: i === 0 ? true : null,
      });
    }
    engine.record({
      conversationId: 'mazda-1',
      waId: 'wa:m',
      brand: 'MAZDA',
      model: '2',
      year: '2020',
      reference: 'FAKE-M2',
      question: 'batería mazda',
      technicalQuestion: '¿Cuál dura más?',
      salesState: 'READY_FOR_ADVISOR',
      accepted: true,
    });
    engine.record({
      conversationId: 'tech-2',
      waId: 'wa:t',
      brand: 'RENAULT',
      model: 'Logan',
      year: '2015',
      technicalQuestion: '¿Por qué esa batería?',
    });

    const vehicles = engine.topVehicles({ limit: 5 });
    expect(vehicles[0]?.label).toMatch(/RENAULT Logan 2015/);
    expect(vehicles[0]?.count).toBeGreaterThanOrEqual(3);

    expect(engine.topBrands()[0]?.key).toBe('RENAULT');
    expect(engine.topReferences()[0]?.key).toBe('FAKE-LOG');
    expect(engine.topQuestions().some((q) => /logan/i.test(q.key))).toBe(true);
    expect(
      engine.topTechnicalQuestions().some((q) => /dura más|por qué/i.test(q.key)),
    ).toBe(true);
    expect(engine.topRecommendations()[0]?.key).toBe('FAKE-LOG');
  });

  it('estadísticas: finished, abandoned, averageDuration', () => {
    const { engine } = build();
    engine.record({
      conversationId: 'fin-1',
      waId: 'wa:f1',
      brand: 'RENAULT',
      model: 'Logan',
      year: '2015',
      reference: 'FAKE-LOG',
      accepted: true,
      salesState: 'READY_FOR_ADVISOR',
      durationMs: 10_000,
    });
    engine.record({
      conversationId: 'fin-1',
      waId: 'wa:f1',
      brand: 'RENAULT',
      model: 'Logan',
      year: '2015',
      durationMs: 20_000,
      salesState: 'READY_FOR_ADVISOR',
      accepted: true,
    });
    engine.record({
      conversationId: 'abd-1',
      waId: 'wa:a1',
      brand: 'MAZDA',
      model: '2',
      abandoned: true,
      salesState: 'CLOSED',
      durationMs: 5_000,
    });

    expect(engine.finishedConversations()).toBeGreaterThanOrEqual(1);
    expect(engine.abandonedConversations()).toBe(1);
    expect(engine.averageDurationMs()).toBeGreaterThan(0);

    const stats = engine.getStats({ limit: 3 });
    expect(stats.totalEvents).toBe(3);
    expect(stats.abandonedConversations).toBe(1);
    expect(stats.topBrands.length).toBeGreaterThan(0);
    expect(stats.averageDurationMs).toBeGreaterThan(0);
  });

  it('consultas: getStats no expone SQL', () => {
    const { engine } = build();
    engine.record({
      conversationId: 'c',
      waId: 'wa:c',
      brand: 'CHEVROLET',
      model: 'Spark',
      year: '2018',
      reference: 'FAKE-SP',
      intent: 'baterias',
    });
    const stats = engine.getStats();
    const json = JSON.stringify(stats);
    expect(json).not.toMatch(/SELECT|FROM learning|INSERT INTO/i);
    expect(stats.topVehicles[0]?.label).toMatch(/Spark/);
  });

  it('integridad: normaliza vacíos y accepted tri-state', () => {
    const { engine, repository } = build();
    const a = engine.record({
      conversationId: 'i1',
      waId: 'wa:i1',
      brand: '  ',
      model: null,
      accepted: null,
      abandoned: false,
    });
    expect(a.brand).toBeNull();
    expect(a.accepted).toBeNull();

    const b = engine.record({
      conversationId: 'i2',
      waId: 'wa:i2',
      brand: 'KIA',
      accepted: false,
      abandoned: true,
    });
    expect(b.accepted).toBe(false);
    expect(b.abandoned).toBe(true);

    const listed = repository.listEvents({ limit: 5 });
    expect(listed.some((e) => e.accepted === false)).toBe(true);
    expect(listed.some((e) => e.accepted === null)).toBe(true);
  });

  it('recordTurn detecta aceptación y abandono', () => {
    const { engine } = build(() => 2_000_000);
    const conversation = {
      id: 'c-turn',
      customerId: 'u',
      channel: 'whatsapp' as const,
      externalId: 'wa:turn',
      context: createEmptyContext(),
      messages: [],
      createdAt: new Date(2_000_000 - 15_000),
      updatedAt: new Date(),
      expiresAt: new Date(2_000_000 + 60_000),
    };

    const prev = createEmptyContext();
    prev.salesFlow = {
      state: 'WAITING_CONFIRMATION',
      nextAction: 'ASK_INTEREST_AFTER_RECOMMENDATION',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015' },
      hasRecommendation: true,
      matchKind: 'exact',
      leadScore: 70,
      readyForAdvisor: false,
    } as never;
    prev.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    prev.lastRecommendedReference = 'FAKE-LOG';

    const next = structuredClone(prev);
    next.salesFlow = {
      ...prev.salesFlow!,
      state: 'READY_FOR_ADVISOR',
      readyForAdvisor: true,
      nextAction: 'HANDOFF_TO_ADVISOR',
    };

    const accepted = engine.recordTurn({
      conversation,
      context: next,
      previousContext: prev,
      userMessage: 'sí',
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.abandoned).toBe(false);
    expect(accepted.durationMs).toBe(15_000);

    const abandonedPrev = createEmptyContext();
    abandonedPrev.vehicle = { brand: 'MAZDA', model: '2', year: '2020' };
    abandonedPrev.salesFlow = {
      state: 'IDENTIFYING_VEHICLE',
      nextAction: 'ASK_YEAR',
      vehicle: { brand: 'MAZDA', model: '2' },
      hasRecommendation: false,
      leadScore: 10,
      readyForAdvisor: false,
    } as never;

    const empty = createEmptyContext();
    const abd = engine.recordTurn({
      conversation: { ...conversation, id: 'c-abd' },
      context: empty,
      previousContext: abandonedPrev,
      userMessage: 'no',
    });
    expect(abd.abandoned).toBe(true);
  });

  it('recordTurn: rechazo, READY directo y CLOSED abandonado', () => {
    const { engine } = build();
    const conversation = {
      id: 'c-branch',
      customerId: 'u',
      channel: 'whatsapp' as const,
      externalId: 'wa:branch',
      context: createEmptyContext(),
      messages: [],
      createdAt: new Date(Date.now() - 2000),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };

    const waiting = createEmptyContext();
    waiting.salesFlow = {
      state: 'WAITING_CONFIRMATION',
      nextAction: 'ASK_INTEREST_AFTER_RECOMMENDATION',
      vehicle: { brand: 'RENAULT', model: 'Logan', year: '2015' },
      hasRecommendation: true,
      matchKind: 'exact',
      leadScore: 70,
      readyForAdvisor: false,
    } as never;
    waiting.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };

    const rejected = structuredClone(waiting);
    rejected.salesFlow = {
      ...waiting.salesFlow!,
      state: 'IDENTIFYING_VEHICLE',
      nextAction: 'ASK_VEHICLE',
      hasRecommendation: false,
    };

    const no = engine.recordTurn({
      conversation,
      context: rejected,
      previousContext: waiting,
      userMessage: 'no',
    });
    expect(no.accepted).toBe(false);

    const emptyPrev = createEmptyContext();
    const ready = createEmptyContext();
    ready.vehicle = { brand: 'KIA', model: 'Rio', year: '2019' };
    ready.lastRecommendedReference = 'FAKE-KIA';
    ready.salesFlow = {
      state: 'READY_FOR_ADVISOR',
      nextAction: 'HANDOFF_TO_ADVISOR',
      vehicle: { brand: 'KIA', model: 'Rio', year: '2019' },
      hasRecommendation: true,
      matchKind: 'similar',
      leadScore: 80,
      readyForAdvisor: true,
    } as never;
    const readyEvt = engine.recordTurn({
      conversation: { ...conversation, id: 'c-ready' },
      context: ready,
      previousContext: emptyPrev,
      userMessage: 'asesor',
    });
    expect(readyEvt.accepted).toBe(true);

    const closed = createEmptyContext();
    closed.salesFlow = {
      state: 'CLOSED',
      nextAction: 'END_CONVERSATION',
      vehicle: {},
      hasRecommendation: false,
      leadScore: 0,
      readyForAdvisor: false,
    } as never;
    const closedEvt = engine.recordTurn({
      conversation: { ...conversation, id: 'c-closed' },
      context: closed,
      previousContext: waiting,
      userMessage: 'chao',
    });
    expect(closedEvt.abandoned).toBe(true);
  });

  it('archivo en disco + averageDuration vacío = 0', () => {
    const file = path.join(os.tmpdir(), `learning-${Date.now()}.sqlite`);
    const repository = new SQLiteLearningRepository(file);
    repos.push(repository);
    const engine = new LearningEngine(repository);
    expect(engine.averageDurationMs()).toBe(0);
    engine.record({ conversationId: 'x', waId: 'wa:x', brand: 'FORD', durationMs: 100 });
    expect(engine.count()).toBe(1);
    repository.close();
    try {
      fs.unlinkSync(file);
      fs.unlinkSync(`${file}-wal`);
      fs.unlinkSync(`${file}-shm`);
    } catch {
      /* ignore */
    }
  });

  it('recordTurn registra pregunta técnica nueva', () => {
    const { engine } = build();
    const conversation = {
      id: 'c-tech',
      customerId: 'u',
      channel: 'whatsapp' as const,
      externalId: 'wa:tech',
      context: createEmptyContext(),
      messages: [],
      createdAt: new Date(Date.now() - 1000),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const prev = createEmptyContext();
    prev.vehicle = { brand: 'RENAULT', model: 'Logan', year: '2015' };
    prev.lastRecommendedReference = 'FAKE-LOG';

    const next = structuredClone(prev);
    next.lastTechnicalQuestion = '¿Por qué esa batería?';
    next.lastTechnicalAnswer = 'CCA';

    const event = engine.recordTurn({
      conversation,
      context: next,
      previousContext: prev,
      userMessage: '¿Por qué esa batería?',
    });
    expect(event.technicalQuestion).toMatch(/por qué/i);
    expect(event.question).toBeNull();
  });
});

describe('ConversationEngine → LearningEngine integración', () => {
  it('process registra eventos automáticamente', async () => {
    const learningRepo = new SQLiteLearningRepository(':memory:');
    const learningEngine = new LearningEngine(learningRepo);

    const apps = [
      hit({
        marca: 'RENAULT',
        modelo: 'Logan',
        textoCatalogo: 'Logan',
        refs: { willard: ['FAKE-LOG'] },
        fila: 1,
      }),
    ];
    const specs = new Map<string, WillardReferenceSpec>([
      ['FAKE-LOG', { ...spec('FAKE-LOG'), cca18C: 620 }],
    ]);
    const knowledge = new FakeWillardBatteryKnowledge(apps, specs);
    const { engine } = buildTestConversationEngine(
      knowledge,
      catalogRowsFromHits(apps),
      { learningEngine },
    );

    const conv = {
      id: 'c-learn-int',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:learn-int',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(Date.now() - 30_000),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    async function say(e: ConversationEngine, msg: string) {
      const result = await e.process(conv as never, msg);
      conv.context = result.context;
      conv.messages.push({ role: 'customer', content: msg });
      return result;
    }

    await say(engine, 'batería');
    await say(engine, 'Renault Logan');
    await say(engine, '2015');

    expect(learningEngine.count()).toBeGreaterThanOrEqual(2);
    const brands = learningEngine.topBrands();
    expect(brands.some((b) => b.key.toUpperCase() === 'RENAULT')).toBe(true);
    const vehicles = learningEngine.topVehicles();
    expect(vehicles.some((v) => /Logan/i.test(v.label))).toBe(true);

    learningRepo.close();
  });
});
