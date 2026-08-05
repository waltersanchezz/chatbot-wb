import type { WillardBatteryKnowledge } from '../../domain/ports/WillardBatteryKnowledge';
import type {
  BatteryMatchKind,
  BatteryRecommendationItem,
  BatteryRecommendationQuery,
  BatteryRecommendationResult,
  SimilarVehicleSuggestion,
} from '../../domain/willard/batteryRecommendation';
import type {
  WillardApplicationHit,
  WillardProductLine,
  WillardRecommendedOption,
} from '../../domain/willard/catalogTypes';
import {
  scoreWillardModelMatch,
  stripLeadingBrandFromModel,
} from '../../domain/willard/modelMatch';
import { normalizeReferenceLiteral } from '../../domain/willard/normalize';
import { yearMatchesCatalogText } from '../../domain/willard/yearRange';

const LINE_PRIORITY_DEFAULT: WillardProductLine[] = [
  'willardAgmEfb',
  'increibleTitanio',
  'willard',
  'extrema',
];

const LINE_PRIORITY_SOUND: WillardProductLine[] = [
  'willardAgmEfb',
  'increibleTitanio',
  'willard',
  'extrema',
];

/**
 * Módulo 3 — Motor de recomendación de baterías Willard.
 *
 * Separado del ConversationEngine: solo conocimiento + reglas de matching.
 * No formatea WhatsApp, no conoce CRM, no expone precios ni disponibilidad.
 */
export class BatteryRecommendationEngine {
  constructor(private readonly knowledge: WillardBatteryKnowledge) {}

  recommend(query: BatteryRecommendationQuery): BatteryRecommendationResult {
    const marca = query.marca?.trim() ?? '';
    const modeloRaw = query.modelo?.trim() ?? '';
    if (!marca || !modeloRaw) {
      return emptyResult(query, 'MISSING_QUERY');
    }

    const modelo = stripLeadingBrandFromModel(modeloRaw, marca);
    const limit = query.limit ?? 12;

    const byModel = this.usable(
      this.knowledge.findApplicationsByVehicle({
        marca,
        modelo,
        limit: 80,
      }),
    );

    if (byModel.length > 0) {
      const yearFiltered = this.filterByYear(byModel, query.year);
      if (yearFiltered.apps.length > 0) {
        const items = this.toItems(yearFiltered.apps, query.soundSystem, limit);
        if (items.length === 0) {
          return {
            matchKind: 'none',
            query,
            recommendations: [],
            similarVehicles: [],
            reasonCode: 'MATCH_WITHOUT_REFERENCES',
          };
        }
        const matchKind: BatteryMatchKind = yearFiltered.usedRange
          ? 'year_range'
          : 'exact';
        return {
          matchKind,
          query,
          recommendations: items,
          similarVehicles: [],
          reasonCode: matchKind === 'year_range' ? 'YEAR_RANGE_MATCH' : 'EXACT_MATCH',
        };
      }

      // Había modelo pero el año no encajó → sugerir esas filas como similares
      // (mismo modelo, otro rango) antes de declarar inexistente.
      const similarFromYear = uniqueSimilar(byModel);
      const items = this.toItems(byModel, query.soundSystem, limit);
      if (items.length > 0) {
        return {
          matchKind: 'similar',
          query,
          recommendations: items,
          similarVehicles: similarFromYear,
          reasonCode: 'SIMILAR_MODEL',
        };
      }
    }

    // Sin coincidencia de modelo: buscar similares en la misma marca.
    const similarApps = this.findSimilarApps(marca, modelo);
    if (similarApps.length > 0) {
      const yearAware = this.filterByYear(similarApps, query.year);
      const apps =
        yearAware.apps.length > 0 ? yearAware.apps : similarApps;
      const items = this.toItems(apps, query.soundSystem, limit);
      return {
        matchKind: 'similar',
        query,
        recommendations: items,
        similarVehicles: uniqueSimilar(apps),
        reasonCode: items.length > 0 ? 'SIMILAR_MODEL' : 'MATCH_WITHOUT_REFERENCES',
      };
    }

    return emptyResult(query, 'NO_MATCH');
  }

