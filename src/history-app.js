const state = {
  orders: [],
  filteredOrders: [],
};

const statusTone = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  processing: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const el = {
  searchInput: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  sortField: document.getElementById('sortField'),
  sortDirection: document.getElementById('sortDirection'),
  reloadButton: document.getElementById('reloadButton'),
  statsCards: document.getElementById('statsCards'),
  tableWrap: document.getElementById('tableWrap'),
  tableBody: document.getElementById('historyTableBody'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  resultsLabel: document.getElementById('resultsLabel'),
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function formatMoney(value, currency = 'UAH') {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency', currency: currency || 'UAH', maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toFixed(2) + ' ' + (currency || 'UAH');
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getNestedValue(object, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], object);
}

function compactText(value, max = 120) {
  const str = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!str) return '—';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function getCrmOrderId(order) {
  const crm = order.crm_order || {};
  return crm.id || crm.order_id || crm.uuid || crm.external_id || crm.source_uuid || null;
}

function getCrmSummary(order) {
  const crm = order.crm_order || {};
  const summary = [];
  if (crm.id) summary.push('ID ' + crm.id);
  if (crm.status) summary.push('status: ' + crm.status);
  if (crm.state) summary.push('state: ' + crm.state);
  if (crm.message) summary.push(compactText(crm.message, 48));
  if (summary.length) return summary.join(' · ');

  const lastHistory = [...(order.status_history || [])].reverse().find((entry) => entry.crm_response || entry.error_message);
  if (lastHistory?.error_message) return compactText(lastHistory.error_message, 64);
  if (lastHistory?.crm_response?.message) return compactText(lastHistory.crm_response.message, 64);
  return order.crm_order ? compactText(JSON.stringify(order.crm_order), 64) : 'Ще не було відповіді';
}

function getLatestError(order) {
  const reversed = [...(order.status_history || [])].reverse();
  const failedEntry = reversed.find((entry) => entry.error_message || entry.status === 'failed');
  if (!failedEntry) return null;
  return failedEntry.error_message || failedEntry.crm_response?.message || 'Помилка синхронізації';
}

function collectSearchText(order) {
  const site = order.site_order || {};
  const crm = order.crm_order || {};
  const history = (order.status_history || []).flatMap((entry) => [
    entry.status, entry.error_message, entry.crm_response?.message, entry.crm_response?.id, entry.crm_response?.status,
  ]);
  const items = (site.items || []).flatMap((item) => [item.name, item.category, item.description]);

  return [
    order._rowid,
    order.current_status,
    site.externalOrderId,
    site.externalCustomerId,
    site.firstName,
    site.lastName,
    site.email,
    site.phone,
    site.status,
    site.statusDescription,
    site.paymentMethod,
    site.deliveryMethod,
    site.deliveryAddress,
    site.additionalInfo,
    crm.id,
    crm.status,
    crm.state,
    crm.message,
    crm.source_uuid,
    ...items,
    ...history,
  ].filter(Boolean).join(' ').toLowerCase();
}

function renderStats() {
  const orders = state.filteredOrders.length ? state.filteredOrders : state.orders;
  const byStatus = orders.reduce((acc, order) => {
    acc[order.current_status] = (acc[order.current_status] || 0) + 1;
    return acc;
  }, {});

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.site_order?.totalCost || 0), 0);
  const failed = byStatus.failed || 0;
  const completed = byStatus.completed || 0;

  const cards = [
    { label: 'У записів', value: String(orders.length), hint: 'після фільтрів' },
    { label: 'Completed', value: String(completed), hint: 'успішні синки' },
    { label: 'Failed', value: String(failed), hint: 'є що дебажити' },
    { label: 'Сума', value: formatMoney(totalRevenue, orders[0]?.site_order?.currency || 'UAH'), hint: 'по сайту' },
  ];

  el.statsCards.innerHTML = cards.map((card) => `
    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(card.label)}</div>
      <div class="mt-2 text-2xl font-semibold text-white">${escapeHtml(card.value)}</div>
      <div class="mt-1 text-xs text-slate-500">${escapeHtml(card.hint)}</div>
    </div>
  `).join('');
}

