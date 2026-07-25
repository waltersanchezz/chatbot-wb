import type { ConversationContext } from '../../domain/entities/Conversation';
import type { WillardBatteryMatch } from '../../domain/ports/WillardBatteryKnowledge';

export interface FlowReply {
  text: string;
  stage: ConversationContext['stage'];
  needsHandoff?: boolean;
  handoffReason?: string;
}

const ACKS = ['✅ Perfecto', '✅ Excelente', '✅ Listo', '✅ Muy bien'];
const CLOSING =
  '👨‍🔧 Uno de nuestros asesores confirmará la disponibilidad y el precio actualizado para ayudarte lo antes posible.';

function pickAck(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i)) % ACKS.length;
  return ACKS[hash];
}

/** Flujo simplificado: vehículo (marca+modelo juntos) + año. */
export function hasBatteryVehicle(ctx: ConversationContext): boolean {
  return Boolean(ctx.vehicle.brand || ctx.vehicle.model);
}

export function batteryNextQuestion(ctx: ConversationContext): FlowReply {
  if (!hasBatteryVehicle(ctx)) {
    return {
      text: [
        '🔋 Perfecto, te ayudo con la batería.',
        '',
        '🚗 ¿Para qué vehículo necesitas la batería?',
        '📝 Ejemplos:',
        '• Renault Symbol',
        '• Mazda 3',
        '• Kia Picanto',
      ].join('\n'),
      stage: 'collecting_vehicle',
    };
  }

  if (!ctx.vehicle.year) {
    return {
      text: [
        `${pickAck(ctx.vehicle.brand ?? ctx.vehicle.model ?? 'v')}`,
        '',
        '📅 ¿Qué modelo (año) es?',
        '📝 Ejemplo: 2005',
      ].join('\n'),
      stage: 'collecting_vehicle',
    };
  }

  if (ctx.battery.soundSystem === undefined) {
    return {
      text: [
        `${pickAck(ctx.vehicle.year)}`,
        '',
        '🔊 ¿El vehículo tiene planta de sonido o amplificador?',
        'Responde:',
        '✅ Sí',
        '❌ No',
      ].join('\n'),
      stage: 'collecting_product_details',
    };
  }

  return {
    text: '',
    stage: 'recommending',
  };
}

function formatWillardOption(option: WillardBatteryMatch): string {
  return [
    `🔋 Willard ${option.reference}`,
    `⚡ ${option.amperage} A`,
    `📦 Caja ${option.caseType}`,
  ].join('\n');
}

export function formatBatteryRecommendation(
  _ctx: ConversationContext,
  options: WillardBatteryMatch[],
): FlowReply {
  if (options.length === 0) {
    return {
      text: [
        '🚗 Con los datos de tu vehículo voy a validar la referencia Willard correcta.',
        '',
        CLOSING,
      ].join('\n'),
      stage: 'handoff',
      needsHandoff: true,
      handoffReason: 'Referencia Willard no encontrada en base de conocimiento',
    };
  }

  const blocks = options.map((o) => formatWillardOption(o)).join('\n\n');

  return {
    text: ['🔋 Para tu vehículo te recomiendo:', '', blocks, '', CLOSING].join('\n'),
    stage: 'closing',
    needsHandoff: true,
    handoffReason: 'Confirmación de disponibilidad y precio de batería',
  };
}
