import { readFileSync } from 'fs';
import path from 'path';
import type {
  WillardBatteryKnowledge,
  WillardBatteryMatch,
  WillardLookupQuery,
} from '../../domain/ports/WillardBatteryKnowledge';
import { logger } from '../logging/logger';

interface KnowledgeOption {
  soundSystem: boolean;
  reference: string;
  amperage: number;
  caseType: string;
}

interface KnowledgeVehicle {
  brand: string;
  model: string;
  aliases?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  options: KnowledgeOption[];
}

interface KnowledgeFile {
  version?: string;
  brand?: string;
  vehicles: KnowledgeVehicle[];
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class FileWillardBatteryKnowledge implements WillardBatteryKnowledge {
  private readonly vehicles: KnowledgeVehicle[];

  constructor(filePath?: string) {
    const resolved =
      filePath ?? path.join(process.cwd(), 'data', 'willard-batteries.json');
    try {
      const raw = readFileSync(resolved, 'utf8');
      const parsed = JSON.parse(raw) as KnowledgeFile;
      this.vehicles = Array.isArray(parsed.vehicles) ? parsed.vehicles : [];
      logger.info('Willard knowledge loaded', {
        file: resolved,
        vehicles: this.vehicles.length,
      });
    } catch (err) {
      logger.error('Failed to load Willard knowledge', {
        file: resolved,
        error: err instanceof Error ? err.message : 'unknown',
      });
      this.vehicles = [];
    }
  }

  findRecommendations(query: WillardLookupQuery): WillardBatteryMatch[] {
    const haystack = normalize([query.brand, query.model].filter(Boolean).join(' '));
    if (!haystack) return [];

    const year = query.year ? Number.parseInt(query.year, 10) : undefined;

    const matches: WillardBatteryMatch[] = [];

    for (const vehicle of this.vehicles) {
      if (!this.matchesVehicle(vehicle, haystack, query)) continue;
      if (!this.matchesYear(vehicle, year)) continue;

      for (const option of vehicle.options) {
        if (option.soundSystem !== query.soundSystem) continue;
        matches.push({
          vehicleBrand: vehicle.brand,
          vehicleModel: vehicle.model,
          reference: option.reference,
          amperage: option.amperage,
          caseType: option.caseType,
          soundSystem: option.soundSystem,
        });
      }
    }

    return matches;
  }

  private matchesVehicle(
    vehicle: KnowledgeVehicle,
    haystack: string,
    query: WillardLookupQuery,
  ): boolean {
    const brand = normalize(vehicle.brand);
    const model = normalize(vehicle.model);
    const aliases = (vehicle.aliases ?? []).map(normalize);

    const brandOk =
      haystack.includes(brand) ||
      normalize(query.brand ?? '') === brand ||
      normalize(query.brand ?? '').includes(brand);

    const modelOk =
      haystack.includes(model) ||
      aliases.some((a) => haystack.includes(a) || normalize(query.model ?? '') === a) ||
      normalize(query.model ?? '') === model ||
      normalize(query.model ?? '').includes(model);

    return brandOk && modelOk;
  }

  private matchesYear(vehicle: KnowledgeVehicle, year?: number): boolean {
    if (year === undefined || Number.isNaN(year)) return true;
    if (vehicle.yearFrom != null && year < vehicle.yearFrom) return false;
    if (vehicle.yearTo != null && year > vehicle.yearTo) return false;
    return true;
  }
}
