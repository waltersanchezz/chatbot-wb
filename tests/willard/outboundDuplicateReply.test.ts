import { describe, expect, it } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { isDuplicateRecentAssistantReply } from '../../src/application/use-cases/HandleIncomingMessage';
import { formatAskVehicle } from '../../src/application/flows/batteryFlow';

describe('outbound duplicate reply guard', () => {
  const vehicleAsk = formatAskVehicle();

  function conversationWithAssistant(content: string, createdAt: Date) {
    return {
      id: 'c1',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'whatsapp:573001112233',
      context: createEmptyContext(),
      messages: [
        {
          id: 'in',
          conversationId: 'c1',
          role: 'customer' as const,
          content: 'baterías',
          createdAt,
        },
        {
          id: 'out',
          conversationId: 'c1',
          role: 'assistant' as const,
          content,
          createdAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
      expiresAt: new Date(createdAt.getTime() + 3_600_000),
    };
  }

  it('suppresses identical vehicle ask within 3 minutes', () => {
    const t0 = new Date('2026-08-07T19:43:00.000Z');
    const conv = conversationWithAssistant(vehicleAsk, t0);
    const now = t0.getTime() + 2 * 60_000; // 7:45
    expect(isDuplicateRecentAssistantReply(conv, vehicleAsk, now)).toBe(true);
  });

  it('allows same text after the window', () => {
    const t0 = new Date('2026-08-07T19:43:00.000Z');
    const conv = conversationWithAssistant(vehicleAsk, t0);
    const now = t0.getTime() + 4 * 60_000;
    expect(isDuplicateRecentAssistantReply(conv, vehicleAsk, now)).toBe(false);
  });

  it('allows a different reply', () => {
    const t0 = new Date('2026-08-07T19:43:00.000Z');
    const conv = conversationWithAssistant(vehicleAsk, t0);
    expect(
      isDuplicateRecentAssistantReply(conv, '¿De qué año es?', t0.getTime() + 30_000),
    ).toBe(false);
  });
});
