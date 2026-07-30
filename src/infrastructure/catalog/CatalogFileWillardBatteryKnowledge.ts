import { readFileSync } from 'fs';
import path from 'path';
import type {
  WillardBatteryKnowledge,
  WillardBatteryMatch,
  WillardLookupQuery,
} from '../../domain/ports/WillardBatteryKnowledge';
import type {
  VehicleApplicationQuery,
  WillardApplicationHit,
  WillardLineReferences,
  WillardProductLine,
  WillardReferenceSpec,
} from '../../domain/willard/catalogTypes';
import { WILLARD_PRODUCT_LINES } from '../../domain/willard/catalogTypes';
import {
  normalizeReferenceLiteral,
  normalizeWillardText,
} from '../../domain/willard/normalize';
import { logger } from '../logging/logger';

const DEFAULT_LIMIT = 20;

interface RawApplication {
  marca: string;
  categoria: string;
  modelo: string;
  version: string | null;
  textoCatalogo: string;
  referencias: Record<WillardProductLine, string[]>;
  fuente: { lote: number; imagen: string; fila: number };
  revisionPendiente: boolean;
}

interface RawApplicationsFile {
  aplicaciones?: RawApplication[];
}

interface RawReference {
  referencia: string;
  linea: string;
  polaridad: string | null;
  dimensionesMm: WillardReferenceSpec['dimensionesMm'];
  terminal: string | null;
  voltaje: number | null;
  c20Ah: number | null;
  cca18C: number | null;
  ca22C: number | null;
  crMin: number | null;
  notas: string | null;
  fuente: WillardReferenceSpec['fuente'];
  revisionPendiente: boolean;
}

interface RawReferencesFile {
  referencias?: RawReference[];
}

interface IndexedApplication {
  hit: WillardApplicationHit;
  marcaNorm: string;
  modeloNorm: string;
  versionNorm: string | null;
  textoNorm: string;
  referenceLiterals: Set<string>;
}

function toLines(referencias: RawApplication['referencias']): WillardLineReferences[] {
  return WILLARD_PRODUCT_LINES.map((line) => ({
    line,
    references: Array.isArray(referencias[line]) ? [...referencias[line]] : [],
  }));
}

function collectLiterals(lines: WillardLineReferences[]): Set<string> {
  const set = new Set<string>();
  for (const line of lines) {
    for (const ref of line.references) {
      set.add(normalizeReferenceLiteral(ref));
    }
  }
  return set;
}

function modelMatchScore(
  queryModelo: string | undefined,
  app: IndexedApplication,
): number | null {
  if (!queryModelo) return 0;
  const q = normalizeWillardText(queryModelo);
  if (!q) return 0;
  if (app.modeloNorm === q) return 3;
  if (app.textoNorm === q) return 2;
  if (
    app.modeloNorm.includes(q) ||
    q.includes(app.modeloNorm) ||
    app.textoNorm.includes(q) ||
    q.includes(app.textoNorm)
  ) {
    return 1;
  }
  return null;
}

/**
 * Adaptador del catálogo estructurado (willardApplications + willardReferences).
 * Filtra revisionPendiente en carga. No implementa la API legado de sonido/año.
 */
export class CatalogFileWillardBatteryKnowledge implements WillardBatteryKnowledge {
  private readonly applications: IndexedApplication[] = [];
  private readonly specsByReference = new Map<string, WillardReferenceSpec>();

  constructor(applicationsPath?: string, referencesPath?: string) {
    const appsPath =
      applicationsPath ??
      path.join(process.cwd(), 'data', 'willardApplications.json');
    const refsPath =
      referencesPath ?? path.join(process.cwd(), 'data', 'willardReferences.json');

    try {
      this.loadApplications(appsPath);
      this.loadReferences(refsPath);
      logger.info('Willard catalog knowledge loaded', {
        applicationsFile: appsPath,
        referencesFile: refsPath,
        usableApplications: this.applications.length,
        usableSpecs: this.specsByReference.size,
      });
    } catch (err) {
      logger.error('Failed to load Willard catalog knowledge', {
        applicationsFile: appsPath,
        referencesFile: refsPath,
        error: err instanceof Error ? err.message : 'unknown',
      });
      this.applications.length = 0;
      this.specsByReference.clear();
    }
  }

