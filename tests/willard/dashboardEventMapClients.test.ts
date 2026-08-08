import { describe, expect, it, vi } from 'vitest';
import { invalidateForRealtimeEvent } from '../../apps/dashboard/src/realtime/eventMap';

/**
 * Evidencia PASO 3: un turno WA (SSE) invalida clients sin F5 / polling.
 * RealtimeProvider llama invalidateForRealtimeEvent al recibir el evento.
 */
describe('eventMap → clients (SSE sin F5)', () => {
  function captureInvalidations() {
    const keys: string[][] = [];
    const queryClient = {
      invalidateQueries: vi.fn(({ queryKey }: { queryKey: string[] }) => {
        keys.push(queryKey);
        return Promise.resolve();
      }),
    };
    return { queryClient, keys };
  }

  it('conversation.updated refresca lista e ficha de clientes', () => {
    const { queryClient, keys } = captureInvalidations();
    invalidateForRealtimeEvent(queryClient as never, 'conversation.updated');
    expect(keys).toEqual(
      expect.arrayContaining([
        ['api', 'clients'],
        ['api', 'client-detail'],
        ['api', 'conversations'],
      ]),
    );
    expect(keys).not.toContainEqual(['api', 'pipeline']);
  });

  it('conversation.created refresca clients (cliente nuevo vía WA)', () => {
    const { queryClient, keys } = captureInvalidations();
    invalidateForRealtimeEvent(queryClient as never, 'conversation.created');
    expect(keys).toEqual(
      expect.arrayContaining([
        ['api', 'clients'],
        ['api', 'client-detail'],
      ]),
    );
  });

  it('client.created sigue invalidando clients', () => {
    const { queryClient, keys } = captureInvalidations();
    invalidateForRealtimeEvent(queryClient as never, 'client.created');
    expect(keys).toEqual(
      expect.arrayContaining([
        ['api', 'clients'],
        ['api', 'client-detail'],
      ]),
    );
  });

  it('pipeline.updated no toca clients', () => {
    const { queryClient, keys } = captureInvalidations();
    invalidateForRealtimeEvent(queryClient as never, 'pipeline.updated');
    expect(keys).toEqual([['api', 'pipeline']]);
  });
});
