import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { RealtimeService } from '../../src/application/services/RealtimeService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { InMemoryEventBus } from '../../src/infrastructure/realtime/InMemoryEventBus';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { writeSse } from '../../src/presentation/http/sse/SseController';

async function listen(app: Express): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

describe('InMemoryEventBus', () => {
  it('publica a suscriptores globales y tipados', () => {
    const bus = new InMemoryEventBus();
    const all: string[] = [];
    const typed: string[] = [];
    const unsubAll = bus.subscribe((e) => all.push(e.type));
    const unsubTyped = bus.subscribeType('task.updated', (e) =>
      typed.push(e.type),
    );

    bus.publish({
      type: 'task.updated',
      payload: { at: '2026-08-01T00:00:00.000Z' },
    });
    bus.publish({
      type: 'analytics.updated',
      payload: { at: '2026-08-01T00:00:00.000Z' },
    });

    expect(all).toEqual(['task.updated', 'analytics.updated']);
    expect(typed).toEqual(['task.updated']);
    unsubAll();
    unsubTyped();
    bus.publish({
      type: 'task.updated',
      payload: { at: '2026-08-01T00:00:00.000Z' },
    });
    expect(all).toHaveLength(2);
  });
});

describe('RealtimeService', () => {
  it('emite created + fan-out en primer turno', () => {
    const bus = new InMemoryEventBus();
    const types: string[] = [];
    bus.subscribe((e) => types.push(e.type));
    const realtime = new RealtimeService(bus, () => Date.UTC(2026, 7, 1, 12));

    realtime.onTurnCompleted({
      conversationId: 'c1',
      waId: 'wa:1',
      createdConversation: true,
    });

    expect(types).toEqual([
      'conversation.created',
      'client.created',
      'task.created',
      'pipeline.updated',
      'task.updated',
      'analytics.updated',
    ]);
  });

  it('emite updated en turnos siguientes', () => {
    const bus = new InMemoryEventBus();
    const types: string[] = [];
    bus.subscribe((e) => types.push(e.type));
    const realtime = new RealtimeService(bus);

    realtime.onTurnCompleted({
      conversationId: 'c1',
      waId: 'wa:1',
      createdConversation: false,
    });

    expect(types).toEqual([
      'conversation.updated',
      'pipeline.updated',
      'task.updated',
      'analytics.updated',
    ]);
    expect(types).not.toContain('client.created');
  });
});

describe('writeSse', () => {
  it('formatea event + data', () => {
    const chunks: string[] = [];
    const res = {
      write: (chunk: string) => {
        chunks.push(chunk);
        return true;
      },
    };
    writeSse(res as never, 'pipeline.updated', { at: 't' });
    expect(chunks.join('')).toBe(
      'event: pipeline.updated\ndata: {"at":"t"}\n\n',
    );
  });
});

describe('GET /events', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let bus: InMemoryEventBus;

  beforeAll(async () => {
    bus = new InMemoryEventBus();
    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-realtime-sse'),
      leadService: new LeadService(
        new InMemoryLeadRepository(),
        { notifyNewLead: vi.fn(async () => false) } as never,
        new InMemoryInteractionRepository(),
      ),
      customerProfileService: new CustomerProfileService(
        new InMemoryCustomerRepository(),
        new InMemoryLeadRepository(),
        new InMemoryVehicleProfileRepository(),
        new InMemoryInteractionRepository(),
      ),
      interactionService: new InteractionService(
        new InMemoryInteractionRepository(),
      ),
      eventBus: bus,
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
  });

  it('abre stream text/event-stream y recibe eventos publicados', async () => {
    const res = await fetch(`${baseUrl}/events`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const readUntil = async (needle: string, maxReads = 40): Promise<string> => {
      for (let i = 0; i < maxReads; i++) {
        if (buffer.includes(needle)) return buffer;
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
      }
      return buffer;
    };

    buffer = await readUntil('event: connected');
    expect(buffer).toMatch(/event: connected/);

    bus.publish({
      type: 'analytics.updated',
      payload: {
        conversationId: 'c-sse',
        waId: 'wa:sse',
        at: '2026-08-01T15:00:00.000Z',
      },
    });

    buffer = await readUntil('event: analytics.updated');
    expect(buffer).toMatch(/event: analytics\.updated/);
    expect(buffer).toMatch(/c-sse/);

    await reader.cancel();
  });
});
