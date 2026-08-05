import type { WillardBatteryKnowledge } from '../../domain/ports/WillardBatteryKnowledge';
import type {
  ReferenceLookupResult,
  ReferenceRecommendationQuery,
  RecommendationResult,
  VehicleRecommendationQuery,
  WillardApplicationHit,
  WillardRecommendedOption,
} from '../../domain/willard/catalogTypes';
import { normalizeReferenceLiteral } from '../../domain/willard/normalize';
import {
  scoreWillardModelMatch,
  stripLeadingBrandFromModel,
} from '../../domain/willard/modelMatch';
import { normalizeModelSelectionKey } from '../flows/batteryFlow';

/**
 * Orquesta búsqueda y recomendación Willard (spec §3.2, §6).
 * Depende solo del puerto; no lee archivos ni conoce el adaptador.
 */
export class RecommendationService {
  constructor(private readonly knowledge: WillardBatteryKnowledge) {}

  recommendByVehicle(query: VehicleRecommendationQuery): RecommendationResult {
    const marca = query.marca?.trim() ?? '';
    if (!marca) {
      return this.emptyVehicle(query, 'NO_USABLE_MATCH');
    }

    let apps = this.usableOnly(
      this.knowledge.findApplicationsByVehicle({
        marca,
        modelo: query.modelo
          ? stripLeadingBrandFromModel(query.modelo, marca)
          : query.modelo,
        version: query.version,
        requireVersion: query.requireVersion,
        limit: query.limit,
      }),
    );

    if (apps.length === 0) {
      return this.emptyVehicle(query, 'NO_USABLE_MATCH');
    }

    // Si el usuario escribió exactamente una etiqueta del catálogo (p. ej. tras
    // AMBIGUOUS_MODEL), acotar a esa fila aunque el fuzzy haya traído hermanas.
    const exact = this.appsMatchingExactModelLabel(query.modelo, apps);
    if (exact.length > 0) {
      apps = exact;
    }

    if (this.isAmbiguousModel(query.modelo, apps)) {
      return {
        outcome: 'partial',
        query,
        options: [],
        applications: apps,
        reasonCode: 'AMBIGUOUS_MODEL',
      };
    }

    const options = this.buildOptionsFromApplications(apps);
    if (options.length === 0) {
      return {
        outcome: 'partial',
        query,
        options: [],
        applications: apps,
        reasonCode: 'VEHICLE_MATCH_WITHOUT_REFERENCES',
      };
    }

    return {
      outcome: 'matched',
      query,
      options,
      applications: apps,
    };
  }

  recommendByReference(query: ReferenceRecommendationQuery): RecommendationResult {
    const referencia = normalizeReferenceLiteral(query.referencia ?? '');
    if (!referencia) {
      return {
        outcome: 'empty',
        query,
        options: [],
        applications: [],
        reasonCode: 'NO_USABLE_MATCH',
      };
    }

    const apps = this.usableOnly(
      this.knowledge.findApplicationsByReference(referencia),
    );
    const limited =
      query.limit != null ? apps.slice(0, query.limit) : apps;
    const spec = this.knowledge.findReferenceSpec(referencia);

    if (limited.length === 0) {
      return {
        outcome: 'empty',
        query,
        options: [],
        applications: [],
        reasonCode: spec ? 'SPEC_WITHOUT_APPLICATIONS' : 'NO_USABLE_MATCH',
      };
    }

    const options: WillardRecommendedOption[] = [];
    for (const application of limited) {
      for (const line of application.lines) {
        for (const reference of line.references) {
          if (normalizeReferenceLiteral(reference) !== referencia) continue;
          options.push({
            application,
            productLine: line.line,
            reference,
            spec,
          });
        }
      }
    }

    if (options.length === 0) {
      return {
        outcome: 'partial',
        query,
        options: [],
        applications: limited,
        reasonCode: 'VEHICLE_MATCH_WITHOUT_REFERENCES',
      };
    }

    return {
      outcome: 'matched',
      query,
      options,
      applications: limited,
    };
  }

  lookupReference(reference: string): ReferenceLookupResult {
    const normalized = normalizeReferenceLiteral(reference ?? '');
    if (!normalized) {
      return { reference: '', spec: null, found: false };
    }
    const spec = this.knowledge.findReferenceSpec(normalized);
    return {
      reference: normalized,
      spec,
      found: spec != null,
    };
  }

