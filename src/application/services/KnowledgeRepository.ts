import {
  findKnowledgeArticle,
  KNOWLEDGE_ARTICLES,
  type KnowledgeArticle,
} from '../../domain/knowledge/knowledgeArticles';
import { BatteryKnowledge } from '../../domain/knowledge/batteryKnowledge';
import type { WillardBatteryKnowledge } from '../../domain/ports/WillardBatteryKnowledge';
import type {
  WillardApplicationHit,
  WillardReferenceSpec,
} from '../../domain/willard/catalogTypes';
import { normalizeReferenceLiteral } from '../../domain/willard/normalize';

/**
 * Fuente opcional de artículos (SQLite por tenant).
 * Si hay ítems habilitados, el motor los usa; si no, cae al catálogo estático.
 * KnowledgeEngine no cambia: solo varía la fuente vía este repositorio.
 */
export interface KnowledgeArticleSource {
  listEnabledArticles(): KnowledgeArticle[];
}

/**
 * Acceso unificado a artículos FAQ + catálogo Willard.
 * No conoce WhatsApp ni ConversationEngine.
 */
export class KnowledgeRepository {
  readonly battery = new BatteryKnowledge();

  constructor(
    private readonly catalog: WillardBatteryKnowledge,
    private readonly articles: KnowledgeArticle[] = KNOWLEDGE_ARTICLES,
    private readonly articleSource?: KnowledgeArticleSource,
  ) {}

  private resolveArticles(): KnowledgeArticle[] {
    const fromSource = this.articleSource?.listEnabledArticles() ?? [];
    if (fromSource.length > 0) return fromSource;
    return this.articles;
  }

  findArticle(topicOrQuestion: string): KnowledgeArticle | null {
    return findKnowledgeArticle(topicOrQuestion, this.resolveArticles());
  }

  listArticles(): KnowledgeArticle[] {
    return [...this.resolveArticles()];
  }

  findSpec(reference: string): WillardReferenceSpec | null {
    const literal = normalizeReferenceLiteral(reference);
    if (!literal) return null;
    return this.catalog.findReferenceSpec(literal);
  }

  findApplicationsByReference(reference: string): WillardApplicationHit[] {
    return this.catalog.findApplicationsByReference(reference);
  }

  findApplicationsByVehicle(
    marca: string,
    modelo: string,
  ): WillardApplicationHit[] {
    return this.catalog.findApplicationsByVehicle({
      marca,
      modelo,
      limit: 40,
    });
  }

  /**
   * Specs conocidas a partir de aplicaciones de una referencia
   * (para armar alternativas sin exponer el JSON completo).
   */
  collectRelatedSpecs(reference: string): WillardReferenceSpec[] {
    const apps = this.findApplicationsByReference(reference);
    const refs = new Set<string>();
    for (const app of apps) {
      for (const line of app.lines) {
        for (const ref of line.references) {
          const lit = normalizeReferenceLiteral(ref);
          if (lit) refs.add(lit);
        }
      }
    }

    // Ampliar con vecinos por marca de las apps (misma marca → más refs).
    for (const app of apps.slice(0, 8)) {
      const brandApps = this.catalog.findApplicationsByVehicle({
        marca: app.marca,
        limit: 40,
      });
      for (const ba of brandApps) {
        for (const line of ba.lines) {
          for (const ref of line.references) {
            const lit = normalizeReferenceLiteral(ref);
            if (lit) refs.add(lit);
          }
        }
      }
    }

    const specs: WillardReferenceSpec[] = [];
    for (const ref of refs) {
      const spec = this.catalog.findReferenceSpec(ref);
      if (spec) specs.push(spec);
    }
    return specs;
  }
}
