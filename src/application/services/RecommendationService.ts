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

    const apps = this.usableOnly(
      this.knowledge.findApplicationsByVehicle({
        marca,
        modelo: query.modelo,
        version: query.version,
        requireVersion: query.requireVersion,
        limit: query.limit,
      }),
    );

    if (apps.length === 0) {
      return this.emptyVehicle(query, 'NO_USABLE_MATCH');
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
