import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// CommonJS helpers from static dashboard folder
// eslint-disable-next-line @typescript-eslint/no-require-imports
const helpers = require('../../dashboard/helpers.js') as {
  digitsOnly: (phone: unknown) => string;
  buildWhatsAppUrl: (phone: unknown) => string | null;
  formatPhoneDisplay: (phone: unknown) => string;
  statusLabel: (status: unknown) => string;
  priorityLabel: (priority: unknown) => string;
  escapeHtml: (value: unknown) => string;
  vehicleLabel: (lead: {
    vehicleBrand?: string;
    vehicleModel?: string;
    year?: string | number;
  }) => string;
  filterLeads: (
    leads: Array<{ status?: string; priority?: string }>,
    filters: { status?: string; priority?: string },
  ) => Array<{ status?: string; priority?: string }>;
  computeStats: (
    leads: Array<{
      status?: string;
      priority?: string;
      createdAt?: string;
    }>,
  ) => { today: number; open: number; alta: number; sold: number };
  buildLeadsQuery: (filters: {
    status?: string;
    priority?: string;
  }) => string;
  isOpenStatus: (status: string) => boolean;
};

describe('dashboard helpers', () => {
  it('buildWhatsAppUrl normaliza dígitos para wa.me', () => {
    expect(helpers.buildWhatsAppUrl('+57 300 123 4567')).toBe(
      'https://wa.me/573001234567',
    );
    expect(helpers.buildWhatsAppUrl('')).toBeNull();
    expect(helpers.buildWhatsAppUrl(null)).toBeNull();
  });

  it('formatPhoneDisplay formatea números CO', () => {
    expect(helpers.formatPhoneDisplay('573001234567')).toBe(
      '+57 300 123 4567',
    );
    expect(helpers.digitsOnly('(300) 123-4567')).toBe('3001234567');
  });

  it('statusLabel y priorityLabel cubren CRM', () => {
    expect(helpers.statusLabel('en_gestion')).toBe('En gestión');
    expect(helpers.statusLabel('recontacto')).toBe('Recontacto');
    expect(helpers.statusLabel('desconocido')).toBe('desconocido');
    expect(helpers.priorityLabel('Alta')).toBe('Alta');
    expect(helpers.priorityLabel(null)).toBe('—');
  });

  it('escapeHtml escapa markup', () => {
    expect(helpers.escapeHtml('<b>"x"&')).toBe(
      '&lt;b&gt;&quot;x&quot;&amp;',
    );
  });

  it('vehicleLabel combina marca/modelo/año', () => {
    expect(
      helpers.vehicleLabel({
        vehicleBrand: 'Toyota',
        vehicleModel: 'Corolla',
        year: 2018,
      }),
    ).toBe('Toyota Corolla · 2018');
    expect(helpers.vehicleLabel({})).toBe('Sin vehículo');
  });

  it('filterLeads y buildLeadsQuery respetan status/priority', () => {
    const leads = [
      { status: 'nuevo', priority: 'Alta' },
      { status: 'cotizado', priority: 'Media' },
      { status: 'nuevo', priority: 'Baja' },
    ];
    expect(
      helpers.filterLeads(leads, { status: 'nuevo', priority: 'all' }),
    ).toHaveLength(2);
    expect(
      helpers.filterLeads(leads, { status: 'all', priority: 'Alta' }),
    ).toHaveLength(1);
    expect(helpers.buildLeadsQuery({ status: 'nuevo', priority: 'Alta' })).toBe(
      '?status=nuevo&priority=Alta',
    );
    expect(helpers.buildLeadsQuery({ status: 'all', priority: 'all' })).toBe('');
  });

  it('computeStats cuenta abiertos, alta y vendidos', () => {
    const now = new Date().toISOString();
    const stats = helpers.computeStats([
      { status: 'nuevo', priority: 'Alta', createdAt: now },
      { status: 'en_gestion', priority: 'Media', createdAt: now },
      { status: 'vendido', priority: 'Baja', createdAt: '2020-01-01T00:00:00.000Z' },
      { status: 'perdido', priority: 'Alta', createdAt: now },
    ]);
    expect(stats.today).toBe(3);
    expect(stats.open).toBe(2);
    expect(stats.alta).toBe(1);
    expect(stats.sold).toBe(1);
    expect(helpers.isOpenStatus('cotizado')).toBe(true);
    expect(helpers.isOpenStatus('cerrado')).toBe(false);
  });
});

describe('dashboard HTML structure', () => {
  it('incluye marcadores del MVP (tabla, detalle, WhatsApp hooks)', () => {
    const html = readFileSync(
      join(process.cwd(), 'dashboard', 'index.html'),
      'utf8',
    );
    expect(html).toContain('id="leads-tbody"');
    expect(html).toContain('id="detail-panel"');
    expect(html).toContain('data-filter-status');
    expect(html).toContain('data-filter-priority');
    expect(html).toContain('/dashboard/helpers.js');
    expect(html).toContain('/dashboard/app.js');
  });
});
