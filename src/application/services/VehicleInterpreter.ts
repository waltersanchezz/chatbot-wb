import {
  scoreWillardModelMatch,
  stripLeadingBrandFromModel,
  tokenizeWillardModel,
} from '../../domain/willard/modelMatch';
import { normalizeWillardText } from '../../domain/willard/normalize';
import {
  extractYearFromSpeech,
  replaceNumberWordsInText,
} from '../../domain/willard/numberWordsEs';
import type {
  InterpretedVehicle,
  VehicleCatalogModelEntry,
  VehicleInterpreterInput,
} from '../../domain/willard/vehicleInterpretation';
import { resolveBrandAlias } from './vehicleBrandAliases';
import { resolveModelAlias } from './vehicleModelAliases';

const FILLERS =
  /\b(tengo|tenemos|necesito|busco|quiero|para|mi|mis|un|una|el|la|del|de|es|soy|vehiculo|vehículo|carro|auto|camioneta|año|ano|modelo|marca|bater[ií]a|bateria)\b/gi;

/**
 * Interpreta habla libre del cliente → vehículo estructurado contra catálogo.
 * No inventa marcas/modelos; no lista baterías.
 *
 * Acepta mayúsculas/minúsculas, tildes y espacios; aliases (mazda2, spark gt, logan).
 */
export class VehicleInterpreter {
  interpret(input: VehicleInterpreterInput): InterpretedVehicle {
    const raw = input.text.trim();
    const notes: string[] = [];
    if (!raw) {
      return {
        raw,
        confidence: 'none',
        unresolved: 'vehicle',
        notes: ['empty'],
      };
    }

    const year =
      extractYearFromSpeech(raw) ??
      input.prior?.year?.trim() ??
      undefined;

    let working = raw;
    if (year) {
      working = working.replace(new RegExp(`\\b${year}\\b`, 'g'), ' ');
    }
    // 1) Quitar ruido conversacional ANTES de números en palabras.
    //    Si no, "un Mazda" → "1 mazda" y la marca deja de resolverse.
    working = working.replace(FILLERS, ' ');
    working = stripSoundNoise(working);
    working = working.replace(/\s+/g, ' ').trim();

    // 2) "mazda dos" → "mazda 2" (artículos un/una ya fueron eliminados).
    working = replaceNumberWordsInText(working);
    working = expandGluedBrandModel(working, input.catalog.canonicalBrandByNorm);
    working = working.replace(/\s+/g, ' ').trim();
    // Por si quedó un "1" residual de artículo convertido.
    working = stripLeadingArticleDigits(working);

    const priorBrand = input.prior?.brand?.trim();
    let marca =
      resolveBrandAlias(working, input.catalog.canonicalBrandByNorm) ??
      (priorBrand
        ? resolveBrandAlias(priorBrand, input.catalog.canonicalBrandByNorm) ??
          priorBrand
        : undefined);

    let modelPhrase = '';

    if (marca) {
      modelPhrase = stripBrandFromWorking(working, marca);
    } else {
      // Solo modelo / alias: "logan", "spark gt", "SPARK GT"
      const modelAlias = resolveModelAlias(working);
      if (modelAlias) {
        const resolvedBrand =
          resolveBrandAlias(
            modelAlias.brand,
            input.catalog.canonicalBrandByNorm,
          ) ??
          input.catalog.canonicalBrandByNorm.get(
            normalizeWillardText(modelAlias.brand),
          );
        if (resolvedBrand) {
          marca = resolvedBrand;
          modelPhrase = modelAlias.modelQuery;
          notes.push(`model_alias:${normalizeWillardText(working)}`);
        }
      }
    }

    if (!marca && priorBrand) {
      marca = priorBrand;
      notes.push('brand_from_prior');
    }

    if (!marca) {
      return {
        raw,
        year,
        confidence: 'none',
        unresolved: 'brand',
        notes: [...notes, 'no_brand'],
      };
    }

    if (!modelPhrase && input.prior?.model?.trim()) {
      modelPhrase = stripLeadingBrandFromModel(input.prior.model, marca);
      notes.push('model_from_prior');
    }

    if (!modelPhrase) {
      return {
        raw,
        marca,
        year,
        confidence: 'low',
        unresolved: 'model',
        notes: [...notes, 'no_model_phrase'],
      };
    }

    const entries = input.catalog.modelsByBrand.get(marca) ?? [];
    if (entries.length === 0) {
      return {
        raw,
        marca,
        modelo: modelPhrase,
        year,
        confidence: 'low',
        unresolved: 'model',
        notes: [...notes, 'brand_without_models'],
      };
    }

    const ranked = rankModels(modelPhrase, entries);
    if (ranked.length === 0) {
      return {
        raw,
        marca,
        modelo: modelPhrase,
        year,
        confidence: 'low',
        unresolved: 'model',
        notes: [...notes, 'no_model_score'],
      };
    }

    const topScore = ranked[0]!.score;
    const topTier = ranked.filter((r) => r.score === topScore);
    const distinctModelos = new Set(topTier.map((r) => r.entry.modelo));

    if (distinctModelos.size > 1) {
      const labels = uniqueLabels(topTier.map((r) => r.entry));
      return {
        raw,
        marca,
        year,
        confidence: 'low',
        candidateModels: labels,
        unresolved: 'model',
        notes: [...notes, `tied_models:${labels.length}`],
      };
    }

    const winner = topTier[0]!.entry;
    const modelo =
      winner.textoCatalogo.trim() || winner.modelo.trim() || modelPhrase;

    let confidence: InterpretedVehicle['confidence'] = 'medium';
    if (topScore >= 3) confidence = 'high';
    else if (topScore >= 2) confidence = 'medium';
    else confidence = 'low';

    // Score 1 con un solo modelo canónico (varias filas/versiones del mismo modelo).
    if (
      topScore === 1 &&
      (ranked.length === 1 || topTier.length === 1 || distinctModelos.size === 1)
    ) {
      confidence = 'medium';
    }

    if (confidence === 'low') {
      return {
        raw,
        marca,
        modelo,
        year,
        confidence: 'low',
        candidateModels: uniqueLabels(topTier.map((r) => r.entry)),
        unresolved: 'model',
        notes: [...notes, `weak_score:${topScore}`],
      };
    }

    // Marca + modelo resueltos: si falta año, pedirlo (no avanzar a planta).
    if (!year) {
      return {
        raw,
        marca,
        modelo,
        confidence,
        unresolved: 'year',
        notes: [...notes, `score:${topScore}`, 'missing_year'],
      };
    }

    return {
      raw,
      marca,
      modelo,
      year,
      confidence,
      notes: [...notes, `score:${topScore}`],
    };
  }
}

