import type { Lead } from '../entities/Lead';
import type { LeadListFilter } from '../ports/LeadRepository';

/**
 * Filtro de listado de leads (compartido InMemory / SQLite).
 * Misma semántica que el CRM en memoria — no diverger.
 */
export function matchesLeadFilter(lead: Lead, filter?: LeadListFilter): boolean {
  if (!filter) return true;

  if (!matchesOneOrMany(lead.status, filter.status)) return false;
  if (!matchesOneOrMany(lead.priority, filter.priority)) return false;
  if (filter.product !== undefined && lead.product !== filter.product) {
    return false;
  }
  if (filter.customerId !== undefined && lead.customerId !== filter.customerId) {
    return false;
  }
  if (
    filter.assigneeId !== undefined &&
    lead.assignment?.assigneeId !== filter.assigneeId
  ) {
    return false;
  }
  if (
    filter.outcome !== undefined &&
    lead.recommendationSnapshot?.outcome !== filter.outcome
  ) {
    return false;
  }
  if (filter.from !== undefined && lead.createdAt < filter.from) return false;
  if (filter.to !== undefined && lead.createdAt > filter.to) return false;

  if (filter.q !== undefined) {
    const q = filter.q.trim().toLowerCase();
    if (q) {
      const haystack = [lead.phone, lead.name ?? '', lead.vehicleBrand]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
  }

  return true;
}

function matchesOneOrMany<T extends string>(
  value: T | undefined,
  filter: T | T[] | undefined,
): boolean {
  if (filter === undefined) return true;
  if (value === undefined) return false;
  const values = Array.isArray(filter) ? filter : [filter];
  return values.includes(value);
}
