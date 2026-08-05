import path from 'path';
import { describe, expect, it } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { buildTestConversationEngine } from './buildTestConversationEngine';

describe('case batería → Mazda 3 → año', () => {
  it('resuelve Mazda 3 a All New sin lista; avanza con el año', async () => {
    const knowledge = new CatalogFileWillardBatteryKnowledge(
      path.join(process.cwd(), 'data', 'willardApplications.json'),
      path.join(process.cwd(), 'data', 'willardReferences.json'),
    );
    const { engine } = buildTestConversationEngine(knowledge);
    const conv = {
      id: 'c1',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'wa:case',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    const turns = ['batería', 'Mazda 3', '2018'] as const;
    const replies: string[] = [];
    for (const text of turns) {
      const step = await engine.process(conv as never, text);
      conv.context = step.context;
      replies.push(step.reply);
    }

    // Skyactive está en revisionPendiente: no hay empate ni re-pregunta de modelo
    expect(replies[1]).not.toMatch(/varias opciones|varios modelos|¿Cuál es la tuya/i);
    expect(replies[1]).toMatch(/a[nñ]o/i);
    expect(conv.context.vehicle.model).toMatch(/All New/i);
    expect(conv.context.pendingModelOptions).toBeUndefined();

    expect(replies[2]).not.toMatch(/varias opciones|varios modelos|¿Cuál es la tuya/i);
    expect(conv.context.vehicle.year).toBe('2018');
    expect(conv.context.salesFlow?.nextAction).not.toBe('ASK_MODEL');
  });
});
