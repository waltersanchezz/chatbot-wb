import { DatabaseSync } from 'node:sqlite';
import type {
  CompanyDto,
  CompanyUpdateInput,
} from '../../domain/dashboard/companyDto';
import { defaultCompanyDto } from '../../domain/dashboard/companyDto';
import type { CompanyRepository } from '../../domain/dashboard/CompanyRepository';
import {
  resolveTenantId,
  type TenantScopedOptions,
} from './sqliteTenant';

/**
 * company_settings en SQLite, scoped por tenant_id.
 */
export class SQLiteCompanyRepository implements CompanyRepository {
  private readonly db: DatabaseSync;
  private readonly now: () => number;
  private readonly fixedTenantId?: string;

  constructor(
    databasePath: string = ':memory:',
    options: { now?: () => number } & TenantScopedOptions = {},
  ) {
    this.now = options.now ?? (() => Date.now());
    this.fixedTenantId = options.tenantId;
    this.db = new DatabaseSync(databasePath);
    if (databasePath !== ':memory:') {
      try {
        this.db.exec('PRAGMA journal_mode = WAL;');
      } catch {
        /* ignore */
      }
    }
    this.ensureSchema();
  }

  private tenant(): string {
    return resolveTenantId(this.fixedTenantId);
  }

  getCompany(): CompanyDto {
    const tenantId = this.tenant();
    const row = this.db
      .prepare(`SELECT * FROM company_settings WHERE tenant_id = ?`)
      .get(tenantId) as CompanyRow | undefined;

    if (!row) {
      return this.ensureDefaults(tenantId);
    }
    return rowToDto(row);
  }

  updateCompany(input: CompanyUpdateInput): CompanyDto {
    const current = this.getCompany();
    const now = this.now();
    const next: CompanyDto = {
      ...current,
      companyName: pickString(input.companyName, current.companyName) || current.companyName,
      logoUrl: pickNullable(input.logoUrl, current.logoUrl),
      primaryColor:
        pickString(input.primaryColor, current.primaryColor) || current.primaryColor,
      secondaryColor:
        pickString(input.secondaryColor, current.secondaryColor) ||
        current.secondaryColor,
      phone: pickNullable(input.phone, current.phone),
      email: pickNullable(input.email, current.email),
      website: pickNullable(input.website, current.website),
      address: pickNullable(input.address, current.address),
      city: pickNullable(input.city, current.city),
      country: pickNullable(input.country, current.country),
      businessType: pickNullable(input.businessType, current.businessType),
      welcomeMessage: pickNullable(input.welcomeMessage, current.welcomeMessage),
      workingHours: pickNullable(input.workingHours, current.workingHours),
      updatedAt: new Date(now).toISOString(),
    };

    this.db
      .prepare(
        `
        INSERT INTO company_settings (
          tenant_id, company_name, logo_url, primary_color, secondary_color,
          phone, email, website, address, city, country, business_type,
          welcome_message, working_hours, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO UPDATE SET
          company_name = excluded.company_name,
          logo_url = excluded.logo_url,
          primary_color = excluded.primary_color,
          secondary_color = excluded.secondary_color,
          phone = excluded.phone,
          email = excluded.email,
          website = excluded.website,
          address = excluded.address,
          city = excluded.city,
          country = excluded.country,
          business_type = excluded.business_type,
          welcome_message = excluded.welcome_message,
          working_hours = excluded.working_hours,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        next.tenantId,
        next.companyName,
        next.logoUrl,
        next.primaryColor,
        next.secondaryColor,
        next.phone,
        next.email,
        next.website,
        next.address,
        next.city,
        next.country,
        next.businessType,
        next.welcomeMessage,
        next.workingHours,
        Date.parse(next.createdAt) || now,
        now,
      );

    return this.getCompany();
  }

  close(): void {
    this.db.close();
  }

  private ensureDefaults(tenantId: string): CompanyDto {
    const now = this.now();
    const dto = defaultCompanyDto(tenantId, new Date(now).toISOString());
    this.db
      .prepare(
        `
        INSERT INTO company_settings (
          tenant_id, company_name, logo_url, primary_color, secondary_color,
          phone, email, website, address, city, country, business_type,
          welcome_message, working_hours, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id) DO NOTHING
      `,
      )
      .run(
        dto.tenantId,
        dto.companyName,
        dto.logoUrl,
        dto.primaryColor,
        dto.secondaryColor,
        dto.phone,
        dto.email,
        dto.website,
        dto.address,
        dto.city,
        dto.country,
        dto.businessType,
        dto.welcomeMessage,
        dto.workingHours,
        now,
        now,
      );
    const row = this.db
      .prepare(`SELECT * FROM company_settings WHERE tenant_id = ?`)
      .get(tenantId) as unknown as CompanyRow;
    return rowToDto(row);
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS company_settings (
        tenant_id TEXT PRIMARY KEY NOT NULL,
        company_name TEXT NOT NULL,
        logo_url TEXT,
        primary_color TEXT NOT NULL,
        secondary_color TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        website TEXT,
        address TEXT,
        city TEXT,
        country TEXT,
        business_type TEXT,
        welcome_message TEXT,
        working_hours TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }
}

interface CompanyRow {
  tenant_id: string;
  company_name: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  business_type: string | null;
  welcome_message: string | null;
  working_hours: string | null;
  created_at: number;
  updated_at: number;
}

function rowToDto(row: CompanyRow): CompanyDto {
  return {
    tenantId: row.tenant_id,
    companyName: row.company_name,
    logoUrl: row.logo_url,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    city: row.city,
    country: row.country,
    businessType: row.business_type,
    welcomeMessage: row.welcome_message,
    workingHours: row.working_hours,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function pickString(
  value: string | null | undefined,
  fallback: string,
): string {
  if (value === undefined) return fallback;
  return String(value).trim();
}

function pickNullable(
  value: string | null | undefined,
  fallback: string | null,
): string | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}
