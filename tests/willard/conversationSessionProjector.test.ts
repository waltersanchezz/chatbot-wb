import { describe, expect, it } from 'vitest';
import {
  ConversationSessionProjector,
  projectConversationToSession,
} from '../../src/application/persistence/ConversationSessionProjector';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import type { Conversation } from '../../src/domain/entities/Conversation';
import type { ConversationMemorySnapshot } from '../../src/domain/conversation/conversationMemory';

function greetingConversation(): Conversation {
  const context = createEmptyContext();
  context.stage = 'awaiting_category';
  context.intent = 'greeting';

  return {
    id: 'conv-greet-1',
    customerId: 'cust-1',
    channel: 'whatsapp',
    externalId: 'whatsapp:573001112233',
    context,
    messages: [
      {
        id: 'in-1',
        conversationId: 'conv-greet-1',
        role: 'customer',
        content: 'Hola',
        createdAt: new Date('2026-08-04T15:00:00.000Z'),
        metadata: { customerName: 'Ana Pérez' },
      },
      {
        id: 'out-1',
        conversationId: 'conv-greet-1',
        role: 'assistant',
        content: '¡Hola! Bienvenido a Rodacenter.',
        createdAt: new Date('2026-08-04T15:00:01.000Z'),
      },
    ],
    createdAt: new Date('2026-08-04T15:00:00.000Z'),
    updatedAt: new Date('2026-08-04T15:00:01.000Z'),
    expiresAt: new Date('2026-08-04T17:00:00.000Z'),
  };
}

function batteryConversation(): Conversation {
  const context = createEmptyContext();
  context.category = 'baterias';
  context.intent = 'baterias';
  context.stage = 'presenting_options';
  context.vehicle = { brand: 'CHEVROLET', model: 'Spark', year: '2018' };
  context.lastRecommendedReference = '75D23L';
  context.lastRecommendedReferences = ['75D23L'];
  context.recommendedProductIds = ['willard:75D23L'];
  context.salesFlow = {
    state: 'WAITING_CONFIRMATION',
    nextAction: 'ASK_INTEREST_AFTER_RECOMMENDATION',
    vehicle: {
      brand: 'CHEVROLET',
      model: 'Spark',
      year: '2018',
      vehicleConfirmed: true,
      soundSystem: false,
    },
    hasRecommendation: true,
    matchKind: 'exact',
    leadScore: 80,
    readyForAdvisor: false,
  };

  return {
    id: 'conv-batt-1',
    customerId: 'cust-2',
    channel: 'whatsapp',
    externalId: 'whatsapp:573009998887',
    context,
    messages: [
      {
        id: 'in-b',
        conversationId: 'conv-batt-1',
        role: 'customer',
        content: 'Chevrolet Spark 2018',
        createdAt: new Date('2026-08-04T15:10:00.000Z'),
      },
      {
        id: 'out-b',
        conversationId: 'conv-batt-1',
        role: 'assistant',
        content: 'Te recomiendo Willard 75D23L',
        createdAt: new Date('2026-08-04T15:10:02.000Z'),
      },
    ],
    createdAt: new Date('2026-08-04T15:10:00.000Z'),
    updatedAt: new Date('2026-08-04T15:10:02.000Z'),
    expiresAt: new Date('2026-08-05T15:10:00.000Z'),
  };
}

describe('ConversationSessionProjector (Fase 1 ADR)', () => {
  const projector = new ConversationSessionProjector();

  it('proyecta saludo sin vehículo (sin filtro de progreso comercial)', () => {
    const conversation = greetingConversation();
    const session = projector.project({ conversation });

    expect(session.waId).toBe('whatsapp:573001112233');
    expect(session.conversationId).toBe('conv-greet-1');
    expect(session.customerId).toBe('cust-1');
    expect(session.channel).toBe('whatsapp');
    expect(session.salesFlow).toBeNull();
    expect(session.lastVehicle).toEqual({});
    expect(session.conversation.messages).toHaveLength(2);
    expect(session.conversation.messages.map((m) => m.role)).toEqual([
      'customer',
      'assistant',
    ]);
    expect(session.conversation.messages[1]?.content).toContain('Rodacenter');
  });

  it('preserva metadata customerName del inbound', () => {
    const session = projectConversationToSession({
      conversation: greetingConversation(),
    });
    const inbound = session.conversation.messages.find((m) => m.role === 'customer');
    expect(inbound?.metadata?.customerName).toBe('Ana Pérez');
  });

  it('expiresAt = conversation.expiresAt (C4), no now+ttl genérico', () => {
    const conversation = greetingConversation();
    const now = Date.parse('2026-08-04T15:00:01.000Z');
    const session = projector.project({ conversation, now });

    expect(session.expiresAt).toBe(conversation.expiresAt.getTime());
    expect(session.expiresAt).toBe(Date.parse('2026-08-04T17:00:00.000Z'));
    expect(session.expiresAt).not.toBe(now);
  });

  it('proyecta salesFlow, referencia y leadScore denormalizados', () => {
    const conversation = batteryConversation();
    const session = projector.project({ conversation });

    expect(session.state).toBe('WAITING_CONFIRMATION');
    expect(session.leadScore).toBe(80);
    expect(session.lastRecommendedReference).toBe('75D23L');
    expect(session.lastRecommendedReferences).toEqual(['75D23L']);
    expect(session.recommendedProductIds).toEqual(['willard:75D23L']);
    expect(session.lastVehicle).toEqual({
      brand: 'CHEVROLET',
      model: 'Spark',
      year: '2018',
    });
    expect(session.salesFlow?.matchKind).toBe('exact');
    expect(session.salesFlow?.vehicle.model).toBe('Spark');
  });

  it('incluye memory opcional sin mutar el original', () => {
    const conversation = batteryConversation();
    const memory: ConversationMemorySnapshot = {
      memoryKey: conversation.externalId,
      customerId: conversation.customerId,
      savedAt: 1,
      expiresAt: 9e12,
      context: structuredClone(conversation.context),
      summary: {
        vehicleLabel: 'CHEVROLET Spark 2018',
        primaryReference: '75D23L',
        references: ['75D23L'],
        salesState: 'WAITING_CONFIRMATION',
      },
    };

    const session = projector.project({ conversation, memory });
    expect(session.memory?.summary.primaryReference).toBe('75D23L');
    memory.summary.primaryReference = 'MUTATED';
    expect(session.memory?.summary.primaryReference).toBe('75D23L');
  });

  it('projectConversationToSession es equivalente a la clase', () => {
    const conversation = greetingConversation();
    const a = projector.project({ conversation, now: 1_000 });
    const b = projectConversationToSession({ conversation, now: 1_000 });
    expect(b).toEqual(a);
  });
});
