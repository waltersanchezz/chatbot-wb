import { describe, expect, it } from 'vitest';
import path from 'path';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import {
  handoffAlreadyActiveMessage,
  handoffMessage,
  isOutboundHandoffEcho,
} from '../../src/application/flows/handoffFlow';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { buildTestConversationEngine } from './buildTestConversationEngine';

const fixtures = path.join(process.cwd(), 'tests', 'fixtures', 'willard');

function buildEngine() {
  const knowledge = new CatalogFileWillardBatteryKnowledge(
    path.join(fixtures, 'apps-mini.json'),
    path.join(fixtures, 'refs-mini.json'),
  );
  return buildTestConversationEngine(knowledge).engine;
}

function conversation() {
  return {
    id: 'c1',
    customerId: 'u1',
    channel: 'whatsapp' as const,
    externalId: 'wa:handoff-loop',
    context: createEmptyContext(),
    messages: [] as { role: string; content: string }[],
    createdAt: new Date(),
    updatedAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
  };
}

describe('handoff loop guard', () => {
  it('detects outbound handoff echo', () => {
    const full = handoffMessage('Cliente aceptó la recomendación Willard');
    expect(isOutboundHandoffEcho(full)).toBe(true);
    expect(isOutboundHandoffEcho('quiero un asesor')).toBe(false);
  });

  it('does not re-send full handoff when already handed off', async () => {
    const engine = buildEngine();
    const conv = conversation();
    conv.context.needsHumanHandoff = true;
    conv.context.stage = 'handoff';
    conv.context.handoffReason = 'Cliente aceptó la recomendación Willard';
    conv.context.category = 'baterias';
    conv.context.intent = 'baterias';
    conv.context.salesFlow = {
      state: 'READY_FOR_ADVISOR',
      nextAction: 'HANDOFF_TO_ADVISOR',
      vehicle: {
        brand: 'RENAULT',
        model: 'Duster 2.0 AT/MEC',
        year: '2016',
        vehicleConfirmed: true,
        soundSystem: false,
      },
      hasRecommendation: true,
      matchKind: 'exact',
      leadScore: 95,
    } as never;

    const again = await engine.process(conv as never, 'sí');
    expect(again.reply).toBe(handoffAlreadyActiveMessage());
    expect(again.reply).not.toContain('Motivo: Cliente aceptó');
    expect(again.reply).not.toContain('Voy a solicitar a uno de nuestros asesores');
    expect(again.context.needsHumanHandoff).toBe(true);
  });

  it('suppresses reply when inbound is the bot handoff echo', async () => {
    const engine = buildEngine();
    const conv = conversation();
    const echo = handoffMessage('Cliente aceptó la recomendación Willard');
    const result = await engine.process(conv as never, echo);

    expect(result.suppressReply).toBe(true);
    expect(result.reply).toBe('');
    expect(result.context.needsHumanHandoff).toBe(true);
  });

  it('still sends full handoff on first accept', async () => {
    const engine = buildEngine();
    const conv = conversation();
    conv.context = (await engine.process(conv as never, 'batería')).context;
    conv.context = (await engine.process(conv as never, 'BMW 320i')).context;
    conv.context = (await engine.process(conv as never, '2015')).context;
    conv.context = (await engine.process(conv as never, 'No')).context;
    expect(conv.context.needsHumanHandoff).toBe(false);

    const accepted = await engine.process(conv as never, 'sí');
    expect(accepted.context.needsHumanHandoff).toBe(true);
    expect(accepted.reply).toContain('Motivo: Cliente aceptó la recomendación Willard');
    expect(accepted.suppressReply).toBeFalsy();

    conv.context = accepted.context;
    const second = await engine.process(conv as never, 'sí');
    expect(second.reply).toBe(handoffAlreadyActiveMessage());
  });
});
