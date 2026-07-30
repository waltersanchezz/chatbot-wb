/**
 * Pure helpers for the Rodacenter CRM dashboard (testable without DOM).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DashboardHelpers = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUS_LABELS = {
    nuevo: 'Nuevo',
    asignado: 'Asignado',
    en_gestion: 'En gestión',
    cotizado: 'Cotizado',
    recontacto: 'Recontacto',
    vendido: 'Vendido',
    perdido: 'Perdido',
    cerrado: 'Cerrado',
  };

  var PRIORITY_LABELS = {
    Alta: 'Alta',
    Media: 'Media',
    Baja: 'Baja',
  };

  var OPEN_STATUSES = ['nuevo', 'asignado', 'en_gestion', 'cotizado', 'recontacto'];

  function digitsOnly(phone) {
    return String(phone == null ? '' : phone).replace(/\D/g, '');
  }

  function buildWhatsAppUrl(phone) {
    var digits = digitsOnly(phone);
    if (!digits) return null;
    return 'https://wa.me/' + digits;
  }

  function formatPhoneDisplay(phone) {
    var digits = digitsOnly(phone);
    if (digits.startsWith('57') && digits.length >= 12) {
      return (
        '+57 ' +
        digits.slice(2, 5) +
        ' ' +
        digits.slice(5, 8) +
        ' ' +
        digits.slice(8)
      );
    }
    if (!digits) return phone == null ? '' : String(phone);
    return phone == null ? '' : String(phone);
  }

  function statusLabel(status) {
    if (status == null || status === '') return '—';
    return STATUS_LABELS[status] || String(status);
  }

  function priorityLabel(priority) {
    if (priority == null || priority === '') return '—';
    return PRIORITY_LABELS[priority] || String(priority);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isToday(iso) {
    if (!iso) return false;
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    var now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function formatTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function vehicleLabel(lead) {
    if (!lead) return 'Sin vehículo';
    var parts = [lead.vehicleBrand, lead.vehicleModel].filter(Boolean);
    var base = parts.join(' ').trim();
    if (lead.year) {
      base = (base ? base + ' · ' : '') + String(lead.year);
    }
    return base || 'Sin vehículo';
  }

  function isOpenStatus(status) {
    return OPEN_STATUSES.indexOf(status) !== -1;
  }

  function filterLeads(leads, filters) {
    var list = Array.isArray(leads) ? leads : [];
    var status = filters && filters.status;
    var priority = filters && filters.priority;
    return list.filter(function (lead) {
      if (status && status !== 'all' && lead.status !== status) return false;
      if (priority && priority !== 'all' && lead.priority !== priority) return false;
      return true;
    });
  }

  function computeStats(leads) {
    var list = Array.isArray(leads) ? leads : [];
    var today = 0;
    var open = 0;
    var alta = 0;
    var sold = 0;
    for (var i = 0; i < list.length; i++) {
      var lead = list[i];
      if (isToday(lead.createdAt || lead.arrivedAt)) today += 1;
      if (isOpenStatus(lead.status)) open += 1;
      if (lead.priority === 'Alta' && isOpenStatus(lead.status)) alta += 1;
      if (lead.status === 'vendido') sold += 1;
    }
    return { today: today, open: open, alta: alta, sold: sold };
  }

  function buildLeadsQuery(filters) {
    var params = new URLSearchParams();
    if (!filters) return '';
    if (filters.status && filters.status !== 'all') {
      params.set('status', filters.status);
    }
    if (filters.priority && filters.priority !== 'all') {
      params.set('priority', filters.priority);
    }
    var qs = params.toString();
    return qs ? '?' + qs : '';
  }

  return {
    STATUS_LABELS: STATUS_LABELS,
    PRIORITY_LABELS: PRIORITY_LABELS,
    OPEN_STATUSES: OPEN_STATUSES,
    digitsOnly: digitsOnly,
    buildWhatsAppUrl: buildWhatsAppUrl,
    formatPhoneDisplay: formatPhoneDisplay,
    statusLabel: statusLabel,
    priorityLabel: priorityLabel,
    escapeHtml: escapeHtml,
    isToday: isToday,
    formatTime: formatTime,
    formatDateTime: formatDateTime,
    vehicleLabel: vehicleLabel,
    isOpenStatus: isOpenStatus,
    filterLeads: filterLeads,
    computeStats: computeStats,
    buildLeadsQuery: buildLeadsQuery,
  };
});
