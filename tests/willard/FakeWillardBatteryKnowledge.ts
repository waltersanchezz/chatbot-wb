import type {
  WillardBatteryKnowledge,
  WillardBatteryMatch,
  WillardLookupQuery,
} from '../../src/domain/ports/WillardBatteryKnowledge';
import type {
  VehicleApplicationQuery,
  WillardApplicationHit,
  WillardLineReferences,
  WillardProductLine,
  WillardReferenceSpec,
} from '../../src/domain/willard/catalogTypes';
import { WILLARD_PRODUCT_LINES } from '../../src/domain/willard/catalogTypes';
import {
  normalizeReferenceLiteral,
  normalizeWillardText,
} from '../../src/domain/willard/normalize';

function emptyLines(): WillardLineReferences[] {
  return WILLARD_PRODUCT_LINES.map((line) => ({ line, references: [] }));
}

function linesFrom(
  partial: Partial<Record<WillardProductLine, string[]>>,
): WillardLineReferences[] {
  return WILLARD_PRODUCT_LINES.map((line) => ({
    line,
    references: partial[line] ? [...partial[line]!] : [],
  }));
}

/**
 * Fake del puerto para tests de RecommendationService.
 * No lee JSON ni usa CatalogFileWillardBatteryKnowledge.
 */
export class FakeWillardBatteryKnowledge implements WillardBatteryKnowledge {
  constructor(
    private readonly applications: WillardApplicationHit[],
    private readonly specs: Map<string, WillardReferenceSpec> = new Map(),
  ) {}

  findRecommendations(_query: WillardLookupQuery): WillardBatteryMatch[] {
    return [];
  }

  findApplicationsByVehicle(query: VehicleApplicationQuery): WillardApplicationHit[] {
    const marcaNorm = normalizeWillardText(query.marca ?? '');
    if (!marcaNorm) return [];

    let hits = this.applications.filter(
      (app) =>
        app.revisionPendiente === false &&
        normalizeWillardText(app.marca) === marcaNorm,
    );

    if (query.modelo) {
      const q = normalizeWillardText(query.modelo);
      hits = hits.filter(
        (app) =>
          normalizeWillardText(app.modelo).includes(q) ||
          q.includes(normalizeWillardText(app.modelo)) ||
          normalizeWillardText(app.textoCatalogo).includes(q),
      );
    }

    if (query.requireVersion && query.version) {
      const qv = normalizeWillardText(query.version);
      hits = hits.filter(
        (app) =>
          app.version != null && normalizeWillardText(app.version) === qv,
      );
    }

    const limit = query.limit ?? 20;
    return hits.slice(0, limit);
  }

  findApplicationsByReference(reference: string): WillardApplicationHit[] {
    const literal = normalizeReferenceLiteral(reference);
    if (!literal) return [];
    return this.applications.filter((app) => {
      if (app.revisionPendiente) return false;
      return app.lines.some((line) =>
        line.references.some((r) => normalizeReferenceLiteral(r) === literal),
      );
    });
  }

  findReferenceSpec(reference: string): WillardReferenceSpec | null {
    return this.specs.get(normalizeReferenceLiteral(reference)) ?? null;
  }
}

export function hit(params: {
  marca: string;
  modelo: string;
  version?: string | null;
  textoCatalogo?: string;
  refs?: Partial<Record<WillardProductLine, string[]>>;
  fila?: number;
  revisionPendiente?: false;
}): WillardApplicationHit {
  return {
    marca: params.marca,
    categoria: 'Autos y camionetas',
    modelo: params.modelo,
    version: params.version ?? null,
    textoCatalogo: params.textoCatalogo ?? params.modelo,
    lines: params.refs ? linesFrom(params.refs) : emptyLines(),
    fuente: { lote: 1, imagen: 'fixture.jpeg', fila: params.fila ?? 1 },
    revisionPendiente: false,
  };
}

export function spec(referencia: string): WillardReferenceSpec {
  return {
    referencia,
    linea: 'Willard',
    polaridad: '(- +)',
    dimensionesMm: { largo: 1, ancho: 1, alto: 1 },
    terminal: 'ESTANDAR',
    voltaje: 12,
    c20Ah: 60,
    cca18C: 500,
    ca22C: null,
    crMin: null,
    notas: null,
    fuente: { lote: 1, imagen: 'fixture.jpeg', fila: 1 },
  };
}
