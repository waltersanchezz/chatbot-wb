import { describe, expect, it } from 'vitest';
import { createEmptyContext } from '../../src/domain/entities/Conversation';
import { CatalogFileWillardBatteryKnowledge } from '../../src/infrastructure/catalog/CatalogFileWillardBatteryKnowledge';
import { buildTestConversationEngine } from './buildTestConversationEngine';

describe('Renault Twingo — recomendación WhatsApp', () => {
  it('Baterias → Twingo → año → sonido: mensaje comercial con 36D-750', async () => {
    const knowledge = new CatalogFileWillardBatteryKnowledge();
    const { engine } = buildTestConversationEngine(knowledge);

    const conv = {
      id: 'twingo-wa',
      customerId: 'u-twingo',
      channel: 'whatsapp' as const,
      externalId: 'wa:twingo',
      context: createEmptyContext(),
      messages: [] as { role: string; content: string }[],
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    };

    let result = await engine.process(conv as never, 'Baterias');
    conv.context = result.context;

    result = await engine.process(conv as never, 'Renault twingo');
    conv.context = result.context;
    expect(result.reply).toMatch(/a[nñ]o/i);

    result = await engine.process(conv as never, '2008');
    conv.context = result.context;
    if (result.context.battery.soundSystem === undefined) {
      expect(result.reply).toMatch(/planta de sonido/i);
      result = await engine.process(conv as never, 'Si');
      conv.context = result.context;
    }

    expect(result.reply).toMatch(/¡Listo! Con los datos de tu vehículo te propongo esto:/);
    expect(result.reply).toMatch(/🚗 Vehículo: RENAULT Twingo 2008/i);
    expect(result.reply).toMatch(/🔋 Referencia: \*36D-750\*/);
    expect(result.reply).toMatch(/❄️ CCA:\s*400/);
    expect(result.reply).toMatch(/📦 Tipo de caja \/ línea:\s*Willard/);
    expect(result.reply).toMatch(/✅ Confianza: Coincidencia exacta en catálogo/);
    expect(result.reply).toMatch(/Otras opciones del catálogo:/);
    expect(result.reply).toContain('• 36D-600');
    expect(result.reply).not.toMatch(/📝 Observaciones:/);
    expect(result.reply).toMatch(
      /Un asesor de Rodacenter te confirmará disponibilidad y precio actualizado/,
    );
    expect(result.reply).toMatch(
      /¿Te sirve esta opción\? Responde \*sí\* para que un asesor te contacte, o \*no\* si quieres buscar otra/,
    );
    expect(result.reply).not.toMatch(/No encontré una referencia/i);
  });

  it('Twingo 8 y 16 válvulas comparten 36D-750 / 36D-600', () => {
    const knowledge = new CatalogFileWillardBatteryKnowledge();
    const apps = knowledge.findApplicationsByVehicle({
      marca: 'RENAULT',
      modelo: 'Twingo',
    });
    expect(apps.length).toBeGreaterThanOrEqual(1);
    const refs = apps.flatMap((a) =>
      a.lines.flatMap((l) => l.references),
    );
    expect(refs).toContain('36D-750');
    expect(refs).toContain('36D-600');
    expect(apps[0]?.version).toMatch(/8 y 16/i);
  });
});