  /**
   * Si el mensaje coincide con una etiqueta de catálogo de la marca
   * (exacta o soft-match único), devuelve la etiqueta canónica.
   */
  resolveExactModelLabel(marca: string, message: string): string | undefined {
    const brand = marca?.trim() ?? '';
    const text = message?.trim() ?? '';
    if (!brand || !text) return undefined;

    const queryModelo = stripLeadingBrandFromModel(text, brand);
    const apps = this.usableOnly(
      this.knowledge.findApplicationsByVehicle({
        marca: brand,
        modelo: queryModelo,
      }),
    );
    if (apps.length === 0) return undefined;

    const exact = this.appsMatchingExactModelLabel(queryModelo, apps);
    if (exact.length === 1) {
      const label = exact[0]!.textoCatalogo.trim() || exact[0]!.modelo.trim();
      return label || undefined;
    }
    if (exact.length > 1) {
      // Varias filas con la misma etiqueta exacta: usar esa etiqueta.
      const label = exact[0]!.textoCatalogo.trim() || exact[0]!.modelo.trim();
      return label || undefined;
    }

    // Soft: único ganador por score entre apps fuzzy.
    let bestScore = 0;
    let best: (typeof apps)[number] | undefined;
    let tied = false;
    for (const app of apps) {
      const score = scoreWillardModelMatch(
        queryModelo,
        app.modelo,
        app.textoCatalogo,
      );
      if (score == null || score < 1) continue;
      if (score > bestScore) {
        bestScore = score;
        best = app;
        tied = false;
      } else if (
        score === bestScore &&
        best &&
        (best.modelo !== app.modelo ||
          best.textoCatalogo !== app.textoCatalogo)
      ) {
        tied = true;
      }
    }
    if (!best || tied) return undefined;
    return best.textoCatalogo.trim() || best.modelo.trim() || undefined;
  }

  private buildOptionsFromApplications(
    apps: WillardApplicationHit[],
  ): WillardRecommendedOption[] {
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
    return options;
  }

  /**
   * Con modelo en query: ≥2 modelos distintos con firmas de refs no equivalentes
   * → ambigüedad (pedir aclaración). Firmas idénticas → no es ambigüedad comercial.
   */
  private isAmbiguousModel(
    modelo: string | undefined,
    apps: WillardApplicationHit[],
  ): boolean {
    if (!modelo?.trim()) return false;

    const distinctModelos = new Set(apps.map((app) => app.modelo));
    if (distinctModelos.size < 2) return false;

    for (let i = 0; i < apps.length; i += 1) {
      for (let j = i + 1; j < apps.length; j += 1) {
        const a = apps[i]!;
        const b = apps[j]!;
        if (a.modelo === b.modelo) continue;
        if (this.refSignature(a) !== this.refSignature(b)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Coincidencia exacta (sin mayúsculas/espacios) contra textoCatalogo o modelo.
   * Sirve cuando el cliente elige una opción de la lista ambigua aunque se haya
   * perdido pendingModelOptions (p. ej. reinicio en Render).
   */
  private appsMatchingExactModelLabel(
    modelo: string | undefined,
    apps: WillardApplicationHit[],
  ): WillardApplicationHit[] {
    if (!modelo?.trim()) return [];
    const key = normalizeModelSelectionKey(modelo);
    if (!key) return [];

    return apps.filter((app) => {
      const labels = [app.textoCatalogo, app.modelo];
      if (app.version?.trim()) {
        labels.push(`${app.modelo} ${app.version}`);
      }
      return labels.some((label) => normalizeModelSelectionKey(label) === key);
    });
  }

  private refSignature(app: WillardApplicationHit): string {
    const refs = new Set<string>();
    for (const line of app.lines) {
      for (const reference of line.references) {
        const lit = normalizeReferenceLiteral(reference);
        if (lit) refs.add(lit);
      }
    }
    return [...refs].sort().join('|');
  }

  /** Defensa en profundidad: el puerto ya filtra, pero no exponemos pendientes. */
  private usableOnly(apps: WillardApplicationHit[]): WillardApplicationHit[] {
    return apps.filter((app) => app.revisionPendiente === false);
  }

  private emptyVehicle(
    query: VehicleRecommendationQuery,
    reasonCode: string,
  ): RecommendationResult {
    return {
      outcome: 'empty',
      query,
      options: [],
      applications: [],
      reasonCode,
    };
  }
}
