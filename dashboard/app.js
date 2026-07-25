(function () {
  let clients = [];
  let activeFilter = 'all';
  let lastFingerprint = '';

  const grid = document.getElementById('clients-grid');
  const emptyState = document.getElementById('empty-state');
  const todayLabel = document.getElementById('today-label');
  const livePill = document.getElementById('live-pill');

  const statusLabels = {
    nuevo: 'Nuevo',
    cotizado: 'Cotizado',
    vendido: 'Vendido',
    perdido: 'Perdido',
  };

  function isToday(iso) {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleTimeString('es-CO', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatTodayLabel() {
    return new Date().toLocaleDateString('es-CO', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function updateStats() {
    const todayCount = clients.filter((c) => isToday(c.arrivedAt)).length;
    const pending = clients.filter((c) => c.status === 'nuevo').length;
    const sold = clients.filter((c) => c.status === 'vendido').length;
    const lost = clients.filter((c) => c.status === 'perdido').length;

    animateValue('stat-today', todayCount);
    animateValue('stat-pending', pending);
    animateValue('stat-sold', sold);
    animateValue('stat-lost', lost);
  }

  function animateValue(id, next) {
    const el = document.getElementById(id);
    if (!el) return;
    const current = Number(el.textContent) || 0;
    if (current === next) {
      el.textContent = String(next);
      return;
    }
    const start = performance.now();
    const duration = 280;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      el.textContent = String(Math.round(current + (next - current) * t));
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function filteredClients() {
    if (activeFilter === 'all') return clients;
    return clients.filter((c) => c.status === activeFilter);
  }

  function vehicleLabel(client) {
    return [client.vehicleBrand, client.vehicleModel].filter(Boolean).join(' ').trim() || 'Sin vehículo';
  }

  function renderClients() {
    const list = filteredClients().sort(
      (a, b) => new Date(b.arrivedAt) - new Date(a.arrivedAt),
    );

    grid.innerHTML = '';
    emptyState.hidden = list.length > 0;

    list.forEach((client, index) => {
      const card = document.createElement('article');
      card.className = 'client-card';
      card.style.animationDelay = `${Math.min(index * 0.04, 0.24)}s`;
      card.dataset.id = client.id;

      const waUrl = `https://wa.me/${String(client.phone).replace(/\D/g, '')}`;

      card.innerHTML = `
        <div class="client-card-head">
          <div>
            <h3 class="client-name">${escapeHtml(client.name || 'Cliente WhatsApp')}</h3>
            <p class="client-phone">${escapeHtml(formatPhone(client.phone))} · ${escapeHtml(client.product)}</p>
          </div>
          <span class="status-badge status-${client.status}">${statusLabels[client.status] || client.status}</span>
        </div>

        <div class="client-meta">
          <div class="meta-item">
            <span>Marca</span>
            <strong>${escapeHtml(client.vehicleBrand || '—')}</strong>
          </div>
          <div class="meta-item">
            <span>Modelo</span>
            <strong>${escapeHtml(client.vehicleModel || '—')}</strong>
          </div>
          <div class="meta-item">
            <span>Año</span>
            <strong>${escapeHtml(client.year || '—')}</strong>
          </div>
          <div class="meta-item">
            <span>${escapeHtml(client.optionLabel || 'Detalle')}</span>
            <strong>${
              client.optionValue === null || client.optionValue === undefined
                ? '—'
                : client.optionValue
                  ? 'Sí'
                  : 'No'
            }</strong>
          </div>
          <div class="meta-item">
            <span>Vehículo</span>
            <strong>${escapeHtml(vehicleLabel(client))}</strong>
          </div>
          <div class="meta-item">
            <span>Hora de llegada</span>
            <strong>${formatTime(client.arrivedAt)}</strong>
          </div>
          <div class="meta-item full">
            <div class="recommendation">
              <span>Recomendación</span>
              <strong>${escapeHtml(client.recommendation)}</strong>
            </div>
          </div>
        </div>

        <div class="client-actions">
          <a class="btn btn-whatsapp" href="${waUrl}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
          <button class="btn btn-quote" type="button" data-action="cotizado">Cotizado</button>
          <button class="btn btn-sold" type="button" data-action="vendido">Vendido</button>
          <button class="btn btn-lost" type="button" data-action="perdido">Perdido</button>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  function formatPhone(phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('57') && digits.length >= 12) {
      return `+57 ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }
    return phone;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function setStatus(clientId, status) {
    try {
      const res = await fetch(`/api/leads/${clientId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('No se pudo actualizar el estado');
      await loadLeads(true);
    } catch (err) {
      console.error(err);
      livePill.textContent = 'Error al actualizar';
    }
  }

  function mapLead(item) {
    return {
      id: item.id,
      name: item.name,
      phone: item.phone,
      product: item.product,
      vehicleBrand: item.vehicleBrand,
      vehicleModel: item.vehicleModel,
      year: item.year,
      optionLabel: item.optionLabel,
      optionValue: item.optionValue,
      recommendation: item.recommendation,
      arrivedAt: item.createdAt,
      status: item.status,
    };
  }

  async function loadLeads(forceRender) {
    try {
      const res = await fetch('/api/leads');
      if (!res.ok) throw new Error('No se pudieron cargar los leads');
      const data = await res.json();
      const next = (data.items || []).map(mapLead);
      const fingerprint = JSON.stringify(
        next.map((c) => [c.id, c.status, c.recommendation, c.arrivedAt]),
      );

      if (forceRender || fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        clients = next;
        updateStats();
        renderClients();
      }

      livePill.textContent = 'En vivo';
      livePill.classList.remove('pill-error');
    } catch (err) {
      console.error(err);
      livePill.textContent = 'Sin conexión';
      livePill.classList.add('pill-error');
    }
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const card = button.closest('.client-card');
    if (!card) return;
    setStatus(card.dataset.id, button.dataset.action);
  });

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeFilter = btn.dataset.filter || 'all';
      renderClients();
    });
  });

  todayLabel.textContent = formatTodayLabel();
  loadLeads(true);
  setInterval(() => loadLeads(false), 3000);
})();
