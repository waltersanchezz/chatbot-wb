import type { AddressInfo } from 'net';
import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { TaskService } from '../../src/application/services/TaskService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import {
  classifyTask,
  formatElapsed,
  SQLiteTaskRepository,
} from '../../src/infrastructure/persistence/SQLiteTaskRepository';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { createApp } from '../../src/presentation/http/createApp';

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

describe('SQLiteTaskRepository', () => {
  it('genera tareas por tipo y ordena por prioridad', () => {
    const now = Date.UTC(2026, 7, 1, 15, 0, 0);
    const repo = new SQLiteTaskRepository(':memory:', { now: () => now });

    repo.upsertSession({
      waId: 'wa:adv',
      conversationId: 'c-adv',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 90,
      customerName: 'Ana',
      lastReference: 'FAKE-A',
      updatedAt: now - 10 * 60_000,
    });
    repo.upsertSession({
      waId: 'wa:wait',
      conversationId: 'c-wait',
      state: 'WAITING_CONFIRMATION',
      salesFlowState: 'WAITING_CONFIRMATION',
      leadScore: 60,
      customerName: 'Bruno',
      updatedAt: now - 30 * 60_000,
    });
    repo.upsertSession({
      waId: 'wa:lead',
      conversationId: 'c-lead',
      state: 'IDENTIFYING_VEHICLE',
      salesFlowState: 'IDENTIFYING_VEHICLE',
      leadScore: 85,
      customerName: 'Carlos',
      vehicle: { brand: 'KIA', model: 'Rio', year: '2019' },
      updatedAt: now - 5 * 60_000,
    });
    repo.upsertSession({
      waId: 'wa:idle',
      conversationId: 'c-idle',
      state: 'NEW',
      salesFlowState: 'NEW',
      customerName: 'Diana',
      updatedAt: now - 30 * 60 * 60_000,
    });
    repo.upsertSession({
      waId: 'wa:rec',
      conversationId: 'c-rec',
      state: 'RECOMMENDATION_READY',
      salesFlowState: 'RECOMMENDATION_READY',
      leadScore: 40,
      lastReference: 'FAKE-R',
      customerName: 'Elena',
      updatedAt: now - 20 * 60_000,
    });
    repo.upsertSession({
      waId: 'wa:closed',
      conversationId: 'c-closed',
      state: 'CLOSED',
      salesFlowState: 'CLOSED',
      customerName: 'Closed',
      updatedAt: now - 60_000,
    });
    repo.insertLearningEvent({
      id: 'le-ab',
      conversationId: 'c-abandoned-only',
      waId: 'wa:ab',
      abandoned: 1,
      salesState: 'IDENTIFYING_VEHICLE',
      brand: 'RENAULT',
      model: 'Logan',
      timestamp: now - 3 * 60 * 60_000,
    });

    const result = repo.getTasks();
    expect(result.total).toBe(6);
    // Alta primero (más antiguas primero), luego Media.
    expect(result.tasks.map((t) => t.tipo)).toEqual([
      'Cliente esperando respuesta',
      'Cliente listo para asesor',
      'Cliente con lead alto',
      'Conversación abandonada',
      'Conversación abandonada',
      'Seguimiento recomendado',
    ]);
    expect(result.byPriority).toEqual({ Alta: 3, Media: 3, Baja: 0 });
    expect(result.tasks[0]?.prioridad).toBe('Alta');
    expect(result.tasks[0]?.cliente).toBe('Bruno');
    expect(result.tasks.some((t) => t.cliente === 'Closed')).toBe(false);

    expect(formatElapsed(45 * 60_000)).toBe('hace 45 min');
    expect(
      classifyTask(
        {
          conversationId: 'x',
          waId: 'wa:x',
          cliente: null,
          vehiculo: null,
          referencia: null,
          leadScore: 10,
          estado: 'CLOSED',
          updatedAt: now,
          abandoned: false,
        },
        now,
      ),
    ).toBeNull();

    repo.close();
  });
});

describe('GET /api/tasks', () => {
  let baseUrl: string;
  let close: () => Promise<void>;
  let repo: SQLiteTaskRepository;

  beforeAll(async () => {
    const now = Date.UTC(2026, 7, 1, 16, 0, 0);
    repo = new SQLiteTaskRepository(':memory:', { now: () => now });
    repo.upsertSession({
      waId: 'wa:+57300999',
      conversationId: 'c-api-task',
      state: 'READY_FOR_ADVISOR',
      salesFlowState: 'READY_FOR_ADVISOR',
      leadScore: 92,
      lastReference: 'FAKE-API',
      vehicle: { brand: 'CHEVROLET', model: 'Spark', year: '2018' },
      customerName: 'Felipe',
      updatedAt: now - 15 * 60_000,
    });

    const app = createApp({
      handleIncomingMessage: {
        execute: vi.fn(),
      } as unknown as HandleIncomingMessage,
      products: new InMemoryProductRepository(),
      logs: new FileLogRepository('data/logs-test-tasks-api'),
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
      taskService: new TaskService(repo),
    });

    const listening = await listen(app);
    baseUrl = listening.baseUrl;
    close = listening.close;
  });

  afterAll(async () => {
    await close();
    repo.close();
  });

  it('devuelve TasksDto con campos de tarea', async () => {
    const res = await fetch(`${baseUrl}/api/tasks`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tasks: Array<{
        id: string;
        tipo: string;
        prioridad: string;
        cliente: string | null;
        waId: string;
        vehiculo: string | null;
        referencia: string | null;
        leadScore: number | null;
        estado: string;
        tiempoDesdeUltimaActividad: string;
      }>;
      total: number;
      byPriority: { Alta: number; Media: number; Baja: number };
    };

    expect(body.total).toBe(1);
    expect(body.byPriority.Alta).toBe(1);
    expect(body.tasks[0]).toMatchObject({
      tipo: 'Cliente listo para asesor',
      prioridad: 'Alta',
      cliente: 'Felipe',
      waId: 'wa:+57300999',
      referencia: 'FAKE-API',
      leadScore: 92,
      estado: 'READY_FOR_ADVISOR',
    });
    expect(body.tasks[0]?.tiempoDesdeUltimaActividad).toMatch(/hace/);
    expect(body.tasks[0]?.vehiculo).toMatch(/CHEVROLET Spark/);
    expect(JSON.stringify(body)).not.toMatch(/SELECT|FROM persisted/i);
  });
});
