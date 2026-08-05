import type { WillardApplicationHit, WillardReferenceSpec } from '../willard/catalogTypes';
import { normalizeReferenceLiteral, normalizeWillardText } from '../willard/normalize';
import type {
  KnowledgeAlternativeItem,
  KnowledgeComparisonPoint,
  KnowledgeCompatibilityHit,
  KnowledgeSpecSummary,
} from './knowledgeTypes';

/**
 * Lógica de conocimiento técnico sobre baterías (pura, sin I/O ni canal).
 * Usa fichas y aplicaciones del catálogo Willard.
 */
export class BatteryKnowledge {
  toSummary(spec: WillardReferenceSpec): KnowledgeSpecSummary {
    const dims = spec.dimensionesMm;
    const dimensionsMm =
      dims && dims.largo != null && dims.ancho != null && dims.alto != null
        ? `${dims.largo}×${dims.ancho}×${dims.alto} mm`
        : null;

    return {
      reference: spec.referencia,
      linea: spec.linea?.trim() || null,
      cca: spec.cca18C,
      ah: spec.c20Ah,
      caseType: spec.linea?.trim() || null,
      terminal: spec.terminal,
      polaridad: spec.polaridad,
      observations: spec.notas?.trim() || null,
      dimensionsMm,
    };
  }

