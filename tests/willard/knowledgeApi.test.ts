import type { AddressInfo } from 'net';
import type { Express } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { KnowledgeRepository as EngineKnowledgeRepository } from '../../src/application/services/KnowledgeRepository';
import { KnowledgeEngine } from '../../src/application/services/KnowledgeEngine';
import {
  KnowledgeService,
  KnowledgeValidationError,
} from '../../src/application/services/KnowledgeService';
import { CustomerProfileService } from '../../src/application/services/CustomerProfileService';
import { InteractionService } from '../../src/application/services/InteractionService';
import { LeadService } from '../../src/application/services/LeadService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { KNOWLEDGE_ARTICLES } from '../../src/domain/knowledge/knowledgeArticles';
import {
  isKnowledgeCategory,
  normalizeKnowledgeCategory,
} from '../../src/domain/dashboard/knowledgeItemDto';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { InMemoryProductRepository } from '../../src/infrastructure/persistence/InMemoryProductRepository';
import { InMemoryVehicleProfileRepository } from '../../src/infrastructure/persistence/InMemoryVehicleProfileRepository';
import { SQLiteKnowledgeRepository } from '../../src/infrastructure/persistence/SQLiteKnowledgeRepository';
import { createApp } from '../../src/presentation/http/createApp';
import { createKnowledgeApiRouter } from '../../src/presentation/http/routes/knowledgeApiRoutes';
import { FakeWillardBatteryKnowledge } from './FakeWillardBatteryKnowledge';
import express from 'express';

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

