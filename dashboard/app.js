(function () {
  'use strict';

  var H = window.DashboardHelpers;
  if (!H) {
    console.error('DashboardHelpers no cargó');
    return;
  }

  var STATUS_OPTIONS = Object.keys(H.STATUS_LABELS);
  var ACTOR_KEY = 'rodacenter.crm.advisor';

  var state = {
    leads: [],
    list: [],
    selectedId: null,
    detail: null,
    events: [],
    statusFilter: 'all',
    priorityFilter: 'all',
    lastFingerprint: '',
    busy: false,
  };

  var els = {
    tbody: document.getElementById('leads-tbody'),
    cards: document.getElementById('leads-cards'),
    empty: document.getElementById('empty-state'),
    detailPanel: document.getElementById('detail-panel'),
    detailBody: document.getElementById('detail-body'),
    detailBadges: document.getElementById('detail-badges'),
    detailClose: document.getElementById('detail-close'),
    todayLabel: document.getElementById('today-label'),
    livePill: document.getElementById('live-pill'),
    advisorName: document.getElementById('advisor-name'),
    toast: document.getElementById('toast'),
  };

  function showToast(message, isError) {
    els.toast.textContent = message;
    els.toast.hidden = false;
    els.toast.classList.toggle('is-error', Boolean(isError));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      els.toast.hidden = true;
    }, 2800);
  }

  function loadAdvisor() {
    try {
      var raw = localStorage.getItem(ACTOR_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (parsed && parsed.name) els.advisorName.value = parsed.name;
    } catch (_) {
      /* ignore */
    }
  }

  function saveAdvisor() {
    var name = (els.advisorName.value || '').trim();
    var id =
      'advisor-' +
      (name
        ? name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 24)
        : 'anon');
    try {
      localStorage.setItem(ACTOR_KEY, JSON.stringify({ id: id, name: name || 'Asesor' }));
    } catch (_) {
      /* ignore */
    }
    return { id: id, name: name || 'Asesor' };
  }

  function actorHeaders() {
    var actor = saveAdvisor();
    return {
      'X-Actor-Id': actor.id,
      'X-Actor-Name': actor.name,
    };
  }

  function animateValue(id, next) {
    var el = document.getElementById(id);
    if (!el) return;
    var current = Number(el.textContent) || 0;
    if (current === next) {
      el.textContent = String(next);
      return;
    }
    var start = performance.now();
    var duration = 240;
    function tick(now) {
      var t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(current + (next - current) * t));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function updateStats() {
    var stats = H.computeStats(state.leads);
    animateValue('stat-today', stats.today);
    animateValue('stat-open', stats.open);
    animateValue('stat-alta', stats.alta);
    animateValue('stat-sold', stats.sold);
  }

  function visibleLeads() {
    return state.list.slice().sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  async function refreshFilteredList() {
    var qs = H.buildLeadsQuery({
      status: state.statusFilter,
      priority: state.priorityFilter,
    });
    if (!qs) {
      state.list = state.leads.slice();
      renderList();
      return;
    }
    var res = await fetch('/api/leads' + qs);
    if (!res.ok) throw new Error('No se pudieron filtrar los leads');
    var data = await res.json();
    state.list = data.items || [];
    renderList();
  }

  function waButtonHtml(phone, sizeClass) {
    var url = H.buildWhatsAppUrl(phone);
    if (!url) {
      return (
        '<button class="btn btn-whatsapp' +
        (sizeClass ? ' ' + sizeClass : '') +
        '" type="button" disabled>Sin teléfono</button>'
      );
    }
    return (
      '<a class="btn btn-whatsapp' +
      (sizeClass ? ' ' + sizeClass : '') +
      '" href="' +
      H.escapeHtml(url) +
      '" target="_blank" rel="noopener noreferrer" data-stop="1">Abrir WhatsApp</a>'
    );
  }

  function priorityBadge(priority) {
    if (!priority) {
      return '<span class="priority-badge priority-none">—</span>';
    }
    return (
      '<span class="priority-badge priority-' +
      H.escapeHtml(priority) +
      '">' +
      H.escapeHtml(H.priorityLabel(priority)) +
      '</span>'
    );
  }

  function statusBadge(status) {
    return (
      '<span class="status-badge status-' +
      H.escapeHtml(status || '') +
      '">' +
      H.escapeHtml(H.statusLabel(status)) +
      '</span>'
    );
  }

  function renderList() {
    var list = visibleLeads();
    els.tbody.innerHTML = '';
    els.cards.innerHTML = '';
    els.empty.hidden = list.length > 0;

    list.forEach(function (lead) {
      var selected = lead.id === state.selectedId;
      var tr = document.createElement('tr');
      tr.dataset.id = lead.id;
      if (selected) tr.classList.add('is-selected');
      tr.innerHTML =
        '<td>' +
        priorityBadge(lead.priority) +
        '</td>' +
        '<td><div class="cell-client"><strong>' +
        H.escapeHtml(lead.name || 'Cliente WhatsApp') +
        '</strong><span>' +
        H.escapeHtml(H.formatPhoneDisplay(lead.phone)) +
        '</span></div></td>' +
        '<td>' +
        H.escapeHtml(lead.product || '—') +
        '</td>' +
        '<td>' +
        H.escapeHtml(H.vehicleLabel(lead)) +
        '</td>' +
        '<td>' +
        statusBadge(lead.status) +
        '</td>' +
        '<td>' +
        H.escapeHtml(H.formatTime(lead.createdAt)) +
        '</td>' +
        '<td>' +
        waButtonHtml(lead.phone, 'btn-sm') +
        '</td>';
      els.tbody.appendChild(tr);

      var card = document.createElement('article');
      card.className = 'lead-card' + (selected ? ' is-selected' : '');
      card.dataset.id = lead.id;
      card.innerHTML =
        '<div class="lead-card-top">' +
        '<div><h3>' +
        H.escapeHtml(lead.name || 'Cliente WhatsApp') +
        '</h3><p class="lead-card-meta">' +
        H.escapeHtml(H.formatPhoneDisplay(lead.phone)) +
        ' · ' +
        H.escapeHtml(lead.product || '—') +
        '</p></div>' +
        '<div>' +
        priorityBadge(lead.priority) +
        ' ' +
        statusBadge(lead.status) +
        '</div></div>' +
        '<p class="lead-card-meta">' +
        H.escapeHtml(H.vehicleLabel(lead)) +
        ' · ' +
        H.escapeHtml(H.formatTime(lead.createdAt)) +
        '</p>' +
        '<div class="lead-card-actions">' +
        waButtonHtml(lead.phone, 'btn-sm') +
        '</div>';
      els.cards.appendChild(card);
    });
  }

  function optionLabel(lead) {
    if (!lead.optionLabel) return null;
    if (lead.optionValue === null || lead.optionValue === undefined) {
      return lead.optionLabel + ': —';
    }
    return lead.optionLabel + ': ' + (lead.optionValue ? 'Sí' : 'No');
  }

  function renderDetail() {
    var lead = state.detail;
    if (!lead) {
      els.detailPanel.hidden = true;
      var appEl = document.querySelector('.app');
      if (appEl) appEl.classList.remove('detail-open');
      els.detailBody.innerHTML =
        '<p class="detail-placeholder">Selecciona un lead para ver el detalle.</p>';
      els.detailBadges.innerHTML = '';
      return;
    }

    els.detailPanel.hidden = false;
    var appOpen = document.querySelector('.app');
    if (appOpen) appOpen.classList.add('detail-open');
    els.detailBadges.innerHTML = priorityBadge(lead.priority) + statusBadge(lead.status);

    var assignee =
      lead.assignment && (lead.assignment.assigneeName || lead.assignment.assigneeId)
        ? lead.assignment.assigneeName || lead.assignment.assigneeId
        : 'Sin asignar';

    var statusOptions = STATUS_OPTIONS.map(function (s) {
      return (
        '<option value="' +
        H.escapeHtml(s) +
        '"' +
        (s === lead.status ? ' selected' : '') +
        '>' +
        H.escapeHtml(H.statusLabel(s)) +
        '</option>'
      );
    }).join('');

    var eventsHtml =
      state.events.length === 0
        ? '<p class="lead-card-meta">Sin eventos aún.</p>'
        : '<ul class="events-list">' +
          state.events
            .slice()
            .reverse()
            .map(function (ev) {
              return (
                '<li><div class="event-type">' +
                H.escapeHtml(ev.type) +
                '</div><div class="event-meta">' +
                H.escapeHtml(H.formatDateTime(ev.at)) +
                ' · ' +
                H.escapeHtml(ev.actor || 'sistema') +
                '</div></li>'
              );
            })
            .join('') +
          '</ul>';

    var opt = optionLabel(lead);

    els.detailBody.innerHTML =
      '<h3 class="detail-title">' +
      H.escapeHtml(lead.name || 'Cliente WhatsApp') +
      '</h3>' +
      '<p class="detail-sub">' +
      H.escapeHtml(H.formatPhoneDisplay(lead.phone)) +
      '</p>' +
      '<div class="detail-actions">' +
      waButtonHtml(lead.phone) +
      '<button class="btn btn-secondary" type="button" data-action="claim">Tomar lead</button>' +
      '</div>' +
      '<div class="detail-grid">' +
      '<div class="meta-item"><span>Producto</span><strong>' +
      H.escapeHtml(lead.product || '—') +
      '</strong></div>' +
      '<div class="meta-item"><span>Vehículo</span><strong>' +
      H.escapeHtml(H.vehicleLabel(lead)) +
      '</strong></div>' +
      '<div class="meta-item"><span>Asignado</span><strong>' +
      H.escapeHtml(assignee) +
      '</strong></div>' +
      '<div class="meta-item"><span>Llegada</span><strong>' +
      H.escapeHtml(H.formatDateTime(lead.createdAt)) +
      '</strong></div>' +
      (opt
        ? '<div class="meta-item"><span>Opción</span><strong>' +
          H.escapeHtml(opt) +
          '</strong></div>'
        : '') +
      (lead.needsHumanHandoff
        ? '<div class="meta-item full"><span>Handoff</span><strong>' +
          H.escapeHtml(lead.handoffReason || 'Requiere asesor') +
          '</strong></div>'
        : '') +
      '<div class="meta-item full"><div class="recommendation"><span>Recomendación</span><strong>' +
      H.escapeHtml(lead.recommendation || '—') +
      '</strong></div></div>' +
      (lead.notes
        ? '<div class="meta-item full"><span>Notas</span><strong>' +
          H.escapeHtml(lead.notes) +
          '</strong></div>'
        : '') +
      (lead.recontact && lead.recontact.dueAt
        ? '<div class="meta-item full"><span>Recontacto</span><strong>' +
          H.escapeHtml(H.formatDateTime(lead.recontact.dueAt)) +
          (lead.recontact.note ? ' · ' + H.escapeHtml(lead.recontact.note) : '') +
          '</strong></div>'
        : '') +
      '</div>' +
      '<div class="detail-block">' +
      '<h4>Cambiar estado</h4>' +
      '<div class="form-row">' +
      '<select id="status-select">' +
      statusOptions +
      '</select>' +
      '<button class="btn btn-primary" type="button" data-action="status">Guardar</button>' +
      '</div></div>' +
      '<div class="detail-block">' +
      '<h4>Nota</h4>' +
      '<div class="form-row" style="flex-direction:column">' +
      '<textarea id="note-input" placeholder="Agregar nota interna…"></textarea>' +
      '<button class="btn btn-secondary" type="button" data-action="note">Guardar nota</button>' +
      '</div></div>' +
      '<div class="detail-block">' +
      '<h4>Recontacto</h4>' +
      '<div class="form-row">' +
      '<button class="btn btn-secondary" type="button" data-action="recontact">Programar recontacto</button>' +
      '<button class="btn btn-ghost" type="button" data-action="recontact-done">Marcar hecho</button>' +
      '</div></div>' +
      '<div class="detail-block"><h4>Eventos</h4>' +
      eventsHtml +
      '</div>';
  }

  async function apiJson(url, options) {
    var res = await fetch(url, options);
    var data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    if (!res.ok) {
      var msg =
        (data && (data.error || data.message)) ||
        'Error HTTP ' + res.status;
      var err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function loadLeads(forceRender) {
    try {
      var res = await fetch('/api/leads');
      if (!res.ok) throw new Error('No se pudieron cargar los leads');
      var data = await res.json();
      state.leads = data.items || [];

      var fingerprint = JSON.stringify(
        state.leads.map(function (c) {
          return [c.id, c.status, c.priority, c.recommendation, c.updatedAt || c.createdAt];
        }),
      );

      if (forceRender || fingerprint !== state.lastFingerprint) {
        state.lastFingerprint = fingerprint;
        updateStats();
        await refreshFilteredList();
        if (state.selectedId && state.detail) {
          var still = state.leads.find(function (l) {
            return l.id === state.selectedId;
          });
          if (still) {
            state.detail = Object.assign({}, state.detail, still);
            renderDetail();
          }
        }
      }

      els.livePill.textContent = 'En vivo';
      els.livePill.classList.remove('pill-error');
    } catch (err) {
      console.error(err);
      els.livePill.textContent = 'Sin conexión';
      els.livePill.classList.add('pill-error');
    }
  }

  async function openLead(id) {
    state.selectedId = id;
    renderList();
    try {
      var [lead, eventsPayload] = await Promise.all([
        apiJson('/api/leads/' + encodeURIComponent(id)),
        apiJson('/api/leads/' + encodeURIComponent(id) + '/events'),
      ]);
      state.detail = lead;
      state.events = (eventsPayload && eventsPayload.items) || [];
      renderDetail();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'No se pudo abrir el lead', true);
    }
  }

  function closeDetail() {
    state.selectedId = null;
    state.detail = null;
    state.events = [];
    renderList();
    renderDetail();
  }

  async function withBusy(fn) {
    if (state.busy) return;
    state.busy = true;
    try {
      await fn();
    } finally {
      state.busy = false;
    }
  }

  async function changeStatus() {
    if (!state.selectedId) return;
    var select = document.getElementById('status-select');
    if (!select) return;
    var status = select.value;
    await withBusy(async function () {
      try {
        var headers = Object.assign(
          { 'Content-Type': 'application/json' },
          actorHeaders(),
        );
        var updated = await apiJson('/api/leads/' + encodeURIComponent(state.selectedId) + '/status', {
          method: 'PATCH',
          headers: headers,
          body: JSON.stringify({ status: status }),
        });
        state.detail = updated;
        showToast('Estado actualizado');
        await loadLeads(true);
        await openLead(state.selectedId);
      } catch (err) {
        showToast(err.message || 'No se pudo cambiar el estado', true);
      }
    });
  }

  async function claimLead() {
    if (!state.selectedId) return;
    await withBusy(async function () {
      try {
        var updated = await apiJson(
          '/api/leads/' + encodeURIComponent(state.selectedId) + '/claim',
          {
            method: 'POST',
            headers: actorHeaders(),
          },
        );
        state.detail = updated;
        showToast('Lead tomado');
        await loadLeads(true);
        await openLead(state.selectedId);
      } catch (err) {
        showToast(err.message || 'No se pudo tomar el lead', true);
      }
    });
  }

  async function addNote() {
    if (!state.selectedId) return;
    var input = document.getElementById('note-input');
    var note = (input && input.value ? input.value : '').trim();
    if (!note) {
      showToast('Escribe una nota', true);
      return;
    }
    await withBusy(async function () {
      try {
        var headers = Object.assign(
          { 'Content-Type': 'application/json' },
          actorHeaders(),
        );
        var updated = await apiJson(
          '/api/leads/' + encodeURIComponent(state.selectedId) + '/notes',
          {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ note: note }),
          },
        );
        state.detail = updated;
        showToast('Nota guardada');
        await openLead(state.selectedId);
      } catch (err) {
        showToast(err.message || 'No se pudo guardar la nota', true);
      }
    });
  }

  async function scheduleRecontact() {
    if (!state.selectedId) return;
    await withBusy(async function () {
      try {
        var due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        var headers = Object.assign(
          { 'Content-Type': 'application/json' },
          actorHeaders(),
        );
        var updated = await apiJson(
          '/api/leads/' + encodeURIComponent(state.selectedId) + '/recontact',
          {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ dueAt: due, note: 'Recontacto desde panel' }),
          },
        );
        state.detail = updated;
        showToast('Recontacto programado (+24h)');
        await loadLeads(true);
        await openLead(state.selectedId);
      } catch (err) {
        showToast(err.message || 'No se pudo programar recontacto', true);
      }
    });
  }

  async function completeRecontact() {
    if (!state.selectedId) return;
    await withBusy(async function () {
      try {
        var updated = await apiJson(
          '/api/leads/' + encodeURIComponent(state.selectedId) + '/recontact/done',
          {
            method: 'POST',
            headers: actorHeaders(),
          },
        );
        state.detail = updated;
        showToast('Recontacto marcado hecho');
        await loadLeads(true);
        await openLead(state.selectedId);
      } catch (err) {
        showToast(err.message || 'No se pudo completar recontacto', true);
      }
    });
  }

  function onListClick(event) {
    if (event.target.closest('[data-stop]')) return;
    var row = event.target.closest('[data-id]');
    if (!row) return;
    openLead(row.dataset.id);
  }

  els.tbody.addEventListener('click', onListClick);
  els.cards.addEventListener('click', onListClick);

  els.detailClose.addEventListener('click', closeDetail);

  els.detailBody.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'status') changeStatus();
    else if (action === 'claim') claimLead();
    else if (action === 'note') addNote();
    else if (action === 'recontact') scheduleRecontact();
    else if (action === 'recontact-done') completeRecontact();
  });

  document.querySelectorAll('[data-filter-status]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter-status]').forEach(function (b) {
        b.classList.remove('is-active');
      });
      btn.classList.add('is-active');
      state.statusFilter = btn.dataset.filterStatus || 'all';
      refreshFilteredList().catch(function (err) {
        console.error(err);
        showToast('Error al filtrar', true);
      });
    });
  });

  document.querySelectorAll('[data-filter-priority]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('[data-filter-priority]').forEach(function (b) {
        b.classList.remove('is-active');
      });
      btn.classList.add('is-active');
      state.priorityFilter = btn.dataset.filterPriority || 'all';
      refreshFilteredList().catch(function (err) {
        console.error(err);
        showToast('Error al filtrar', true);
      });
    });
  });

  els.advisorName.addEventListener('change', saveAdvisor);
  els.advisorName.addEventListener('blur', saveAdvisor);

  els.todayLabel.textContent = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  loadAdvisor();
  renderDetail();
  loadLeads(true);
  setInterval(function () {
    loadLeads(false);
  }, 4000);
})();