/** Quita menciones de planta/amplificador que no son parte del vehículo. */
function stripSoundNoise(text: string): string {
  return text.replace(
    /\b(con|sin)?\s*(planta(?:\s+de\s+sonido)?|amplificador|sonido)\b/gi,
    ' ',
  );
}

/**
 * Elimina "1"/"una" residual al inicio tras conversión numérica de artículos.
 * Ej: "1 mazda 2" → "mazda 2".
 */
function stripLeadingArticleDigits(text: string): string {
  return text.replace(/^\s*1\s+/u, '').trim();
}

/**
 * Separa marca pegada al modelo: "mazda2" → "mazda 2", "MAZDA3" → "mazda 3".
 * Usa marcas del catálogo (normalize) como prefijos.
 */
export function expandGluedBrandModel(
  text: string,
  canonicalBrandByNorm: Map<string, string>,
): string {
  const tokens = tokenizeWillardModel(text);
  if (tokens.length === 0) return text;

  const brandNorms = [...canonicalBrandByNorm.keys()].sort(
    (a, b) => b.length - a.length,
  );

  const expanded = tokens.map((token) => {
    // mazda2 / sparkgt → marca + resto
    for (const bNorm of brandNorms) {
      const brandCompact = bNorm.replace(/\s+/g, '');
      if (
        token.length > brandCompact.length &&
        token.startsWith(brandCompact)
      ) {
        const rest = token.slice(brandCompact.length);
        if (rest) return `${bNorm} ${rest}`;
      }
    }
    // Letras+dígitos genérico si la parte letras es marca conocida
    const glued = token.match(/^([a-z]+)(\d{1,4})$/);
    if (glued) {
      const brandPart = glued[1]!;
      if (canonicalBrandByNorm.has(brandPart) || brandNorms.includes(brandPart)) {
        return `${brandPart} ${glued[2]}`;
      }
      // Alias corto común fuera del mapa exacto (chevy2 no aplica; mazda sí vía mapa)
      if (['mazda', 'bmw', 'kia', 'ford', 'fiat', 'audi', 'byd'].includes(brandPart)) {
        return `${brandPart} ${glued[2]}`;
      }
    }
    return token;
  });

  // Reconstruir preservando algo legible
  return expanded.join(' ');
}

function stripBrandFromWorking(working: string, marca: string): string {
  let modelPhrase = stripLeadingBrandFromModel(working, marca);
  const brandNorm = normalizeWillardText(marca);
  const brandNormTokens = brandNorm.split(' ').filter(Boolean);
  const modelTokens = normalizeWillardText(modelPhrase)
    .split(' ')
    .filter(Boolean);
  while (
    modelTokens.length > 0 &&
    brandNormTokens.includes(modelTokens[0]!)
  ) {
    modelTokens.shift();
  }
  const phrase = modelTokens.join(' ').trim();
  // Solo la marca (p.ej. "Mazda"): no tratarla como modelo.
  if (!phrase || normalizeWillardText(phrase) === brandNorm) return '';
  return phrase;
}

function rankModels(
  query: string,
  entries: VehicleCatalogModelEntry[],
): Array<{ entry: VehicleCatalogModelEntry; score: number }> {
  const ranked: Array<{ entry: VehicleCatalogModelEntry; score: number }> = [];
  for (const entry of entries) {
    const score = scoreWillardModelMatch(
      query,
      entry.modelo,
      entry.textoCatalogo,
    );
    if (score == null) continue;
    ranked.push({ entry, score });
  }
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.textoCatalogo.localeCompare(b.entry.textoCatalogo, 'es');
  });
  return ranked;
}

function uniqueLabels(entries: VehicleCatalogModelEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    const label = e.textoCatalogo.trim() || e.modelo.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}
