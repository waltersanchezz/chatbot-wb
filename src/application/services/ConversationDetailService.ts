import type { ConversationDetailDto } from '../../domain/dashboard/conversationDetailDto';
import type { ConversationDetailRepository } from '../../domain/dashboard/ConversationDetailRepository';
import type { WillardBatteryKnowledge } from '../../domain/ports/WillardBatteryKnowledge';
import type { WillardReferenceSpec } from '../../domain/willard/catalogTypes';

/**
 * Conversation Detail API — lectura para el Dashboard.
 * No modifica el flujo conversacional.
 */
export class ConversationDetailService {
  constructor(
    private readonly repository: ConversationDetailRepository,
    /** Solo lectura de ficha técnica Willard (amperaje / tipo de caja). */
    private readonly knowledge?: WillardBatteryKnowledge,
  ) {}

  getById(id: string): ConversationDetailDto | null {
    const trimmed = id?.trim();
    if (!trimmed) return null;
    const detail = this.repository.findById(trimmed);
    if (!detail) return null;
    return this.enrichFromCatalog(detail);
  }

  private enrichFromCatalog(detail: ConversationDetailDto): ConversationDetailDto {
    if (!this.knowledge || !detail.recommendedReference?.trim()) {
      return detail;
    }
    const spec = this.knowledge.findReferenceSpec(detail.recommendedReference);
    if (!spec) return detail;

    return {
      ...detail,
      amperage: detail.amperage ?? formatAmperage(spec),
      caseType: detail.caseType ?? (spec.linea?.trim() || null),
    };
  }
}

function formatAmperage(spec: WillardReferenceSpec): string | null {
  const parts: string[] = [];
  if (spec.c20Ah != null) parts.push(`${spec.c20Ah} Ah`);
  if (spec.cca18C != null) parts.push(`CCA ${spec.cca18C}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