function renderTable() {
  const rows = state.filteredOrders;
  el.resultsLabel.textContent = `Показано ${rows.length} із ${state.orders.length} записів`;

  if (!rows.length) {
    el.tableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-10 text-center text-slate-400">Нічого не знайдено. Спробуй інші фільтри або пошук.</td></tr>';
    renderStats();
    return;
  }

  el.tableBody.innerHTML = rows.map((order, index) => {
    const site = order.site_order || {};
    const crmId = getCrmOrderId(order);
    const latestError = getLatestError(order);
    const itemNames = (site.items || []).map((item) => item.name).filter(Boolean);
    const itemPreview = itemNames.length ? itemNames.slice(0, 2).join(', ') : '—';
    const historyRows = (order.status_history || []).map((entry) => `
      <tr class="border-b border-slate-800/60 last:border-b-0">
        <td class="px-3 py-2"><span class="rounded-full border px-2 py-1 text-xs ${statusTone[entry.status] || statusTone.unknown}">${escapeHtml(entry.status)}</span></td>
        <td class="px-3 py-2 text-slate-300">${escapeHtml(formatDate(entry.date))}</td>
        <td class="px-3 py-2 text-slate-400">${escapeHtml(compactText(entry.error_message || entry.crm_response?.message || entry.crm_response?.status || '—', 120))}</td>
        <td class="px-3 py-2 text-slate-400">${escapeHtml(entry.retry_count ?? '—')}</td>
      </tr>
    `).join('');

    const itemsRows = (site.items || []).map((item) => `
      <tr>
        <td class="px-3 py-2 text-slate-200">${escapeHtml(item.name || '—')}</td>
        <td class="px-3 py-2 text-slate-400">${escapeHtml(item.category || '—')}</td>
        <td class="px-3 py-2 text-slate-300">${escapeHtml(item.quantity ?? '—')}</td>
        <td class="px-3 py-2 text-slate-300">${escapeHtml(formatMoney(item.cost, site.currency || 'UAH'))}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="px-3 py-3 text-center text-slate-500">Немає товарів</td></tr>';

    const crmFields = Object.entries(order.crm_order || {}).slice(0, 12).map(([key, value]) => `
      <div class="rounded-lg bg-slate-950/70 px-3 py-2">
        <div class="text-xs uppercase tracking-wide text-slate-500">${escapeHtml(key)}</div>
        <div class="mt-1 text-slate-200 break-words">${escapeHtml(typeof value === 'object' ? compactText(JSON.stringify(value), 120) : value)}</div>
      </div>
    `).join('') || '<div class="text-slate-500">KeyCRM ще нічого не повернув.</div>';

    return `
      <tr class="cursor-pointer transition hover:bg-slate-900/60" data-expand-row="row-${index}">
        <td class="px-4 py-4 align-top">
          <div class="font-semibold text-white">#${escapeHtml(site.externalOrderId || order._rowid)}</div>
          <div class="mt-1 text-xs text-slate-500 mono">rowid: ${escapeHtml(order._rowid)}</div>
          <div class="mt-2 text-xs text-slate-400">${escapeHtml(formatDate(site.date))}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-slate-100">${escapeHtml([site.firstName, site.lastName].filter(Boolean).join(' ') || '—')}</div>
          <div class="mt-1 text-slate-400">${escapeHtml(site.phone || '—')}</div>
          <div class="mt-1 text-xs text-slate-500">${escapeHtml(site.email || '—')}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="text-slate-200">${escapeHtml(compactText(itemPreview, 48))}</div>
          <div class="mt-1 text-xs text-slate-500">${escapeHtml((site.items || []).length)} позицій</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-slate-100">${escapeHtml(formatMoney(site.totalCost, site.currency || 'UAH'))}</div>
          <div class="mt-1 text-slate-400">${escapeHtml(site.statusDescription || site.status || '—')}</div>
          <div class="mt-1 text-xs text-slate-500">${escapeHtml(site.paymentMethod || '—')} · ${escapeHtml(site.deliveryMethod || '—')}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-slate-100">${escapeHtml(crmId || '—')}</div>
          <div class="mt-1 text-slate-400">${escapeHtml(getCrmSummary(order))}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <span class="rounded-full border px-3 py-1 text-xs font-medium ${statusTone[order.current_status] || statusTone.unknown}">${escapeHtml(order.current_status)}</span>
          ${latestError ? `<div class="mt-2 text-xs text-rose-300">${escapeHtml(compactText(latestError, 80))}</div>` : '<div class="mt-2 text-xs text-slate-500">Без свіжих помилок</div>'}
        </td>
        <td class="px-4 py-4 align-top text-slate-300">${escapeHtml(formatDate(order.updated_at))}</td>
      </tr>
      <tr id="row-${index}" class="hidden bg-slate-900/40">
        <td colspan="7" class="px-4 pb-5 pt-1">
          <div class="grid gap-4 lg:grid-cols-2">
            <section class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 class="text-sm font-semibold text-white">Дані з сайту</h3>
              <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                <div><dt class="text-xs uppercase tracking-wide text-slate-500">Customer ID</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.externalCustomerId || '—')}</dd></div>
                <div><dt class="text-xs uppercase tracking-wide text-slate-500">Статус сайту</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.statusDescription || site.status || '—')}</dd></div>
                <div><dt class="text-xs uppercase tracking-wide text-slate-500">Доставка</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.deliveryAddress || '—')}</dd></div>
                <div><dt class="text-xs uppercase tracking-wide text-slate-500">Додаткова інфо</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.additionalInfo || '—')}</dd></div>
              </dl>
              <div class="mt-4 overflow-hidden rounded-xl border border-slate-800">
                <table class="min-w-full divide-y divide-slate-800 text-sm">
                  <thead class="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th class="px-3 py-2">Товар</th>
                      <th class="px-3 py-2">Категорія</th>
                      <th class="px-3 py-2">К-сть</th>
                      <th class="px-3 py-2">Ціна</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800">${itemsRows}</tbody>
                </table>
              </div>
            </section>

            <section class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 class="text-sm font-semibold text-white">Відповідь KeyCRM + історія статусів</h3>
              <dl class="mt-3 grid gap-3 sm:grid-cols-2">
                <div><dt class="text-xs uppercase tracking-wide text-slate-500">CRM ID</dt><dd class="mt-1 text-slate-200">${escapeHtml(crmId || '—')}</dd></div>
                <div><dt class="text-xs uppercase tracking-wide text-slate-500">Оновлено</dt><dd class="mt-1 text-slate-200">${escapeHtml(formatDate(order.updated_at))}</dd></div>
              </dl>
              <div class="mt-4 overflow-hidden rounded-xl border border-slate-800">
                <table class="min-w-full divide-y divide-slate-800 text-sm">
                  <thead class="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th class="px-3 py-2">Статус</th>
                      <th class="px-3 py-2">Дата</th>
                      <th class="px-3 py-2">Що сталося</th>
                      <th class="px-3 py-2">Retry</th>
                    </tr>
                  </thead>
                  <tbody>${historyRows || '<tr><td colspan="4" class="px-3 py-3 text-center text-slate-500">Історія ще порожня</td></tr>'}</tbody>
                </table>
              </div>
              <div class="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div class="mb-2 text-xs uppercase tracking-wide text-slate-500">Розібрана відповідь KeyCRM</div>
                <div class="grid gap-2 sm:grid-cols-2 text-sm">${crmFields}</div>
              </div>
            </section>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-expand-row]').forEach((row) => {
    row.addEventListener('click', () => {
      const target = document.getElementById(row.getAttribute('data-expand-row'));
      if (target) target.classList.toggle('hidden');
    });
  });

  renderStats();
}

