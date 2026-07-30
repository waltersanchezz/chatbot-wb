import type { ConversationContext } from '../../domain/entities/Conversation';
import type {
  RecommendationResult,
  WillardProductLine,
  WillardRecommendedOption,
} from '../../domain/willard/catalogTypes';

export interface FlowReply {
  text: string;
  stage: ConversationContext['stage'];
  needsHandoff?: boolean;
  handoffReason?: string;
}

const ACKS = ['✅ Perfecto', '✅ Excelente', '✅ Listo', '✅ Muy bien'];
const CLOSING =
  '👨‍🔧 Uno de nuestros asesores confirmará la disponibilidad y el precio actualizado para ayudarte lo antes posible.';

const PRODUCT_LINE_LABEL: Record<WillardProductLine, string> = {
  willardAgmEfb: 'Willard AGM / EFB',
  increibleTitanio: 'Increíble Titanio',
  willard: 'Willard',
  extrema: 'Extrema',
};

const LINE_ORDER: WillardProductLine[] = [
  'willardAgmEfb',
  'increibleTitanio',
  'willard',
  'extrema',
];

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

function formatSpecDetails(option: WillardRecommendedOption): string[] {
  const spec = option.spec;
  if (!spec) return [];

  const details: string[] = [];
  if (spec.c20Ah != null) details.push(`⚡ ${spec.c20Ah} Ah`);
  if (spec.cca18C != null) details.push(`❄️ CCA ${spec.cca18C}`);
  if (spec.polaridad) details.push(`🔌 Polaridad ${spec.polaridad}`);
  if (spec.terminal) details.push(`📎 Terminal ${spec.terminal}`);
  if (spec.dimensionesMm) {
    const { largo, ancho, alto } = spec.dimensionesMm;
    if (largo != null && ancho != null && alto != null) {
      details.push(`📐 ${largo}×${ancho}×${alto} mm`);
    }
  }
  return details;
}

function formatWillardOption(option: WillardRecommendedOption): string {
  const header = `• ${option.reference}`;
  const details = formatSpecDetails(option);
  if (details.length === 0) return header;
  return [header, ...details.map((d) => `  ${d}`)].join('\n');
}

function groupOptionsByLine(
  options: WillardRecommendedOption[],
): Array<{ line: WillardProductLine; options: WillardRecommendedOption[] }> {
  const buckets = new Map<WillardProductLine, WillardRecommendedOption[]>();
  for (const option of options) {
    const list = buckets.get(option.productLine) ?? [];
    list.push(option);
    buckets.set(option.productLine, list);
  }

  return LINE_ORDER.filter((line) => buckets.has(line)).map((line) => ({
    line,
    options: buckets.get(line)!,
  }));
}

/**
 * Presentación de recomendación Willard (solo copy/layout).
 * No altera outcomes ni la lógica de RecommendationService.
 */
export function formatBatteryRecommendation(
  _ctx: ConversationContext,
  result: RecommendationResult,
): FlowReply {
  if (result.outcome !== 'matched' || result.options.length === 0) {
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

  const vehicleLabel =
    result.applications[0]?.textoCatalogo ??
    [result.applications[0]?.marca, result.applications[0]?.modelo]
      .filter(Boolean)
      .join(' ');

  const groups = groupOptionsByLine(result.options);
  const blocks = groups.map((group) => {
    const title = `📦 ${PRODUCT_LINE_LABEL[group.line]}`;
    const items = group.options.map((o) => formatWillardOption(o)).join('\n');
    return `${title}\n${items}`;
  });

  const intro = vehicleLabel
    ? `🔋 Para tu ${vehicleLabel} el catálogo Willard sugiere:`
    : '🔋 Para tu vehículo el catálogo Willard sugiere:';

  return {
    text: [intro, '', ...blocks, '', CLOSING].join('\n'),
    stage: 'closing',
    needsHandoff: true,
    handoffReason: 'Confirmación de disponibilidad y precio de batería',
  };
}
