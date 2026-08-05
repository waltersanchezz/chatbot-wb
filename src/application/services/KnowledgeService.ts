import type { KnowledgeRepository } from '../../domain/dashboard/KnowledgeRepository';
import type {
  KnowledgeCreateInput,
  KnowledgeItemDto,
  KnowledgeListFilters,
  KnowledgeListResult,
  KnowledgeUpdateInput,
} from '../../domain/dashboard/knowledgeItemDto';
import { isKnowledgeCategory } from '../../domain/dashboard/knowledgeItemDto';

export class KnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeValidationError';
  }
}

/**
 * Administrador de conocimiento por tenant (Dashboard Sprint 13).
 * No conoce ConversationEngine ni WhatsApp.
 */
export class KnowledgeService {
  constructor(private readonly repository: KnowledgeRepository) {
    this.repository.seedDefaultsIfEmpty();
  }

  list(filters?: KnowledgeListFilters): KnowledgeListResult {
    return this.repository.list(filters);
  }

  getById(id: string): KnowledgeItemDto | null {
    return this.repository.getById(id);
  }

  create(input: KnowledgeCreateInput): KnowledgeItemDto {
    this.assertCreate(input);
    return this.repository.create(sanitizeCreate(input));
  }

  update(id: string, input: KnowledgeUpdateInput): KnowledgeItemDto | null {
    if (!id.trim()) {
      throw new KnowledgeValidationError('id es obligatorio');
    }
    this.assertUpdate(input);
    return this.repository.update(id, sanitizeUpdate(input));
  }

  delete(id: string): boolean {
    if (!id.trim()) {
      throw new KnowledgeValidationError('id es obligatorio');
    }
    return this.repository.delete(id);
  }

  search(query: string): KnowledgeItemDto[] {
    return this.repository.search(String(query ?? '').trim());
  }

  duplicate(id: string): KnowledgeItemDto | null {
    if (!id.trim()) {
      throw new KnowledgeValidationError('id es obligatorio');
    }
    return this.repository.duplicate(id);
  }

  importCsv(csv: string): { imported: number; items: KnowledgeItemDto[] } {
    const rows = parseKnowledgeCsv(csv);
    if (!rows.length) {
      throw new KnowledgeValidationError(
        'CSV vacío o sin filas válidas (columnas: Preguntas, Respuestas, Categoría, Tags)',
      );
    }
    const items: KnowledgeItemDto[] = [];
    for (const row of rows) {
      items.push(
        this.repository.create({
          category: row.category,
          title: row.question.slice(0, 120) || 'Pregunta importada',
          question: row.question,
          answer: row.answer,
          tags: row.tags,
          enabled: true,
          priority: 0,
        }),
      );
    }
    return { imported: items.length, items };
  }

  exportCsv(filters?: KnowledgeListFilters): string {
    const { items } = this.repository.list(filters);
    const lines = ['Preguntas,Respuestas,Categoría,Tags'];
    for (const item of items) {
      lines.push(
        [
          csvEscape(item.question),
          csvEscape(item.answer),
          csvEscape(item.category),
          csvEscape(item.tags.join('; ')),
        ].join(','),
      );
    }
    return lines.join('\n') + '\n';
  }

  private assertCreate(input: KnowledgeCreateInput): void {
    if (!String(input.question ?? '').trim() && !String(input.title ?? '').trim()) {
      throw new KnowledgeValidationError('question o title es obligatorio');
    }
    if (!String(input.answer ?? '').trim()) {
      throw new KnowledgeValidationError('answer es obligatorio');
    }
    if (
      input.category !== undefined &&
      String(input.category).trim() &&
      !isKnowledgeCategory(String(input.category).trim())
    ) {
      throw new KnowledgeValidationError(
        `category inválida: ${String(input.category)}`,
      );
    }
  }

  private assertUpdate(input: KnowledgeUpdateInput): void {
    if (
      input.category !== undefined &&
      String(input.category).trim() &&
      !isKnowledgeCategory(String(input.category).trim())
    ) {
      throw new KnowledgeValidationError(
        `category inválida: ${String(input.category)}`,
      );
    }
    if (input.answer !== undefined && !String(input.answer).trim()) {
      throw new KnowledgeValidationError('answer no puede estar vacío');
    }
  }
}

function sanitizeCreate(input: KnowledgeCreateInput): KnowledgeCreateInput {
  return {
    category: input.category,
    title: String(input.title ?? input.question ?? '').trim(),
    question: String(input.question ?? input.title ?? '').trim(),
    answer: String(input.answer ?? '').trim(),
    tags: input.tags,
    priority: input.priority,
    enabled: input.enabled,
  };
}

function sanitizeUpdate(input: KnowledgeUpdateInput): KnowledgeUpdateInput {
  const out: KnowledgeUpdateInput = {};
  if (input.category !== undefined) out.category = input.category;
  if (input.title !== undefined) out.title = String(input.title).trim();
  if (input.question !== undefined) out.question = String(input.question).trim();
  if (input.answer !== undefined) out.answer = String(input.answer).trim();
  if (input.tags !== undefined) out.tags = input.tags;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.enabled !== undefined) out.enabled = input.enabled;
  return out;
}

interface CsvRow {
  question: string;
  answer: string;
  category: string;
  tags: string[];
}

function parseKnowledgeCsv(csv: string): CsvRow[] {
  const text = String(csv ?? '').replace(/^\uFEFF/, '');
  const records = splitCsvRecords(text);
  if (records.length < 2) return [];

  const headerCells = records[0]!;
  const headerMap = mapCsvHeaders(headerCells);
  if (headerMap.question < 0 || headerMap.answer < 0) return [];

  const rows: CsvRow[] = [];
  for (const cells of records.slice(1)) {
    const question = (cells[headerMap.question] ?? '').trim();
    const answer = (cells[headerMap.answer] ?? '').trim();
    if (!question || !answer) continue;
    const category =
      headerMap.category >= 0
        ? (cells[headerMap.category] ?? 'FAQ').trim() || 'FAQ'
        : 'FAQ';
    const tagsRaw =
      headerMap.tags >= 0 ? (cells[headerMap.tags] ?? '').trim() : '';
    const tags = tagsRaw
      ? tagsRaw.split(/[;|]/).map((t) => t.trim()).filter(Boolean)
      : [];
    rows.push({ question, answer, category, tags });
  }
  return rows;
}

/** Separa registros CSV respetando comillas (incluye saltos de línea dentro de campo). */
function splitCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cur);
      cur = '';
      if (row.some((c) => c.trim().length > 0)) {
        records.push(row.map((c) => c.trim()));
      }
      row = [];
      continue;
    }
    cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim().length > 0)) {
    records.push(row.map((c) => c.trim()));
  }
  return records;
}

function mapCsvHeaders(cells: string[]): {
  question: number;
  answer: number;
  category: number;
  tags: number;
} {
  const norm = cells.map((c) =>
    c
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim(),
  );
  return {
    question: findHeaderIndex(norm, ['preguntas', 'pregunta', 'question', 'questions']),
    answer: findHeaderIndex(norm, ['respuestas', 'respuesta', 'answer', 'answers']),
    category: findHeaderIndex(norm, ['categoria', 'category', 'categorias']),
    tags: findHeaderIndex(norm, ['tags', 'etiquetas', 'tag']),
  };
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (aliases.includes(headers[i]!)) return i;
  }
  return -1;
}

function csvEscape(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