  private filterByYear(
    apps: WillardApplicationHit[],
    year: string | undefined,
  ): { apps: WillardApplicationHit[]; usedRange: boolean } {
    if (!year?.trim()) {
      return { apps, usedRange: false };
    }

    let usedRange = false;
    const filtered = apps.filter((app) => {
      const result = yearMatchesCatalogText(
        year,
        app.version,
        app.textoCatalogo,
        app.modelo,
      );
      if (result.usedRange) usedRange = true;
      return result.matches;
    });

    // Si ninguna fila declara año, el filtro no debe vaciar el resultado.
    const anyConstraints = apps.some((app) =>
      /(?:19|20)\d{2}/.test(
        `${app.version ?? ''} ${app.textoCatalogo} ${app.modelo}`,
      ),
    );

    if (filtered.length === 0 && !anyConstraints) {
      return { apps, usedRange: false };
    }

    return { apps: filtered, usedRange: usedRange && filtered.length > 0 };
  }

  private findSimilarApps(
    marca: string,
    modelo: string,
  ): WillardApplicationHit[] {
    const brandApps = this.usable(
      this.knowledge.findApplicationsByVehicle({
        marca,
        limit: 200,
      }),
    );

    const ranked: Array<{ app: WillardApplicationHit; score: number }> = [];
    for (const app of brandApps) {
      const score = scoreWillardModelMatch(
        modelo,
        app.modelo,
        app.textoCatalogo,
      );
      if (score == null || score < 1) continue;
      ranked.push({ app, score });
    }

    ranked.sort((a, b) => b.score - a.score);
    const topScore = ranked[0]?.score;
    if (topScore == null) return [];

    // Tomar el mejor score y empates cercanos (score >= top-1, mín 1).
    const threshold = Math.max(1, topScore - 1);
    return ranked.filter((r) => r.score >= threshold).map((r) => r.app);
  }

  private toItems(
    apps: WillardApplicationHit[],
    soundSystem: boolean | undefined,
    limit: number,
  ): BatteryRecommendationItem[] {
    const options: WillardRecommendedOption[] = [];
    for (const application of apps) {
      for (const line of application.lines) {
        for (const reference of line.references) {
          if (!reference.trim()) continue;
          options.push({
            application,
            productLine: line.line,
            reference,
            spec: this.knowledge.findReferenceSpec(reference),
          });
        }
      }
    }

    const priority =
      soundSystem === true ? LINE_PRIORITY_SOUND : LINE_PRIORITY_DEFAULT;

    options.sort((a, b) => {
      const ia = priority.indexOf(a.productLine);
      const ib = priority.indexOf(b.productLine);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const seen = new Set<string>();
    const items: BatteryRecommendationItem[] = [];
    for (const opt of options) {
      const ref = normalizeReferenceLiteral(opt.reference);
      if (!ref || seen.has(ref)) continue;
      seen.add(ref);
      items.push(toItem(opt));
      if (items.length >= limit) break;
    }
    return items;
  }

  private usable(apps: WillardApplicationHit[]): WillardApplicationHit[] {
    return apps.filter((app) => app.revisionPendiente === false);
  }
}

function toItem(opt: WillardRecommendedOption): BatteryRecommendationItem {
  const spec = opt.spec;
  const caseType =
    spec?.linea?.trim() ||
    productLineLabel(opt.productLine);

  const notes: string[] = [];
  if (spec?.notas?.trim()) notes.push(spec.notas.trim());
  if (opt.application.version?.trim()) {
    notes.push(`Aplicación: ${opt.application.textoCatalogo}`);
  }
  if (spec?.terminal?.trim()) {
    notes.push(`Terminal ${spec.terminal.trim()}`);
  }

  return {
    reference: normalizeReferenceLiteral(opt.reference),
    cca: spec?.cca18C ?? null,
    caseType,
    observations: notes.length > 0 ? notes.join(' · ') : null,
    productLine: opt.productLine,
    catalogLabel: opt.application.textoCatalogo,
  };
}

function productLineLabel(line: WillardProductLine): string {
  switch (line) {
    case 'willardAgmEfb':
      return 'Willard AGM / EFB';
    case 'increibleTitanio':
      return 'Increíble Titanio';
    case 'willard':
      return 'Willard';
    case 'extrema':
      return 'Extrema';
    default:
      return line;
  }
}

function uniqueSimilar(apps: WillardApplicationHit[]): SimilarVehicleSuggestion[] {
  const seen = new Set<string>();
  const out: SimilarVehicleSuggestion[] = [];
  for (const app of apps) {
    const key = `${app.marca}|${app.textoCatalogo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      marca: app.marca,
      modelo: app.modelo,
      textoCatalogo: app.textoCatalogo,
    });
  }
  return out;
}

function emptyResult(
  query: BatteryRecommendationQuery,
  reasonCode: BatteryRecommendationResult['reasonCode'],
): BatteryRecommendationResult {
  return {
    matchKind: 'none',
    query,
    recommendations: [],
    similarVehicles: [],
    reasonCode,
  };
}
