import type {
  BatteryMatchKind,
  BatteryRecommendationItem,
  BatteryRecommendationQuery,
  BatteryRecommendationResult,
} from '../../domain/willard/batteryRecommendation';

export interface PresentedRecommendation {
  /** Mensaje listo para WhatsApp (texto plano). */
  text: string;
  matchKind: BatteryMatchKind;
}

const CONFIDENCE_LABEL: Record<BatteryMatchKind, string> = {
  exact: 'Coincidencia exacta en catálogo',
  year_range: 'Coincidencia por rango de años del catálogo',
  similar: 'Coincidencia aproximada (modelo similar)',
  none: 'Sin coincidencia en catálogo',
};

const CLOSING =
  'Un asesor de Rodacenter te confirmará disponibilidad y precio actualizado.';

/**
 * Módulo 4 — Presenter comercial de recomendaciones Willard.
 *
 * Solo presentación: recibe el resultado técnico del BatteryRecommendationEngine
 * y arma el mensaje de WhatsApp. No busca en catálogo ni conoce CRM/canal.
 */
export class RecommendationPresenter {
  present(result: BatteryRecommendationResult): PresentedRecommendation {
    if (result.matchKind === 'none' || result.recommendations.length === 0) {
      return {
        matchKind: result.matchKind === 'none' ? 'none' : result.matchKind,
        text: formatNoMatch(result.query),
      };
    }

    const primary = result.recommendations[0]!;
    const vehicle = formatVehicle(result.query);
    const extras =
      result.matchKind === 'similar' && result.similarVehicles.length > 0
        ? formatSimilarHint(result.similarVehicles[0]!.textoCatalogo)
        : null;

    const lines = [
      '¡Listo! Con los datos de tu vehículo te propongo esto:',
      '',
      `🚗 Vehículo: ${vehicle}`,
      `🔋 Referencia: *${primary.reference}*`,
      formatCca(primary),
      `📦 Tipo de caja / línea: ${primary.caseType}`,
    ];

    if (primary.observations?.trim()) {
      lines.push(`📝 Observaciones: ${primary.observations.trim()}`);
    }

    lines.push(
      `✅ Confianza: ${CONFIDENCE_LABEL[result.matchKind]}`,
    );

    if (extras) {
      lines.push('', extras);
    }

    if (result.recommendations.length > 1) {
      const others = result.recommendations
        .slice(1, 4)
        .map((r) => `• ${r.reference}`)
        .join('\n');
      lines.push('', 'Otras opciones del catálogo:', others);
    }

    lines.push('', CLOSING);

    return {
      matchKind: result.matchKind,
      text: lines.join('\n'),
    };
  }
}

function formatVehicle(query: BatteryRecommendationQuery): string {
  const parts = [query.marca?.trim(), query.modelo?.trim(), query.year?.trim()].filter(
    Boolean,
  );
  return parts.join(' ') || 'tu vehículo';
}

function formatCca(item: BatteryRecommendationItem): string {
  if (item.cca == null) return '❄️ CCA: (consultar ficha técnica)';
  return `❄️ CCA: ${item.cca}`;
}

function formatSimilarHint(catalogLabel: string): string {
  return `Usé como referencia el modelo de catálogo *${catalogLabel}*. Si no es el tuyo, escríbeme el modelo exacto.`;
}

function formatNoMatch(query: BatteryRecommendationQuery): string {
  const vehicle = formatVehicle(query);
  return [
    'Revisé el catálogo Willard con estos datos:',
    '',
    `🚗 ${vehicle}`,
    '',
    'No encontré una referencia utilizable todavía.',
    '',
    CLOSING,
  ].join('\n');
}