function applyFilters() {
  const search = el.searchInput.value.trim().toLowerCase();
  const status = el.statusFilter.value;
  const sortField = el.sortField.value;
  const sortDirection = el.sortDirection.value;

  const filtered = state.orders.filter((order) => {
    const matchesStatus = status === 'all' || order.current_status === status;
    const matchesSearch = !search || collectSearchText(order).includes(search);
    return matchesStatus && matchesSearch;
  });

  filtered.sort((a, b) => {
    const left = getNestedValue(a, sortField);
    const right = getNestedValue(b, sortField);

    if (left == null && right == null) return 0;
    if (left == null) return 1;
    if (right == null) return -1;

    if (typeof left === 'number' && typeof right === 'number') {
      return sortDirection === 'asc' ? left - right : right - left;
    }

    return sortDirection === 'asc'
      ? String(left).localeCompare(String(right), 'uk')
      : String(right).localeCompare(String(left), 'uk');
  });

  state.filteredOrders = filtered;
  renderTable();
}

async function loadHistory() {
  el.loadingState.classList.remove('hidden');
  el.tableWrap.classList.add('hidden');
  el.errorState.classList.add('hidden');

  try {
    const response = await fetch('/history/data?limit=1000', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error || 'Не вдалося отримати історію');

    state.orders = payload.orders || [];
    state.filteredOrders = [...state.orders];

    el.loadingState.classList.add('hidden');
    el.tableWrap.classList.remove('hidden');
    applyFilters();
  } catch (error) {
    el.loadingState.classList.add('hidden');
    el.errorState.textContent = 'Не вдалося завантажити історію: ' + (error?.message || error);
    el.errorState.classList.remove('hidden');
  }
}

[el.searchInput, el.statusFilter, el.sortField, el.sortDirection].forEach((node) => {
  node.addEventListener('input', applyFilters);
  node.addEventListener('change', applyFilters);
});
el.reloadButton.addEventListener('click', loadHistory);

loadHistory();
