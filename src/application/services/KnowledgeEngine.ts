import type {
  KnowledgeQuery,
  KnowledgeResponse,
} from '../../domain/knowledge/knowledgeTypes';
import { normalizeReferenceLiteral } from '../../domain/willard/normalize';
import type { KnowledgeRepository } from './KnowledgeRepository';

/**
 * Knowledge Engine — responde consultas técnicas Willard.
 * Independiente del canal: no envía mensajes, solo devuelve KnowledgeResponse.
 *
 * KnowledgeEngine → KnowledgeRepository → KnowledgeArticles / BatteryKnowledge → DTO
 */
export class KnowledgeEngine {
  constructor(private readonly repository: KnowledgeRepository) {}

  /** API tipada. */
  query(input: KnowledgeQuery): KnowledgeResponse {
    switch (input.type) {
      case 'EXPLAIN':
        return this.explain(input.reference);
      case 'COMPARE':
        return this.compare(input.left, input.right);
      case 'ALTERNATIVES':
        return this.alternatives(input.reference);
      case 'FAQ':
        return this.faq(input.topicOrQuestion);
      case 'COMPATIBILITY':
        return this.compatibility(
          input.reference,
          input.marca,
          input.modelo,
          input.year,
        );
      case 'ASK':
        return this.ask(input.text);
      default:
        return unknownResponse('No reconocí la consulta de conocimiento.');
    }
  }

  /** Enrutado liviano desde texto libre (sin canal). */
  ask(text: string): KnowledgeResponse {
    const cleaned = text.trim();
    if (!cleaned) {
      return unknownResponse('Escribe una pregunta técnica sobre baterías Willard.');
    }

    const refs = extractReferenceTokens(cleaned);

    const compare = cleaned.match(
      /\b(\d{2,5}[A-Za-z0-9-]*)\s*(?:vs\.?|versus|contra|comparad[ao]?)\s*(\d{2,5}[A-Za-z0-9-]*)\b/i,
    );
    if (compare) {
      return this.compare(compare[1]!, compare[2]!);
    }
    if (/\b(vs\.?|versus|contra)\b/i.test(cleaned) && refs.length >= 2) {
      return this.compare(refs[0]!, refs[1]!);
    }

    if (
      /\b(sirve|compatible|compatibilidad|le queda|le va)\b/i.test(cleaned) &&
      refs.length >= 1
    ) {
      const vehicle = extractVehicleHint(cleaned);
      if (vehicle) {
        return this.compatibility(refs[0]!, vehicle.marca, vehicle.modelo);
      }
      const modelOnly = extractModelOnlyHint(cleaned);
      if (modelOnly) {
        return this.compatibilityByModel(refs[0]!, modelOnly);
      }
    }

    if (
      /\b(no tengo|no hay|alternativa|equivalente|reemplazo)\b/i.test(cleaned) &&
      refs.length >= 1
    ) {
      return this.alternatives(refs[0]!);
    }

    if (
      /\b(por qu[eé]|porque|explica|explicaci[oó]n|recomienda)\b/i.test(cleaned) &&
      refs.length >= 1
    ) {
      return this.explain(refs[0]!);
    }

    const faq = this.repository.findArticle(cleaned);
    if (faq) {
      return {
        intent: 'faq',
        found: true,
        answer: [`*${faq.title}*`, '', faq.body].join('\n'),
        faq: { articleId: faq.id, title: faq.title },
      };
    }

    if (refs.length === 1 && this.repository.findSpec(refs[0]!)) {
      return this.explain(refs[0]!);
    }

    return unknownResponse(
      [
        'Puedo ayudarte con conocimiento Willard:',
        '• Explicar una referencia (ej. ¿por qué la 850?)',
        '• Comparar (ej. 750 vs 850)',
        '• Alternativas (ej. no tengo una 850)',
        '• FAQ (CCA, Ah, libre mantenimiento…)',
        '• Compatibilidad (ej. ¿le sirve una 850 a un Logan?)',
      ].join('\n'),
    );
  }

  explain(reference: string): KnowledgeResponse {
    const ref = normalizeReferenceLiteral(reference);
    const spec = this.repository.findSpec(ref);
    if (!spec) {
      return {
        intent: 'explanation',
        found: false,
        answer: [
          `No encontré la ficha de *${ref}* en el catálogo Willard.`,
          'Verifica la referencia o consulta con un asesor.',
        ].join('\n'),
      };
    }

    const apps = this.repository.findApplicationsByReference(ref);
    const vehicles = this.repository.battery.toVehicleHits(apps);
    const summary = this.repository.battery.toSummary(spec);
    const answer = this.repository.battery.explainWhy(summary, vehicles);

    return {
      intent: 'explanation',
      found: true,
      answer,
      explanation: {
        reference: summary.reference,
        spec: summary,
        catalogVehicles: vehicles,
      },
    };
  }

  compare(leftRef: string, rightRef: string): KnowledgeResponse {
    const leftLit = normalizeReferenceLiteral(leftRef);
    const rightLit = normalizeReferenceLiteral(rightRef);
    const leftSpec = this.repository.findSpec(leftLit);
    const rightSpec = this.repository.findSpec(rightLit);

    if (!leftSpec || !rightSpec) {
      const missing = [
        !leftSpec ? leftLit : null,
        !rightSpec ? rightLit : null,
      ]
        .filter(Boolean)
        .join(' y ');
      return {
        intent: 'comparison',
        found: false,
        answer: `No pude comparar: falta ficha en catálogo para *${missing}*.`,
      };
    }

    const left = this.repository.battery.toSummary(leftSpec);
    const right = this.repository.battery.toSummary(rightSpec);
    const { points, recommendation, answer } = this.repository.battery.compare(
      left,
      right,
    );

    return {
      intent: 'comparison',
      found: true,
      answer,
      comparison: { left, right, points, recommendation },
    };
  }

