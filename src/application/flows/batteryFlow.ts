import type { ConversationContext } from '../../domain/entities/Conversation';
import type {
  RecommendationResult,
  WillardProductLine,
  WillardRecommendedOption,
} from '../../domain/willard/catalogTypes';
import {
  scoreWillardModelMatch,
  stripLeadingBrandFromModel,
} from '../../domain/willard/modelMatch';

export interface FlowReply {
  text: string;
  stage: ConversationContext['stage'];
  needsHandoff?: boolean;
  handoffReason?: string;
}

const CLOSING =
  'Uno de nuestros asesores te confirmará disponibilidad y precio actualizado lo antes posible.';

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

/**
 * Datos mínimos del vehículo para buscar en Willard.
 * Exige marca y modelo: no recomendar (ni transferir) solo con marca.
 */
export function hasBatteryVehicle(ctx: ConversationContext): boolean {
  return Boolean(ctx.vehicle.brand?.trim() && ctx.vehicle.model?.trim());
}

export function hasCompleteVehicle(ctx: ConversationContext): boolean {
  return Boolean(
    ctx.vehicle.brand?.trim() &&
      ctx.vehicle.model?.trim() &&
      ctx.vehicle.year?.trim(),
  );
}

/** Resumen + confirmación (Módulo 2). */
export function formatVehicleConfirmation(
  brand: string,
  model: string,
  year: string,
): string {
  return [
    'Perfecto, anoté esto:',
    '',
    `🚗 ${brand} ${model}`,
    `📅 Año ${year}`,
    '',
    '¿Está bien así?',
    'Responde *sí* para continuar o *no* si hay que corregir algo.',
  ].join('\n');
}

export function formatAskVehicle(): string {
  return [
    'Con gusto te ayudo a ubicar la batería Willard correcta.',
    '',
    '¿Para qué vehículo la necesitas?',
    'Puedes escribirlo junto, por ejemplo: *Renault Logan 2015* o *Mazda 2 2008*.',
  ].join('\n');
}

export function formatAskModel(brand: string): string {
  return [
    `Dale, un *${brand}*.`,
    '',
    '¿Qué modelo es?',
    'Ejemplo: *2*, *Symbol*, *Spark GT*…',
  ].join('\n');
}

export function formatAskBrand(): string {
  return [
    '¿De qué marca es el vehículo?',
    'Ejemplo: *Renault*, *Mazda*, *Chevrolet*…',
  ].join('\n');
}

export function formatAskYear(brand: string, model: string): string {
  return [
    `Listo: *${brand} ${model}*.`,
    '',
    '¿De qué año es?',
    'Solo el año, por ejemplo: *2013*.',
  ].join('\n');
}

/**
 * Recordatorio controlado en ASK_YEAR cuando el inbound no es un año
 * (p. ej. "Hola"). Distinto de formatAskYear para no spamear el mismo copy.
 */
export function formatAskYearReminder(brand: string, model: string): string {
  return [
    `Para seguir con tu *${brand} ${model}*, necesito solo el año.`,
    '',
    'Escríbelo en 4 dígitos, por ejemplo: *2013*.',
  ].join('\n');
}

export function formatAskSoundSystem(): string {
  return [
    'Última pregunta para afinar la recomendación:',
    '',
    '¿El vehículo tiene planta de sonido o amplificador?',
    'Responde *sí* o *no*.',
  ].join('\n');
}

/** Recordatorio corto si la respuesta no es sí/no — distinto del prompt completo. */
export function formatAskSoundReminder(): string {
  return 'Responde solo *sí* o *no*: ¿tiene planta de sonido o amplificador?';
}

/**
 * Siguiente pregunta del flujo de baterías (copy de asesor Rodacenter).
 * Orden: vehículo → modelo → año → confirmación (si aplica) → planta → recomendar.
 */
export function batteryNextQuestion(ctx: ConversationContext): FlowReply {
  if (!ctx.vehicle.brand?.trim() && !ctx.vehicle.model?.trim()) {
    return {
      text: formatAskVehicle(),
      stage: 'collecting_vehicle',
    };
  }

  if (!ctx.vehicle.brand?.trim() || !ctx.vehicle.model?.trim()) {
    return {
      text: ctx.vehicle.brand?.trim()
        ? formatAskModel(ctx.vehicle.brand.trim())
        : formatAskBrand(),
      stage: 'collecting_vehicle',
    };
  }

  if (!ctx.vehicle.year?.trim()) {
    return {
      text: formatAskYear(
        ctx.vehicle.brand.trim(),
        ctx.vehicle.model.trim(),
      ),
      stage: 'collecting_vehicle',
    };
  }

  // Módulo 2: confirmar datos antes de planta de sonido.
  if (!ctx.vehicleConfirmed) {
    return {
      text: formatVehicleConfirmation(
        ctx.vehicle.brand.trim(),
        ctx.vehicle.model.trim(),
        ctx.vehicle.year.trim(),
      ),
      stage: 'collecting_vehicle',
    };
  }

  if (ctx.battery.soundSystem === undefined) {
    return {
      text: formatAskSoundSystem(),
      stage: 'collecting_product_details',
    };
  }

  return {
    text: '',
    stage: 'recommending',
  };
}

