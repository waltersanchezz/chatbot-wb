/**
 * Tras aceptar recomendación (handoff), un Hola/Bateria posterior
 * (sesión expirada) debe reabrir el canal y enviar WhatsApp.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { WaIdTurnQueue } from '../../src/application/concurrency/WaIdTurnQueue';
import { WaIdTurnSerializer } from '../../src/application/concurrency/WaIdTurnSerializer';
import { ConversationSessionProjector } from '../../src/application/persistence/ConversationSessionProjector';
import { LeadService } from '../../src/application/services/LeadService';
import { MetricsService } from '../../src/application/services/MetricsService';
import { NotificationService } from '../../src/application/services/NotificationService';
import { HandleIncomingMessage } from '../../src/application/use-cases/HandleIncomingMessage';
import { ConsoleMessagingProvider } from '../../src/infrastructure/messaging/ConsoleMessagingProvider';
import { MemoryWhatsAppMessageIdempotency } from '../../src/infrastructure/messaging/WhatsAppMessageIdempotency';
import { FileLogRepository } from '../../src/infrastructure/persistence/FileLogRepository';
import { InMemoryCustomerRepository } from '../../src/infrastructure/persistence/InMemoryCustomerRepository';
import { InMemoryInteractionRepository } from '../../src/infrastructure/persistence/InMemoryInteractionRepository';
import { InMemoryLeadRepository } from '../../src/infrastructure/persistence/InMemoryLeadRepository';
import { ProjectingConversationRepository } from '../../src/infrastructure/persistence/ProjectingConversationRepository';
import { SQLiteChatConversationRepository } from '../../src/infrastructure/persistence/SQLiteChatConversationRepository';
import { SQLitePersistenceRepository } from '../../src/infrastructure/persistence/SQLitePersistenceRepository';
import { resetCrmSqliteSharedMemory } from '../../src/infrastructure/persistence/crmSqlite';
import {
  buildTestConversationEngine,
  catalogRowsFromHits,
} from './buildTestConversationEngine';
import { FakeWillardBatteryKnowledge, hit, spec } from './FakeWillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../src/domain/willard/catalogTypes';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-reopen-'));
}

describe('Handoff expirado no deja el WhatsApp mudo', () => {
  it('Hola + Bateria tras handoff expirado → welcome y ASK_VEHICLE con sendText', async () => {
    resetCrmSqliteSharedMemory();
    const dir = tmpDir();
    const dbPath = path.join(dir, 'crm.sqlite');
    const apps = [
      hit({
        marca: 'CHEVROLET',
        modelo: 'Corsa Evolution',
        textoCatalogo: 'Corsa Evolution',
        refs: { willard: ['H-COR'] },
        anioDesde: 2000,
        anioHasta: 2020,
      }),
    ];
    const specs = new Map<string, WillardReferenceSpec>([
      ['H-COR', { ...spec('H-COR'), cca18C: 500 }],
    ]);
    const persistence = new SQLitePersistenceRepository(dbPath);
    const { engine } = buildTestConversationEngine(
      new FakeWillardBatteryKnowledge(apps, specs),
      catalogRowsFromHits(apps),
      { persistence },
    );
    const conversations = new ProjectingConversationRepository(
      new SQLiteChatConversationRepository(dbPath),
      persistence,
      new ConversationSessionProjector(),
    );
    const messaging = new ConsoleMessagingProvider();
    const sendSpy = vi.spyOn(messaging, 'sendText');
    const useCase = new HandleIncomingMessage(
      new InMemoryCustomerRepository(),
      conversations,
      new FileLogRepository(dir),
      engine,
      messaging,
      new LeadService(
        new InMemoryLeadRepository(),
        new NotificationService(),
        new InMemoryInteractionRepository(),
      ),
      120,
      new MetricsService(),
      { persistenceMs: 3_000 },
      new WaIdTurnSerializer(new WaIdTurnQueue()),
      new MemoryWhatsAppMessageIdempotency(),
    );

    const phone = '573007123763';
    const external = `whatsapp:${phone}`;
    const steps = [
      { text: 'batería', wamid: 'wamid.HO_1' },
      { text: 'Chevrolet Corsa Evolution', wamid: 'wamid.HO_2' },
      { text: '2013', wamid: 'wamid.HO_3' },
      { text: 'No', wamid: 'wamid.HO_4' },
      { text: 'sí', wamid: 'wamid.HO_5' },
    ];
    for (const step of steps) {
      await useCase.execute({
        phone,
        text: step.text,
        channel: 'whatsapp',
        externalConversationId: external,
        sendReply: true,
        inboundWamid: step.wamid,
      });
    }

    const handed = await conversations.findByExternalId(external);
    expect(handed?.context.needsHumanHandoff).toBe(true);
    expect(persistence.load(external)?.conversation.context.needsHumanHandoff).toBe(
      true,
    );

    handed!.expiresAt = new Date(Date.now() - 60_000);
    await conversations.save(handed!);
    expect(persistence.load(external)?.conversation.context.needsHumanHandoff).toBe(
      true,
    );

    const sendsBefore = sendSpy.mock.calls.length;

    const hola = await useCase.execute({
      phone,
      text: 'Hola',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.HO_HOLA',
    });
    expect(hola.reply.trim().length).toBeGreaterThan(0);
    expect(hola.reply).toMatch(/Bienvenido|baterías|Rodacenter/i);
    expect(hola.needsHumanHandoff).toBe(false);
    expect(sendSpy.mock.calls.length).toBe(sendsBefore + 1);

    const bat = await useCase.execute({
      phone,
      text: 'Bateria',
      channel: 'whatsapp',
      externalConversationId: external,
      sendReply: true,
      inboundWamid: 'wamid.HO_BAT',
    });
    expect(bat.reply).toMatch(/vehículo|vehiculo/i);
    expect(sendSpy.mock.calls.length).toBe(sendsBefore + 2);

    persistence.close();
  });
});