  alternatives(reference: string): KnowledgeResponse {
    const ref = normalizeReferenceLiteral(reference);
    const primary = this.repository.findSpec(ref);
    const apps = this.repository.findApplicationsByReference(ref);
    const related = this.repository.collectRelatedSpecs(ref);
    const items = this.repository.battery.findAlternativeItems(
      ref,
      apps,
      related,
      primary,
    );
    const answer = this.repository.battery.formatAlternatives(ref, items);

    return {
      intent: 'alternatives',
      found: items.length > 0,
      answer,
      alternatives: { reference: ref, items },
    };
  }

  faq(topicOrQuestion: string): KnowledgeResponse {
    const article = this.repository.findArticle(topicOrQuestion);
    if (!article) {
      return {
        intent: 'faq',
        found: false,
        answer: [
          'No tengo un artículo exacto para esa pregunta.',
          'Prueba con: CCA, Ah, libre mantenimiento, batería menor o mayor.',
        ].join('\n'),
      };
    }
    return {
      intent: 'faq',
      found: true,
      answer: [`*${article.title}*`, '', article.body].join('\n'),
      faq: { articleId: article.id, title: article.title },
    };
  }

  compatibility(
    reference: string,
    marca: string,
    modelo: string,
    _year?: string,
  ): KnowledgeResponse {
    const ref = normalizeReferenceLiteral(reference);
    const appsForRef = this.repository.findApplicationsByReference(ref);
    const appsForVehicle = this.repository.findApplicationsByVehicle(marca, modelo);
    const result = this.repository.battery.isCompatibleWithVehicle(
      ref,
      marca,
      modelo,
      appsForRef,
      appsForVehicle,
    );

    return {
      intent: 'compatibility',
      found: result.compatible,
      answer: result.answer,
      compatibility: {
        reference: ref,
        marca,
        modelo,
        compatible: result.compatible,
        matchingVehicles: result.matching,
      },
    };
  }

  /** Compatibilidad cuando solo se menciona el modelo (ej. “a un Logan”). */
  compatibilityByModel(reference: string, modelo: string): KnowledgeResponse {
    const ref = normalizeReferenceLiteral(reference);
    const appsForRef = this.repository.findApplicationsByReference(ref);
    const modeloN = modelo.trim().toLowerCase();
    const matching = this.repository.battery.toVehicleHits(
      appsForRef.filter((app) => {
        const m = `${app.modelo} ${app.textoCatalogo}`.toLowerCase();
        return m.includes(modeloN) || modeloN.includes(app.modelo.toLowerCase());
      }),
    );
    const compatible = matching.length > 0;
    const marca = matching[0]?.marca ?? '(catálogo)';
    const answer = compatible
      ? [
          `Sí: según el catálogo Willard, la *${ref}* aparece asociada a *${modelo}*.`,
          '',
          'Coincidencias:',
          ...matching.slice(0, 5).map((v) => `• ${v.marca} ${v.textoCatalogo || v.modelo}`),
          '',
          'Un asesor confirma año exacto, caja y disponibilidad.',
        ].join('\n')
      : [
          `Con la evidencia del catálogo Willard, no encuentro la *${ref}* asociada a *${modelo}*.`,
          'Un asesor puede validar otra referencia para ese vehículo.',
        ].join('\n');

    return {
      intent: 'compatibility',
      found: compatible,
      answer,
      compatibility: {
        reference: ref,
        marca,
        modelo,
        compatible,
        matchingVehicles: matching,
      },
    };
  }
}

function unknownResponse(answer: string): KnowledgeResponse {
  return {
    intent: 'unknown',
    found: false,
    answer,
  };
}

/** Tokens que parecen referencia Willard (deben incluir dígitos). */
function extractReferenceTokens(text: string): string[] {
  const matches = text.match(/\b[A-Za-z]{0,4}-?\d{2,5}[A-Za-z0-9-]*\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const key = normalizeReferenceLiteral(m);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

const ARTICLE = '(?:un|una|el|la)';

function extractVehicleHint(
  text: string,
): { marca: string; modelo: string } | null {
  // "a un Renault Logan" / "para la Mazda 2"
  const m = text.match(
    new RegExp(
      `\\b(?:a|para|en)\\s+${ARTICLE}\\s+([A-Za-zÁÉÍÓÚÜÑ]{2,})\\s+([A-Za-z0-9][\\wÁÉÍÓÚÜÑ .-]{1,40})`,
      'i',
    ),
  );
  if (!m) return null;
  const marca = m[1]!.trim();
  const modelo = m[2]!.trim();
  if (/^(un|una|el|la)$/i.test(marca)) return null;
  return { marca, modelo };
}

function extractModelOnlyHint(text: string): string | null {
  // "a un Logan" / "para una Spark"
  const m = text.match(
    new RegExp(
      `\\b(?:a|para|en)\\s+${ARTICLE}\\s+([A-Za-zÁÉÍÓÚÜÑ][A-Za-zÁÉÍÓÚÜÑ0-9-]{1,30})`,
      'i',
    ),
  );
  const model = m?.[1]?.trim();
  if (!model || /^(un|una|el|la)$/i.test(model)) return null;
  return model;
}