  toVehicleHits(apps: WillardApplicationHit[]): KnowledgeCompatibilityHit[] {
    const seen = new Set<string>();
    const hits: KnowledgeCompatibilityHit[] = [];
    for (const app of apps) {
      const key = `${normalizeWillardText(app.marca)}|${normalizeWillardText(app.modelo)}|${app.textoCatalogo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        marca: app.marca,
        modelo: app.modelo,
        textoCatalogo: app.textoCatalogo,
        version: app.version,
      });
    }
    return hits;
  }

  explainWhy(summary: KnowledgeSpecSummary, vehicles: KnowledgeCompatibilityHit[]): string {
    const lines = [
      `Te explico por qué la referencia *${summary.reference}* aparece en catálogo:`,
      '',
    ];

    if (summary.cca != null) {
      lines.push(`• *CCA:* ${summary.cca} (capacidad de arranque en frío)`);
    } else {
      lines.push('• *CCA:* consultar ficha técnica');
    }

    if (summary.ah != null) {
      lines.push(`• *Amperaje (Ah / C20):* ${summary.ah}`);
    } else {
      lines.push('• *Amperaje (Ah):* consultar ficha técnica');
    }

    if (summary.caseType) {
      lines.push(`• *Línea / tipo de caja:* ${summary.caseType}`);
    }
    if (summary.terminal) {
      lines.push(`• *Terminal:* ${summary.terminal}`);
    }
    if (summary.polaridad) {
      lines.push(`• *Polaridad:* ${summary.polaridad}`);
    }
    if (summary.dimensionsMm) {
      lines.push(`• *Dimensiones:* ${summary.dimensionsMm}`);
    }
    if (summary.observations) {
      lines.push(`• *Observaciones:* ${summary.observations}`);
    }

    if (vehicles.length > 0) {
      const sample = vehicles
        .slice(0, 5)
        .map((v) => `• ${v.marca} ${v.textoCatalogo || v.modelo}`)
        .join('\n');
      lines.push('', 'Aplicaciones de catálogo asociadas:', sample);
    }

    lines.push(
      '',
      'Estos datos salen del catálogo Willard; un asesor confirma disponibilidad y precio.',
    );
    return lines.join('\n');
  }

  compare(
    left: KnowledgeSpecSummary,
    right: KnowledgeSpecSummary,
  ): { points: KnowledgeComparisonPoint[]; recommendation: string; answer: string } {
    const points: KnowledgeComparisonPoint[] = [];

    points.push(this.diffNumber('CCA', left.cca, right.cca, left.reference, right.reference));
    points.push(this.diffNumber('Ah (C20)', left.ah, right.ah, left.reference, right.reference));
    points.push({
      field: 'Línea / caja',
      left: left.caseType ?? '—',
      right: right.caseType ?? '—',
    });
    points.push({
      field: 'Terminal',
      left: left.terminal ?? '—',
      right: right.terminal ?? '—',
    });
    points.push({
      field: 'Polaridad',
      left: left.polaridad ?? '—',
      right: right.polaridad ?? '—',
    });
    points.push({
      field: 'Dimensiones',
      left: left.dimensionsMm ?? '—',
      right: right.dimensionsMm ?? '—',
    });

    const recommendation = this.chooseRecommendation(left, right);
    const answer = [
      `Comparación *${left.reference}* vs *${right.reference}* (catálogo Willard):`,
      '',
      ...points.map((p) => {
        const note = p.note ? ` — ${p.note}` : '';
        return `• *${p.field}:* ${p.left}  |  ${p.right}${note}`;
      }),
      '',
      recommendation,
    ].join('\n');

    return { points, recommendation, answer };
  }

  /**
   * Alternativas: otras referencias en las mismas aplicaciones,
   * o con CCA/Ah cercanos (±15%) y misma línea cuando sea posible.
   */
  findAlternativeItems(
    reference: string,
    appsForRef: WillardApplicationHit[],
    allSpecs: WillardReferenceSpec[],
    primarySpec: WillardReferenceSpec | null,
  ): KnowledgeAlternativeItem[] {
    const target = normalizeReferenceLiteral(reference);
    const fromApps = new Set<string>();

    for (const app of appsForRef) {
      for (const line of app.lines) {
        for (const ref of line.references) {
          const lit = normalizeReferenceLiteral(ref);
          if (lit && lit !== target) fromApps.add(lit);
        }
      }
    }

    const items: KnowledgeAlternativeItem[] = [];
    const pushUnique = (ref: string, reason: string, spec: WillardReferenceSpec) => {
      if (items.some((i) => normalizeReferenceLiteral(i.reference) === normalizeReferenceLiteral(ref))) {
        return;
      }
      items.push({
        reference: spec.referencia,
        reason,
        spec: this.toSummary(spec),
      });
    };

    for (const ref of fromApps) {
      const spec = allSpecs.find(
        (s) => normalizeReferenceLiteral(s.referencia) === normalizeReferenceLiteral(ref),
      );
      if (spec) {
        pushUnique(ref, 'Aparece en las mismas aplicaciones de catálogo', spec);
      }
    }

    if (primarySpec && items.length < 5) {
      const cca = primarySpec.cca18C;
      const ah = primarySpec.c20Ah;
      for (const spec of allSpecs) {
        if (normalizeReferenceLiteral(spec.referencia) === target) continue;
        if (items.length >= 6) break;
        const reason = this.similarReason(primarySpec, spec, cca, ah);
        if (reason) pushUnique(spec.referencia, reason, spec);
      }
    }

    return items.slice(0, 6);
  }

  formatAlternatives(reference: string, items: KnowledgeAlternativeItem[]): string {
    if (items.length === 0) {
      return [
        `Revisé el catálogo Willard buscando equivalentes a *${reference}*.`,
        '',
        'No encontré alternativas utilizables con la evidencia actual.',
        'Un asesor puede revisar contigo otra referencia compatible.',
      ].join('\n');
    }

    const lines = [
      `Si no tienes la *${reference}*, estas son alternativas del catálogo:`,
      '',
    ];
    for (const item of items) {
      const cca = item.spec.cca != null ? `CCA ${item.spec.cca}` : 'CCA n/d';
      const ah = item.spec.ah != null ? `${item.spec.ah} Ah` : 'Ah n/d';
      lines.push(`• *${item.reference}* — ${cca}, ${ah}`);
      lines.push(`  ${item.reason}`);
    }
    lines.push(
      '',
      'Confirma caja, polaridad y vehículo antes de instalar. Disponibilidad con el asesor.',
    );
    return lines.join('\n');
  }

  isCompatibleWithVehicle(
    reference: string,
    marca: string,
    modelo: string,
    appsForRef: WillardApplicationHit[],
    appsForVehicle: WillardApplicationHit[],
  ): { compatible: boolean; matching: KnowledgeCompatibilityHit[]; answer: string } {
    const target = normalizeReferenceLiteral(reference);
    const marcaN = normalizeWillardText(marca);
    const modeloN = normalizeWillardText(modelo);

    const matchingFromRef = appsForRef.filter(
      (app) =>
        normalizeWillardText(app.marca) === marcaN &&
        (normalizeWillardText(app.modelo).includes(modeloN) ||
          normalizeWillardText(app.textoCatalogo).includes(modeloN) ||
          modeloN.includes(normalizeWillardText(app.modelo))),
    );

    const matchingFromVehicle = appsForVehicle.filter((app) =>
      app.lines.some((line) =>
        line.references.some(
          (r) => normalizeReferenceLiteral(r) === target,
        ),
      ),
    );

    const merged = this.toVehicleHits([...matchingFromRef, ...matchingFromVehicle]);
    const compatible = merged.length > 0;

    const answer = compatible
      ? [
          `Sí: según el catálogo Willard, la *${reference}* aparece para *${marca} ${modelo}*.`,
          '',
          'Coincidencias:',
          ...merged
            .slice(0, 5)
            .map((v) => `• ${v.marca} ${v.textoCatalogo || v.modelo}`),
          '',
          'Un asesor confirma año exacto, caja y disponibilidad.',
        ].join('\n')
      : [
          `Con la evidencia del catálogo Willard, no encuentro la *${reference}* asociada a *${marca} ${modelo}*.`,
          '',
          'Puede que exista otra referencia para ese vehículo, o que falte el modelo/año exacto.',
          'Te recomiendo validarlo con un asesor de Rodacenter.',
        ].join('\n');

    return { compatible, matching: merged, answer };
  }

  private diffNumber(
    field: string,
    left: number | null,
    right: number | null,
    leftRef: string,
    rightRef: string,
  ): KnowledgeComparisonPoint {
    const l = left == null ? '—' : String(left);
    const r = right == null ? '—' : String(right);
    let note: string | undefined;
    if (left != null && right != null) {
      if (left > right) note = `${leftRef} tiene más ${field}`;
      else if (right > left) note = `${rightRef} tiene más ${field}`;
      else note = 'iguales';
    }
    return { field, left: l, right: r, note };
  }

  private chooseRecommendation(
    left: KnowledgeSpecSummary,
    right: KnowledgeSpecSummary,
  ): string {
    const lCca = left.cca ?? 0;
    const rCca = right.cca ?? 0;
    const lAh = left.ah ?? 0;
    const rAh = right.ah ?? 0;

    if (lCca === rCca && lAh === rAh) {
      return `En CCA/Ah son equivalentes; elige según *caja, polaridad y disponibilidad*. Revisa *${left.reference}* y *${right.reference}* en el vehículo.`;
    }

    const stronger = lCca + lAh >= rCca + rAh ? left : right;
    const lighter = stronger.reference === left.reference ? right : left;

    return [
      `Cuándo elegir *${stronger.reference}:* más reserva/arranque (CCA/Ah superiores en ficha).`,
      `Cuándo elegir *${lighter.reference}:* si el catálogo la asocia a tu vehículo y la caja/polaridad calzan, o si buscas la opción listada como estándar.`,
      'Siempre prioriza la referencia del catálogo para tu marca/modelo/año.',
    ].join('\n');
  }

  private similarReason(
    primary: WillardReferenceSpec,
    candidate: WillardReferenceSpec,
    cca: number | null,
    ah: number | null,
  ): string | null {
    if (cca != null && candidate.cca18C != null) {
      const delta = Math.abs(candidate.cca18C - cca) / cca;
      if (delta <= 0.15) {
        if (
          primary.linea &&
          candidate.linea &&
          normalizeWillardText(primary.linea) === normalizeWillardText(candidate.linea)
        ) {
          return 'CCA cercano (±15%) y misma línea de producto';
        }
        return 'CCA cercano (±15%) en catálogo';
      }
    }
    if (ah != null && candidate.c20Ah != null) {
      const delta = Math.abs(candidate.c20Ah - ah) / ah;
      if (delta <= 0.15) return 'Capacidad Ah cercana (±15%)';
    }
    return null;
  }
}