/** Respuesta afirmativa corta (confirmación / planta). */
export function isAffirmativeReply(text: string): boolean {
  // Anclar a fin de string: `\b` falla con tildes (sí) en JS.
  return /^(si|sí|sip|sep|ok|okay|dale|correcto|exacto|claro|afirmativo|yes)$/i.test(
    text.trim(),
  );
}

/** Respuesta negativa corta. */
export function isNegativeReply(text: string): boolean {
  return /^(no|nop|incorrecto|mal|negativo)$/i.test(text.trim());
}

/**
 * Cierre / rechazo de servicio (no solo “no” corto).
 * En WAITING_CONFIRMATION no debe re-preguntar ASK_INTEREST ni reiniciar vehículo.
 */
export function isServiceDeclineReply(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isNegativeReply(t)) return true;
  return /^(ya\s+no\s+necesito(?:\s+el\s+servicio)?|no\s+necesito|ya\s+no\s+quiero|no\s+quiero\s+continuar|d[eé]jalo\s+as[ií]|gracias,?\s+ya\s+no|ya\s+no\s+me\s+interesa)(?:\s*[!?.…])*$/i.test(
    t,
  );
}

/**
 * Intención explícita de buscar otra opción/batería.
 * Única vía válida para reiniciar START_FLOW tras una recomendación.
 */
export function isExplicitSearchAnotherReply(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^(quiero\s+buscar\s+otra|buscar\s+otra(?:\s+bater[ií]a)?|quiero\s+otra\s+opci[oó]n|s[ií],?\s+quiero\s+buscar\s+otra|quiero\s+otra(?:\s+bater[ií]a)?|otra\s+opci[oó]n|busquemos\s+otra)(?:\s*[!?.…])*$/i.test(
    t,
  );
}

/** Cierre tras rechazar recomendación / declinar servicio (END_CONVERSATION). */
export function recommendationRejectedCloseMessage(): string {
  return [
    'Entiendo 👍',
    '',
    'Si más adelante quieres buscar otra batería, escríbeme.',
  ].join('\n');
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

/** Normaliza para comparar opción pendiente vs respuesta del usuario. */
export function normalizeModelSelectionKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '');
}

/**
 * Elige la mejor opción pendiente para el mensaje del usuario.
 * 1) Igualdad exacta (case/espacios).
 * 2) Mejor scoreWillardModelMatch ≥ 1; empate entre opciones distintas → undefined.
 */
export function matchPendingModelOption(
  message: string,
  options: string[] | undefined,
  brand?: string,
): string | undefined {
  if (!options?.length) return undefined;
  const raw = message.trim();
  if (!raw) return undefined;

  const query = stripLeadingBrandFromModel(raw, brand);
  const exactKey = normalizeModelSelectionKey(query);
  const exact = options.find(
    (option) => normalizeModelSelectionKey(option) === exactKey,
  );
  if (exact) return exact;

  let bestScore = 0;
  let best: string | undefined;
  let tied = false;

  for (const option of options) {
    const score = scoreWillardModelMatch(query, option, option);
    if (score == null || score < 1) continue;
    if (score > bestScore) {
      bestScore = score;
      best = option;
      tied = false;
    } else if (score === bestScore && best && option !== best) {
      tied = true;
    }
  }

  if (tied) return undefined;
  return best;
}

/** Etiquetas mostradas al usuario en AMBIGUOUS_MODEL (texto catálogo). */
export function ambiguousModelLabels(
  result: RecommendationResult,
): string[] {
  return uniqueTextos(result.applications);
}

/** Copy de aclaración de modelo (intérprete o RecommendationService). */
export function formatModelClarification(labels: string[]): string {
  const list =
    labels.length > 0
      ? labels.map((t) => `• ${t}`).join('\n')
      : '• (varios modelos del catálogo)';

  return [
    'Encontré varias opciones parecidas en el catálogo.',
    '',
    '¿Cuál es la tuya?',
    list,
    '',
    'Escríbela como te salga; mayúsculas no importan.',
  ].join('\n');
}

/**
 * Confirmación breve cuando el intérprete resolvió un vehículo claro.
 */
export function formatVehicleInterpretedAck(
  marca: string,
  modelo: string,
): string {
  return `✅ Entendí tu ${marca} ${modelo}.`;
}

/**
 * Presentación de recomendación Willard (solo copy/layout).
 * No altera outcomes ni la lógica de RecommendationService.
 */
export function formatBatteryRecommendation(
  _ctx: ConversationContext,
  result: RecommendationResult,
): FlowReply {
  if (result.reasonCode === 'AMBIGUOUS_MODEL') {
    const labels = ambiguousModelLabels(result);
    return {
      text: formatModelClarification(labels),
      stage: 'collecting_vehicle',
      needsHandoff: false,
    };
  }

  // Transferencia al asesor SOLO cuando la búsqueda ya corrió y no hubo match usable.
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

  // Match válido: mostrar opciones. El cierre comercial no es handoff por fallo de búsqueda.
  return {
    text: [intro, '', ...blocks, '', CLOSING].join('\n'),
    stage: 'closing',
    needsHandoff: false,
    handoffReason: undefined,
  };
}

function uniqueTextos(
  applications: RecommendationResult['applications'],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const app of applications) {
    const label = app.textoCatalogo.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}