  /** API legado: este adaptador no sirve willard-batteries.json. */
  findRecommendations(_query: WillardLookupQuery): WillardBatteryMatch[] {
    return [];
  }

  findApplicationsByVehicle(query: VehicleApplicationQuery): WillardApplicationHit[] {
    const marca = query.marca?.trim() ?? '';
    if (!marca) return [];

    const marcaNorm = normalizeWillardText(marca);
    const requireVersion = query.requireVersion === true;
    const limit = query.limit ?? DEFAULT_LIMIT;

    type Ranked = { app: IndexedApplication; modelScore: number; versionBoost: number };
    const ranked: Ranked[] = [];

    for (const app of this.applications) {
      if (app.marcaNorm !== marcaNorm) continue;

      const modelScore = modelMatchScore(query.modelo, app);
      if (modelScore === null) continue;

      if (requireVersion) {
        const qv = query.version != null ? normalizeWillardText(query.version) : '';
        if (!qv || app.versionNorm == null || app.versionNorm !== qv) continue;
      }

      let versionBoost = 0;
      if (query.version && !requireVersion) {
        const qv = normalizeWillardText(query.version);
        if (qv && app.versionNorm === qv) versionBoost = 1;
      }

      ranked.push({ app, modelScore, versionBoost });
    }

    ranked.sort((a, b) => {
      if (b.modelScore !== a.modelScore) return b.modelScore - a.modelScore;
      if (b.versionBoost !== a.versionBoost) return b.versionBoost - a.versionBoost;
      return a.app.hit.textoCatalogo.localeCompare(b.app.hit.textoCatalogo, 'es');
    });

    return ranked.slice(0, limit).map((r) => r.app.hit);
  }

  findApplicationsByReference(reference: string): WillardApplicationHit[] {
    const literal = normalizeReferenceLiteral(reference);
    if (!literal) return [];

    return this.applications
      .filter((app) => app.referenceLiterals.has(literal))
      .map((app) => app.hit)
      .sort((a, b) => a.textoCatalogo.localeCompare(b.textoCatalogo, 'es'));
  }

  findReferenceSpec(reference: string): WillardReferenceSpec | null {
    const literal = normalizeReferenceLiteral(reference);
    if (!literal) return null;
    return this.specsByReference.get(literal) ?? null;
  }

  private loadApplications(filePath: string): void {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as RawApplicationsFile;
    const rows = Array.isArray(raw.aplicaciones) ? raw.aplicaciones : [];

    for (const row of rows) {
      if (row.revisionPendiente) continue;

      const lines = toLines(row.referencias);
      const hit: WillardApplicationHit = {
        marca: row.marca,
        categoria: row.categoria,
        modelo: row.modelo,
        version: row.version,
        textoCatalogo: row.textoCatalogo,
        lines,
        fuente: {
          lote: row.fuente.lote,
          imagen: row.fuente.imagen,
          fila: row.fuente.fila,
        },
        revisionPendiente: false,
      };

      this.applications.push({
        hit,
        marcaNorm: normalizeWillardText(row.marca),
        modeloNorm: normalizeWillardText(row.modelo),
        versionNorm:
          row.version != null && row.version !== ''
            ? normalizeWillardText(row.version)
            : null,
        textoNorm: normalizeWillardText(row.textoCatalogo),
        referenceLiterals: collectLiterals(lines),
      });
    }
  }

  private loadReferences(filePath: string): void {
    const raw = JSON.parse(readFileSync(filePath, 'utf8')) as RawReferencesFile;
    const rows = Array.isArray(raw.referencias) ? raw.referencias : [];

    for (const row of rows) {
      if (row.revisionPendiente) continue;
      const key = normalizeReferenceLiteral(row.referencia);
      if (!key) continue;

      this.specsByReference.set(key, {
        referencia: row.referencia,
        linea: row.linea,
        polaridad: row.polaridad,
        dimensionesMm: row.dimensionesMm,
        terminal: row.terminal,
        voltaje: row.voltaje,
        c20Ah: row.c20Ah,
        cca18C: row.cca18C,
        ca22C: row.ca22C,
        crMin: row.crMin,
        notas: row.notas,
        fuente: row.fuente,
      });
    }
  }
}
