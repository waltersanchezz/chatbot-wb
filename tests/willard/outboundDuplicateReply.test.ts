import { describe, expect, it } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { isDuplicateRecentAssistantReply } from '../../src/application/use-cases/HandleIncomingMessage';
import { formatAskVehicle } from '../../src/application/flows/batteryFlow';
import { formatAskSoundSystem } from '../../src/application/flows/batteryFlow';

describe('outbound duplicate reply guard', () => {
  const vehicleAsk = formatAskVehicle();
  const soundAsk = formatAskSoundSystem();

  function conversationWithAssistant(
    content: string,
    createdAt: Date,
    options?: {
      nextAction?: string;
      customerTexts?: string[];
    },
  ) {
    const customerTexts = options?.customerTexts ?? ['baterías'];
    const messages = customerTexts.flatMap((text, idx) => {
      const base = [
        {
          id: `in-${idx}`,
          conversationId: 'c1',
          role: 'customer' as const,
          content: text,
          createdAt,
        },
      ];
      if (idx === customerTexts.length - 1) {
        return base;
      }
      return base;
    });

    // Last assistant before current turn's processing; tests that need
    // consecutive customer texts simulate post-inbound-push state.
    const withAssistant = [
      ...messages.slice(0, -1),
      {
        id: 'out',
        conversationId: 'c1',
        role: 'assistant' as const,
        content,
        createdAt,
      },
      ...messages.slice(-1),
    ];

    const context = createEmptyContext();
    if (options?.nextAction) {
      context.salesFlow = {
        state: 'IDENTIFYING_VEHICLE',
        nextAction: options.nextAction as never,
        vehicle: {},
        hasRecommendation: false,
        leadScore: 10,
        readyForAdvisor: false,
      };
    }

    return {
      id: 'c1',
      customerId: 'u1',
      channel: 'whatsapp' as const,
      externalId: 'whatsapp:573001112233',
      context,
      messages: options?.customerTexts && options.customerTexts.length >= 2
        ? withAssistant
        : [
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

  it('allows same text after the window when no pending nextAction', () => {
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

  it('BUG B: suppresses identical ASK_SOUND after 16+ min while still ASK_SOUND', () => {
    const t0 = new Date('2026-08-07T21:33:00.000Z');
    const conv = conversationWithAssistant(soundAsk, t0, {
      nextAction: 'ASK_SOUND',
    });
    const now = t0.getTime() + 16 * 60_000;
    expect(isDuplicateRecentAssistantReply(conv, soundAsk, now)).toBe(true);
  });

  it('BUG B: suppresses when same customer text arrives twice (Meta replay)', () => {
    const t0 = new Date('2026-08-07T21:33:00.000Z');
    const conv = conversationWithAssistant(soundAsk, t0, {
      nextAction: 'ASK_SOUND',
      customerTexts: ['Hola', 'Hola'],
    });
    const now = t0.getTime() + 35 * 60_000;
    expect(isDuplicateRecentAssistantReply(conv, soundAsk, now)).toBe(true);
  });
});