function tmpDb(prefix: string): string {
  return path.join(
    os.tmpdir(),
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

describe('knowledgeItemDto helpers', () => {
  it('valida y normaliza categorías', () => {
    expect(isKnowledgeCategory('FAQ')).toBe(true);
    expect(isKnowledgeCategory('Nope')).toBe(false);
    expect(normalizeKnowledgeCategory('Garantías')).toBe('Garantías');
    expect(normalizeKnowledgeCategory('xyz')).toBe('Otros');
    expect(normalizeKnowledgeCategory(null)).toBe('Otros');
  });
});

describe('SQLiteKnowledgeRepository', () => {
  it('CRUD, search, duplicate, seed y articles', () => {
    let n = 0;
    const repo = new SQLiteKnowledgeRepository(':memory:', {
      tenantId: 'rodacenter',
      now: () => 1_700_000_000_000 + n++,
      idFactory: () => `id-${n}`,
    });

    expect(repo.seedDefaultsIfEmpty()).toBe(KNOWLEDGE_ARTICLES.length);
    expect(repo.seedDefaultsIfEmpty()).toBe(0);

    const list = repo.list();
    expect(list.total).toBe(KNOWLEDGE_ARTICLES.length);
    expect(list.enabledCount).toBe(KNOWLEDGE_ARTICLES.length);

    const created = repo.create({
      category: 'Productos',
      title: 'Garantía Willard',
      question: '¿Cuánto dura la garantía?',
      answer: 'Según ficha del producto.',
      tags: ['garantia', 'willard'],
      priority: 5,
    });
    expect(created.category).toBe('Productos');
    expect(repo.getById(created.id)?.answer).toContain('ficha');

    const updated = repo.update(created.id, {
      enabled: false,
      tags: ['garantia'],
      priority: 99,
      title: 'Garantía',
    });
    expect(updated?.enabled).toBe(false);
    expect(updated?.priority).toBe(99);

    expect(repo.list({ enabled: false }).items).toHaveLength(1);
    expect(repo.list({ category: 'Productos' }).items[0]?.id).toBe(created.id);
    expect(repo.search('garantia')).toHaveLength(0);
    expect(repo.list({ q: 'garantia' }).items.some((i) => i.id === created.id)).toBe(
      true,
    );

    const dup = repo.duplicate(created.id);
    expect(dup?.title).toContain('copia');
    expect(dup?.id).not.toBe(created.id);

    expect(repo.delete(created.id)).toBe(true);
    expect(repo.getById(created.id)).toBeNull();
    expect(repo.update('missing', { title: 'x' })).toBeNull();
    expect(repo.duplicate('missing')).toBeNull();
    expect(repo.delete('missing')).toBe(false);

    const articles = repo.listEnabledArticles();
    expect(articles.some((a) => a.id === 'cca')).toBe(true);
    expect(articles.find((a) => a.id === 'cca')?.keywords.length).toBeGreaterThan(0);

    repo.close();
  });

  it('aísla ítems por tenant', () => {
    const shared = tmpDb('know-iso');
    const a = new SQLiteKnowledgeRepository(shared, { tenantId: 'tenant-a' });
    const b = new SQLiteKnowledgeRepository(shared, { tenantId: 'tenant-b' });
    a.create({
      title: 'Solo A',
      question: 'Pregunta A',
      answer: 'Respuesta A',
      category: 'FAQ',
    });
    expect(a.list().total).toBe(1);
    expect(b.list().total).toBe(0);
    b.seedDefaultsIfEmpty();
    expect(b.list().total).toBe(KNOWLEDGE_ARTICLES.length);
    expect(a.list().total).toBe(1);
    a.close();
    b.close();
    try {
      fs.unlinkSync(shared);
    } catch {
      /* ignore */
    }
  });

  it('parsea tags no-JSON y categoría inválida a Otros', () => {
    const repo = new SQLiteKnowledgeRepository(':memory:', {
      tenantId: 't1',
    });
    const item = repo.create({
      category: 'Inventada',
      title: 'T',
      question: 'Q',
      answer: 'A',
      tags: ['a', 'a', ' b '],
      priority: Number.NaN,
    });
    expect(item.category).toBe('Otros');
    expect(item.tags).toEqual(['a', 'b']);
    expect(item.priority).toBe(0);

    const updated = repo.update(item.id, {
      title: '   ',
      question: '   ',
      category: 'FAQ',
      answer: 'B',
      priority: 5000,
    });
    expect(updated?.title).toBe('T');
    expect(updated?.question).toBe('Q');
    expect(updated?.priority).toBe(1000);

    // tags corruptos en DB → fallback split
    const dbPath = tmpDb('know-tags');
    const fileRepo = new SQLiteKnowledgeRepository(dbPath, { tenantId: 't1' });
    const row = fileRepo.create({
      title: 'X',
      question: 'Y',
      answer: 'Z',
    });
    // acceso interno vía SQL del mismo archivo
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.prepare(
      `UPDATE knowledge_items SET tags = ? WHERE tenant_id = ? AND id = ?`,
    ).run('{"not":"array"}', 't1', row.id);
    expect(fileRepo.getById(row.id)?.tags).toEqual([]);
    db.prepare(
      `UPDATE knowledge_items SET tags = ? WHERE tenant_id = ? AND id = ?`,
    ).run('alpha,beta|gamma', 't1', row.id);
    expect(fileRepo.getById(row.id)?.tags).toEqual(['alpha', 'beta', 'gamma']);
    db.close();
    fileRepo.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {
      /* ignore */
    }

    repo.close();
  });
});

describe('KnowledgeService', () => {
  it('CRUD, search, import/export y validaciones', () => {
    const repo = new SQLiteKnowledgeRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    const service = new KnowledgeService(repo);
    expect(service.list().total).toBe(KNOWLEDGE_ARTICLES.length);

    const created = service.create({
      category: 'Servicios',
      title: 'Instalación',
      question: '¿Instalan baterías?',
      answer: 'Sí, en taller.',
      tags: ['instalacion'],
    });
    expect(service.getById(created.id)?.category).toBe('Servicios');

    const updated = service.update(created.id, {
      answer: 'Sí, con cita.',
      enabled: false,
    });
    expect(updated?.answer).toContain('cita');

    expect(service.search('cita')).toHaveLength(0);
    expect(service.list({ q: 'cita' }).items.length).toBeGreaterThan(0);

    const dup = service.duplicate(created.id);
    expect(dup?.title).toContain('copia');

    const csv = service.exportCsv({ category: 'Servicios' });
    expect(csv).toContain('Preguntas,Respuestas,Categoría,Tags');
    expect(csv).toContain('Instalan');

    const imported = service.importCsv(
      [
        'Preguntas,Respuestas,Categoría,Tags',
        '"¿Qué es CCA?","Cold cranking","FAQ","cca; arranque"',
        'Sin respuesta,,FAQ,',
      ].join('\n'),
    );
    expect(imported.imported).toBe(1);

    expect(() =>
      service.create({ title: '', question: '', answer: 'x' }),
    ).toThrow(KnowledgeValidationError);
    expect(() =>
      service.create({
        title: 't',
        question: 'q',
        answer: '',
      }),
    ).toThrow(KnowledgeValidationError);
    expect(() =>
      service.create({
        title: 't',
        question: 'q',
        answer: 'a',
        category: 'BadCat',
      }),
    ).toThrow(KnowledgeValidationError);
    expect(() => service.update(created.id, { category: 'Bad' })).toThrow(
      KnowledgeValidationError,
    );
    expect(() => service.update(created.id, { answer: '   ' })).toThrow(
      KnowledgeValidationError,
    );
    expect(() => service.delete('')).toThrow(KnowledgeValidationError);
    expect(() => service.update('', { title: 'x' })).toThrow(
      KnowledgeValidationError,
    );
    expect(() => service.duplicate('')).toThrow(KnowledgeValidationError);
    expect(() => service.importCsv('solo header\n')).toThrow(
      KnowledgeValidationError,
    );
    expect(() => service.importCsv('')).toThrow(KnowledgeValidationError);

    expect(service.delete(created.id)).toBe(true);
    expect(service.update('missing', { title: 'x' })).toBeNull();
    repo.close();
  });

  it('import CSV con encabezados en inglés y comillas', () => {
    const repo = new SQLiteKnowledgeRepository(':memory:', { tenantId: 't' });
    const service = new KnowledgeService(repo);
    for (const item of service.list().items) {
      service.delete(item.id);
    }
    const result = service.importCsv(
      'Question,Answer,Category,Tags\n"Hi, there","Line ""one""\nTwo",Productos,tag1|tag2\n',
    );
    expect(result.imported).toBe(1);
    expect(result.items[0]?.answer).toContain('Line "one"');
    expect(result.items[0]?.tags).toEqual(['tag1', 'tag2']);

    const minimal = service.importCsv('Pregunta,Respuesta\nSolo Q,Solo A\n');
    expect(minimal.imported).toBe(1);
    expect(minimal.items[0]?.category).toBe('FAQ');
    expect(minimal.items[0]?.tags).toEqual([]);

    const exported = service.exportCsv();
    expect(exported).toContain('"Hi, there"');
    repo.close();
  });
});

describe('KnowledgeEngine + SQLite source (sin cambiar API)', () => {
  it('responde FAQ CCA desde SQLite con misma forma de respuesta', () => {
    const sqlite = new SQLiteKnowledgeRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    sqlite.seedDefaultsIfEmpty();
    const engineRepo = new EngineKnowledgeRepository(
      new FakeWillardBatteryKnowledge([], new Map()),
      undefined,
      sqlite,
    );
    const engine = new KnowledgeEngine(engineRepo);
    const res = engine.query({ type: 'FAQ', topicOrQuestion: 'qué significa cca' });
    expect(res.found).toBe(true);
    expect(res.intent).toBe('faq');
    expect(res.answer).toContain('Cold Cranking');
    sqlite.close();
  });
});

describe('HTTP /api/knowledge', () => {
  let baseUrl = '';
  let close: () => Promise<void> = async () => undefined;
  let service: KnowledgeService;

  beforeAll(async () => {
    const repo = new SQLiteKnowledgeRepository(':memory:', {
      tenantId: 'rodacenter',
    });
    service = new KnowledgeService(repo);

    const products = new InMemoryProductRepository();
    const logs = new FileLogRepository(path.join(os.tmpdir(), 'know-api-logs'));
    const leads = new InMemoryLeadRepository();
    const customers = new InMemoryCustomerRepository();
    const interactions = new InMemoryInteractionRepository();
    const vehicles = new InMemoryVehicleProfileRepository();
    const leadService = new LeadService(leads, products);
    const customerProfileService = new CustomerProfileService(
      customers,
      vehicles,
      interactions,
    );
    const interactionService = new InteractionService(interactions);
    const handleIncomingMessage = {
      execute: async () => ({ replies: [] }),
    } as unknown as HandleIncomingMessage;

    const app = createApp({
      handleIncomingMessage,
      products,
      logs,
      leadService,
      customerProfileService,
      interactionService,
      knowledgeService: service,
      authRequired: false,
    });
    const server = await listen(app);
    baseUrl = server.baseUrl;
    close = server.close;
  });

  afterAll(async () => {
    await close();
  });

  it('lista, crea, busca, actualiza, duplica, exporta, importa y elimina', async () => {
    const listRes = await fetch(`${baseUrl}/api/knowledge`);
    expect(listRes.status).toBe(200);
    const listed = (await listRes.json()) as {
      total: number;
      enabledCount: number;
      items: Array<{ id: string }>;
    };
    expect(listed.total).toBeGreaterThan(0);

    const createRes = await fetch(`${baseUrl}/api/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: 'Mantenimiento',
        title: 'Bornes',
        question: '¿Cómo limpio los bornes?',
        answer: 'Con bicarbonato y agua.',
        tags: ['bornes'],
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as { id: string; category: string };
    expect(created.category).toBe('Mantenimiento');

    const searchRes = await fetch(
      `${baseUrl}/api/knowledge/search?q=${encodeURIComponent('bornes')}`,
    );
    expect(searchRes.status).toBe(200);
    const searched = (await searchRes.json()) as { items: unknown[] };
    expect(searched.items.length).toBeGreaterThan(0);

    const putRes = await fetch(`${baseUrl}/api/knowledge/${created.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    expect(putRes.status).toBe(200);
    expect(((await putRes.json()) as { enabled: boolean }).enabled).toBe(false);

    const dupRes = await fetch(
      `${baseUrl}/api/knowledge/${created.id}/duplicate`,
      { method: 'POST' },
    );
    expect(dupRes.status).toBe(201);

    const exportRes = await fetch(`${baseUrl}/api/knowledge/export`);
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-type')).toContain('text/csv');
    const csv = await exportRes.text();
    expect(csv).toContain('Preguntas');

    const importRes = await fetch(`${baseUrl}/api/knowledge/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        csv: 'Preguntas,Respuestas,Categoría,Tags\nP1,R1,Otros,t1\n',
      }),
    });
    expect(importRes.status).toBe(201);
    expect(((await importRes.json()) as { imported: number }).imported).toBe(1);

    const delRes = await fetch(`${baseUrl}/api/knowledge/${created.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(204);

    const miss = await fetch(`${baseUrl}/api/knowledge/no-existe`, {
      method: 'DELETE',
    });
    expect(miss.status).toBe(404);

    const bad = await fetch(`${baseUrl}/api/knowledge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', question: 'q', answer: '' }),
    });
    expect(bad.status).toBe(400);

    const badImport = await fetch(`${baseUrl}/api/knowledge/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: '' }),
    });
    expect(badImport.status).toBe(400);

    const put404 = await fetch(`${baseUrl}/api/knowledge/missing-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    expect(put404.status).toBe(404);

    const dup404 = await fetch(`${baseUrl}/api/knowledge/missing-id/duplicate`, {
      method: 'POST',
    });
    expect(dup404.status).toBe(404);
  });

  it('filtra por query string', async () => {
    const res = await fetch(
      `${baseUrl}/api/knowledge?category=FAQ&enabled=true&q=cca`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ category: string }> };
    for (const item of body.items) {
      expect(item.category).toBe('FAQ');
    }

    const inactive = await fetch(`${baseUrl}/api/knowledge?enabled=false`);
    expect(inactive.status).toBe(200);
  });
});

describe('knowledgeApiRoutes error paths', () => {
  it('devuelve 500/400 en fallos del servicio', async () => {
    const boom = () => {
      throw new Error('boom');
    };
    const validation = () => {
      throw new KnowledgeValidationError('bad');
    };
    const stub = {
      search: boom,
      exportCsv: boom,
      importCsv: boom,
      list: boom,
      create: boom,
      duplicate: validation,
      update: validation,
      delete: boom,
    } as unknown as KnowledgeService;

    const app = express();
    app.use(express.json());
    app.use('/api/knowledge', createKnowledgeApiRouter(stub));
    const server = await listen(app);

    const paths: Array<[string, RequestInit]> = [
      ['/api/knowledge/search?q=x', {}],
      ['/api/knowledge/export', {}],
      ['/api/knowledge/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
      ['/api/knowledge', {}],
      ['/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
      ['/api/knowledge/x', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
      ['/api/knowledge/x/duplicate', { method: 'POST' }],
      ['/api/knowledge/x', { method: 'DELETE' }],
    ];

    for (const [url, init] of paths) {
      const res = await fetch(`${server.baseUrl}${url}`, init);
      expect([400, 500]).toContain(res.status);
    }

    // import con body string vía middleware text
    const app2 = express();
    app2.use(express.text({ type: '*/*' }));
    const stubImport = {
      importCsv: vi.fn(() => ({ imported: 1, items: [] })),
      search: () => [],
      exportCsv: () => 'a',
      list: () => ({ items: [], total: 0, enabledCount: 0 }),
      create: boom,
      duplicate: () => null,
      update: () => null,
      delete: () => false,
    } as unknown as KnowledgeService;
    app2.use('/api/knowledge', createKnowledgeApiRouter(stubImport));
    const s2 = await listen(app2);
    const importStr = await fetch(`${s2.baseUrl}/api/knowledge/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'Preguntas,Respuestas\nQ,A\n',
    });
    expect(importStr.status).toBe(201);

    await server.close();
    await s2.close();
  });
});
