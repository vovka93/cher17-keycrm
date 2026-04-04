const state = {
  orders: [],
  filteredOrders: [],
  pagination: null,
  details: {},
  detailsLoading: {},
};

const statusTone = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  processing: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  delayed: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  fiscalization_webhook_received: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  fiscalization_watch_started: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  fiscalization_watch_exists: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  fiscalization_poll_checked: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  fiscalization_watch_retry: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  fiscalization_moved_to_bas: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  fiscalization_stop_status_changed: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  fiscalization_watch_timeout: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  fiscalization_watch_error: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  fiscalization_skip_done: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  fiscalization_ignored_status: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  unknown: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

const el = {
  searchInput: document.getElementById('searchInput'),
  statusFilter: document.getElementById('statusFilter'),
  sortField: document.getElementById('sortField'),
  sortDirection: document.getElementById('sortDirection'),
  pageSize: document.getElementById('pageSize'),
  clearFiltersButton: document.getElementById('clearFiltersButton'),
  prevPageButton: document.getElementById('prevPageButton'),
  nextPageButton: document.getElementById('nextPageButton'),
  pageIndicator: document.getElementById('pageIndicator'),
  querySummary: document.getElementById('querySummary'),
  resultsChips: document.getElementById('resultsChips'),
  reloadButton: document.getElementById('reloadButton'),
  statsCards: document.getElementById('statsCards'),
  tableWrap: document.getElementById('tableWrap'),
  tableBody: document.getElementById('historyTableBody'),
  loadingState: document.getElementById('loadingState'),
  errorState: document.getElementById('errorState'),
  emptyState: document.getElementById('emptyState'),
  feedbackBanner: document.getElementById('feedbackBanner'),
  resultsLabel: document.getElementById('resultsLabel'),
};

const KYIV_TIME_ZONE = 'Europe/Kyiv';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: KYIV_TIME_ZONE,
  }).format(date);
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

function setFeedback(message = '', tone = 'neutral') {
  if (!el.feedbackBanner) return;
  if (!message) {
    el.feedbackBanner.textContent = '';
    el.feedbackBanner.className = 'hidden mb-4 rounded-xl border px-4 py-3 text-sm';
    return;
  }

  const tones = {
    neutral: 'mb-4 rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-200',
    success: 'mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200',
    error: 'mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200',
  };

  el.feedbackBanner.className = tones[tone] || tones.neutral;
  el.feedbackBanner.textContent = message;
}

function setLoading(isLoading) {
  el.loadingState.classList.toggle('hidden', !isLoading);
  if (el.searchInput) el.searchInput.setAttribute('aria-busy', String(isLoading));
}

function showTable(show) {
  el.tableWrap.classList.toggle('hidden', !show);
}

function showEmpty(show) {
  if (!el.emptyState) return;
  el.emptyState.classList.toggle('hidden', !show);
}

function showError(message = '') {
  if (!message) {
    el.errorState.textContent = '';
    el.errorState.classList.add('hidden');
    return;
  }

  el.errorState.textContent = message;
  el.errorState.classList.remove('hidden');
}

function getNestedValue(object, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], object);
}

function compactText(value, max = 120) {
  const str = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!str) return '—';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function prettifyHistoryStatus(status) {
  const labels = {
    pending: 'очікує',
    processing: 'в роботі',
    completed: 'готово',
    failed: 'помилка',
    delayed: 'відкладено',
    fiscalization_webhook_received: 'webhook отримано',
    fiscalization_watch_started: 'watch запущено',
    fiscalization_watch_exists: 'watch вже існує',
    fiscalization_poll_checked: 'статус перевірено',
    fiscalization_watch_retry: 'заплановано retry',
    fiscalization_moved_to_bas: 'передано в BAS',
    fiscalization_stop_status_changed: 'watch зупинено',
    fiscalization_watch_timeout: 'watch timeout',
    fiscalization_watch_error: 'помилка watch',
    fiscalization_skip_done: 'вже передано',
    fiscalization_ignored_status: 'статус проігноровано',
  };

  return labels[status] || status || 'unknown';
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

  const latest = order.latest_history || {};
  if (latest.error_message) return compactText(latest.error_message, 64);
  if (latest.crm_message) return compactText(latest.crm_message, 64);
  return order.crm_order ? compactText(JSON.stringify(order.crm_order), 64) : 'Ще не було відповіді';
}

function getLatestError(order) {
  const latest = order.latest_history || {};
  return latest.error_message || latest.crm_message || null;
}

function isDelayedLead(order) {
  return Boolean(order.queue_meta?.is_delayed_lead);
}

function getDelayLabel(order) {
  if (!isDelayedLead(order) || !order.queue_meta?.retry_at) return null;
  return `Лід відкладено до ${formatDate(order.queue_meta.retry_at)}`;
}

function getDisplayStatus(order) {
  return isDelayedLead(order) ? 'delayed' : (order.current_status || 'unknown');
}

function getDisplayStatusLabel(order) {
  return prettifyHistoryStatus(getDisplayStatus(order));
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

function getCurrentPage() {
  return Number(el.pageIndicator?.dataset.page || '1');
}

function setCurrentPage(page) {
  if (el.pageIndicator) {
    el.pageIndicator.dataset.page = String(page);
  }
}

function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

function getSortFieldLabel(value) {
  const labels = {
    updated_at: 'оновлено',
    created_at: 'створено',
    'site_order.date': 'дата замовлення',
    'site_order.totalCost': 'сума',
    current_status: 'статус',
    'site_order.externalOrderId': 'site id',
  };

  return labels[value] || value;
}

function renderPagination() {
  const pagination = state.pagination;
  if (!pagination) {
    el.pageIndicator.textContent = 'Без пагінації';
    el.prevPageButton.disabled = true;
    el.nextPageButton.disabled = true;
    el.querySummary.textContent = 'Немає пагінації';
    if (el.resultsChips) el.resultsChips.innerHTML = '';
    return;
  }

  const from = pagination.total_count === 0 ? 0 : ((pagination.current_page - 1) * pagination.per_page) + 1;
  const to = Math.min(pagination.current_page * pagination.per_page, pagination.total_count);

  el.pageIndicator.textContent = `Сторінка ${pagination.current_page} / ${Math.max(pagination.total_pages, 1)}`;
  el.prevPageButton.disabled = !pagination.has_prev;
  el.nextPageButton.disabled = !pagination.has_next;
  setCurrentPage(pagination.current_page);

  const delayedCount = (state.orders || []).filter(isDelayedLead).length;
  const failedCount = (state.orders || []).filter((order) => getDisplayStatus(order) === 'failed').length;
  const searchValue = el.searchInput.value.trim();

  const parts = [`Показано ${from}–${to} з ${pagination.total_count}`];
  if (el.statusFilter.value !== 'all') parts.push(`статус: ${el.statusFilter.value}`);
  if (searchValue) parts.push(`пошук: “${searchValue}”`);
  parts.push(`сортування: ${getSortFieldLabel(el.sortField.value)} · ${el.sortDirection.value === 'desc' ? '↓' : '↑'}`);
  el.querySummary.textContent = parts.join(' · ');

  if (el.resultsChips) {
    const chips = [
      `<span class="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">${escapeHtml(`${from}–${to} із ${pagination.total_count}`)}</span>`,
      `<span class="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">${escapeHtml(`sort: ${getSortFieldLabel(el.sortField.value)}`)}</span>`,
    ];

    if (el.statusFilter.value !== 'all') {
      chips.push(`<span class="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">${escapeHtml(`status: ${el.statusFilter.value}`)}</span>`);
    }
    if (searchValue) {
      chips.push(`<span class="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">${escapeHtml(`пошук: ${compactText(searchValue, 28)}`)}</span>`);
    }
    if (delayedCount) {
      chips.push(`<span class="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/15 px-3 py-1 text-xs text-violet-300">${escapeHtml(`відкладено: ${delayedCount}`)}</span>`);
    }
    if (failedCount) {
      chips.push(`<span class="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/15 px-3 py-1 text-xs text-rose-300">${escapeHtml(`помилки: ${failedCount}`)}</span>`);
    }

    el.resultsChips.innerHTML = chips.join('');
  }
}

function renderStats() {
  const orders = state.filteredOrders.length ? state.filteredOrders : state.orders;
  const byStatus = orders.reduce((acc, order) => {
    const key = getDisplayStatus(order);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const totalRevenue = orders.reduce((sum, order) => sum + Number(order.site_order?.totalCost || 0), 0);
  const failed = byStatus.failed || 0;
  const completed = byStatus.completed || 0;
  const delayed = byStatus.delayed || 0;
  const needsAttention = failed + delayed;
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;

  const cards = [
    { label: 'На сторінці', value: String(orders.length), hint: 'поточна вибірка', tone: 'slate' },
    { label: 'Готово', value: String(completed), hint: 'оброблено без проблем', tone: 'emerald' },
    { label: 'Потребують уваги', value: String(needsAttention), hint: 'помилки + відкладені', tone: 'rose' },
    { label: 'Відкладено', value: String(delayed), hint: 'чекають наступної спроби', tone: 'violet' },
    { label: 'Середній чек', value: formatMoney(avgOrder, orders[0]?.site_order?.currency || 'UAH'), hint: 'по видимій сторінці', tone: 'cyan' },
  ];

  const toneClasses = {
    slate: 'border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950/80',
    emerald: 'border-emerald-500/20 bg-emerald-500/10',
    rose: 'border-rose-500/20 bg-rose-500/10',
    violet: 'border-violet-500/20 bg-violet-500/10',
    cyan: 'border-cyan-500/20 bg-cyan-500/10',
  };

  el.statsCards.innerHTML = cards.map((card) => `
    <section class="rounded-2xl border p-4 ${toneClasses[card.tone] || toneClasses.slate}">
      <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">${escapeHtml(card.label)}</div>
      <div class="mt-2 text-xl font-semibold text-white sm:text-2xl">${escapeHtml(card.value)}</div>
      <div class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(card.hint)}</div>
    </section>
  `).join('');
}

function renderOrderDetail(order) {
  const site = order.site_order || {};
  const crm = order.crm_order || {};
  const crmId = getCrmOrderId(order);
  const delayLabel = getDelayLabel(order);
  const displayStatus = getDisplayStatus(order);
  const displayStatusLabel = getDisplayStatusLabel(order);
  const latestError = getLatestError(order);
  const customerName = [site.firstName, site.lastName].filter(Boolean).join(' ') || 'Клієнт не вказаний';
  const itemPreview = (site.items || []).map((item) => item.name).filter(Boolean).slice(0, 2).join(', ');

  const historyRows = (order.status_history || []).map((entry) => `
    <tr class="border-b border-slate-800/60 last:border-b-0">
      <td class="px-3 py-2"><span class="rounded-full border px-2 py-1 text-xs ${statusTone[entry.status] || statusTone.unknown}">${escapeHtml(prettifyHistoryStatus(entry.status))}</span></td>
      <td class="px-3 py-2 text-slate-300">${escapeHtml(formatDate(entry.date))}</td>
      <td class="px-3 py-2 text-slate-400">${escapeHtml(compactText(entry.error_message || entry.crm_response?.message || entry.crm_response?.status || entry.crm_response?.fiscal_status || '—', 140))}</td>
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

  const crmFields = Object.entries(crm).slice(0, 12).map(([key, value]) => `
    <div class="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-3">
      <div class="text-[11px] uppercase tracking-wide text-slate-500">${escapeHtml(key)}</div>
      <div class="mt-1 text-sm text-slate-200 break-words">${escapeHtml(typeof value === 'object' ? compactText(JSON.stringify(value), 160) : value)}</div>
    </div>
  `).join('') || '<div class="text-sm text-slate-500">KeyCRM ще нічого не повернув.</div>';

  return `
    <div class="space-y-4">
      <section class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div class="text-[11px] uppercase tracking-[0.2em] text-slate-500">Замовлення #${escapeHtml(site.externalOrderId || order._rowid)}</div>
            <div class="mt-1 text-lg font-semibold text-white">${escapeHtml(customerName)}</div>
            <div class="mt-1 text-sm text-slate-400">${escapeHtml(compactText(itemPreview || 'Без товарного опису', 96))}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <span class="rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone[displayStatus] || statusTone.unknown}">${escapeHtml(displayStatusLabel)}</span>
            ${crmId ? `<span class="rounded-full border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-300">CRM ${escapeHtml(crmId)}</span>` : ''}
            ${delayLabel ? `<span class="rounded-full border border-violet-500/30 bg-violet-500/15 px-2.5 py-1 text-[11px] text-violet-300">${escapeHtml(delayLabel)}</span>` : ''}
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div class="text-[11px] uppercase tracking-wide text-slate-500">Сума</div><div class="mt-1 text-sm font-medium text-slate-100">${escapeHtml(formatMoney(site.totalCost, site.currency || 'UAH'))}</div></div>
          <div class="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div class="text-[11px] uppercase tracking-wide text-slate-500">Статус сайту</div><div class="mt-1 text-sm font-medium text-slate-100">${escapeHtml(site.statusDescription || site.status || '—')}</div></div>
          <div class="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div class="text-[11px] uppercase tracking-wide text-slate-500">Оплата / доставка</div><div class="mt-1 text-sm font-medium text-slate-100">${escapeHtml([site.paymentMethod, site.deliveryMethod].filter(Boolean).join(' · ') || '—')}</div></div>
          <div class="rounded-xl border border-slate-800 bg-slate-900/70 p-3"><div class="text-[11px] uppercase tracking-wide text-slate-500">Оновлено</div><div class="mt-1 text-sm font-medium text-slate-100">${escapeHtml(formatDate(order.updated_at))}</div></div>
        </div>
      </section>

      <div class="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <section class="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950/80 to-slate-900/80 p-4">
          <h3 class="text-sm font-semibold text-white">Дані замовлення</h3>
          <dl class="mt-4 grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Customer ID</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.externalCustomerId || '—')}</dd></div>
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Телефон</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.phone || '—')}</dd></div>
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Email</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.email || '—')}</dd></div>
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Дата замовлення</dt><dd class="mt-1 text-slate-200">${escapeHtml(formatDate(site.date))}</dd></div>
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:col-span-2"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Адреса доставки</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.deliveryAddress || '—')}</dd></div>
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:col-span-2"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Коментар / додаткова інформація</dt><dd class="mt-1 text-slate-200">${escapeHtml(site.additionalInfo || '—')}</dd></div>
          </dl>

          <div class="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <div class="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Товари</div>
            <table class="min-w-full divide-y divide-slate-800 text-sm">
              <thead class="bg-slate-900/80 text-left text-[11px] uppercase tracking-wide text-slate-500">
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

        <section class="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-950/80 to-slate-900/80 p-4">
          <h3 class="text-sm font-semibold text-white">CRM і синхронізація</h3>
          <dl class="mt-4 grid gap-3 sm:grid-cols-2">
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><dt class="text-[11px] uppercase tracking-wide text-slate-500">CRM ID</dt><dd class="mt-1 text-slate-200">${escapeHtml(crmId || '—')}</dd></div>
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Source UUID</dt><dd class="mt-1 text-slate-200">${escapeHtml(crm.source_uuid || '—')}</dd></div>
            <div class="rounded-xl border border-slate-800 bg-slate-950/70 p-3 sm:col-span-2"><dt class="text-[11px] uppercase tracking-wide text-slate-500">Останній результат</dt><dd class="mt-1 text-slate-200">${escapeHtml(compactText(latestError || crm.message || 'Ще немає відповіді від CRM', 160))}</dd></div>
          </dl>

          <div class="mt-4 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
            <div class="border-b border-slate-800 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-slate-500">Історія статусів</div>
            <table class="min-w-full divide-y divide-slate-800 text-sm">
              <thead class="bg-slate-900/80 text-left text-[11px] uppercase tracking-wide text-slate-500">
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
        </section>
      </div>

      <section class="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">CRM payload</div>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-sm">${crmFields}</div>
      </section>
    </div>
  `;
}

async function loadOrderDetail(rowid, target) {
  if (state.details[rowid]) {
    target.innerHTML = renderOrderDetail(state.details[rowid]);
    return;
  }

  if (state.detailsLoading[rowid]) return;
  state.detailsLoading[rowid] = true;
  target.innerHTML = '<div class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-6 text-sm text-slate-400">Тягну деталі замовлення…</div>';

  try {
    const response = await fetch(`/history/order/${encodeURIComponent(rowid)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    if (!payload.success || !payload.order) throw new Error(payload.error || 'Не вдалося завантажити деталі');
    state.details[rowid] = payload.order;
    target.innerHTML = renderOrderDetail(payload.order);
  } catch (error) {
    target.innerHTML = `<div class="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-6 text-sm text-rose-200">Не вдалося завантажити деталі: ${escapeHtml(error?.message || error)}</div>`;
  } finally {
    delete state.detailsLoading[rowid];
  }
}

function renderTable() {
  const rows = state.filteredOrders;
  const total = state.pagination?.total_count || state.orders.length;
  el.resultsLabel.textContent = `Показано ${rows.length} записів${total ? ` · усього ${total}` : ''}`;

  if (!rows.length) {
    el.tableBody.innerHTML = '';
    showTable(false);
    showEmpty(true);
    setFeedback('');
    renderStats();
    renderPagination();
    return;
  }

  showEmpty(false);
  showTable(true);
  setFeedback('');

  el.tableBody.innerHTML = rows.map((order, index) => {
    const site = order.site_order || {};
    const crmId = getCrmOrderId(order);
    const latestError = getLatestError(order);
    const displayStatus = getDisplayStatus(order);
    const displayStatusLabel = getDisplayStatusLabel(order);
    const delayLabel = getDelayLabel(order);
    const itemPreview = (site.items_preview || []).length ? site.items_preview.join(', ') : '—';
    const customerName = [site.firstName, site.lastName].filter(Boolean).join(' ') || '—';
    const paymentDelivery = [site.paymentMethod, site.deliveryMethod].filter(Boolean).join(' · ') || '—';
    const itemCount = Number(site.items_count || 0);
    const syncSummary = getCrmSummary(order);

    return `
      <tr class="cursor-pointer transition hover:bg-slate-900/60 focus-within:bg-slate-900/60" data-expand-row="row-${index}" data-rowid="${escapeHtml(order._rowid)}" tabindex="0" aria-expanded="false">
        <td class="px-4 py-4 align-top">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-semibold text-white">#${escapeHtml(site.externalOrderId || order._rowid)}</div>
              <div class="mt-1 text-xs text-slate-500 mono">rowid: ${escapeHtml(order._rowid)}</div>
            </div>
            <span class="rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone[displayStatus] || statusTone.unknown}">${escapeHtml(displayStatusLabel)}</span>
          </div>
          <div class="mt-2 text-xs text-slate-400">${escapeHtml(formatDate(site.date))}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-slate-100">${escapeHtml(customerName)}</div>
          <div class="mt-1 text-slate-300">${escapeHtml(site.phone || '—')}</div>
          <div class="mt-1 text-xs text-slate-500">${escapeHtml(site.email || '—')}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-slate-100">${escapeHtml(formatMoney(site.totalCost, site.currency || 'UAH'))}</div>
          <div class="mt-1 text-slate-300">${escapeHtml(compactText(itemPreview, 72))}</div>
          <div class="mt-1 text-xs text-slate-500">${escapeHtml(`${itemCount} поз. · ${paymentDelivery || 'без логістики'}`)}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-slate-100">${escapeHtml(crmId || 'Ще без CRM ID')}</div>
          <div class="mt-1 text-slate-400">${escapeHtml(compactText(syncSummary, 92))}</div>
          <div class="mt-1 text-xs text-slate-500">${escapeHtml(site.statusDescription || site.status || '—')}</div>
        </td>
        <td class="px-4 py-4 align-top">
          ${delayLabel
            ? `<div class="text-xs text-violet-300">${escapeHtml(compactText(delayLabel, 92))}</div>`
            : latestError
              ? `<div class="text-xs text-rose-300">${escapeHtml(compactText(latestError, 92))}</div>`
              : '<div class="text-xs text-slate-500">Без свіжих проблем</div>'}
        </td>
        <td class="px-4 py-4 align-top text-slate-300">
          <div>${escapeHtml(formatDate(order.updated_at))}</div>
          <div class="mt-1 text-xs text-slate-500">створено: ${escapeHtml(formatDate(order.created_at))}</div>
        </td>
      </tr>
      <tr id="row-${index}" class="hidden bg-slate-900/40">
        <td colspan="6" class="px-4 pb-5 pt-1">
          <div data-detail-target="${escapeHtml(order._rowid)}" class="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-6 text-sm text-slate-500">Тягну деталі замовлення…</div>
        </td>
      </tr>
    `;
  }).join('');

  document.querySelectorAll('[data-expand-row]').forEach((row) => {
    const toggleRow = async () => {
      const target = document.getElementById(row.getAttribute('data-expand-row'));
      if (!target) return;
      const expanded = row.getAttribute('aria-expanded') === 'true';
      target.classList.toggle('hidden', expanded);
      row.setAttribute('aria-expanded', String(!expanded));
      if (expanded) return;

      const rowid = row.getAttribute('data-rowid');
      const detailTarget = target.querySelector('[data-detail-target]');
      if (!rowid || !detailTarget) return;
      await loadOrderDetail(rowid, detailTarget);
    };

    row.addEventListener('click', toggleRow);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleRow();
      }
    });
  });

  renderStats();
  renderPagination();
}

function applyClientSorting() {
  const filtered = [...state.orders];
  const sortField = el.sortField.value;
  const sortDirection = el.sortDirection.value;

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

function focusTableRegion() {
  if (window.innerWidth >= 768) return;
  el.tableWrap?.focus?.();
}

async function loadHistory(page = 1) {
  setLoading(true);
  showTable(false);
  showEmpty(false);
  showError();
  setFeedback('');

  try {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', el.pageSize.value || '25');
    if (el.statusFilter.value !== 'all') params.set('status', el.statusFilter.value);
    const search = el.searchInput.value.trim();
    if (search) params.set('search', search);

    const response = await fetch(`/history/data?${params.toString()}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const payload = await response.json();
    if (!payload.success) throw new Error(payload.error || 'Не вдалося отримати історію');

    state.orders = payload.orders || [];
    state.pagination = payload.pagination || null;
    state.filteredOrders = [...state.orders];

    setLoading(false);
    applyClientSorting();
  } catch (error) {
    setLoading(false);
    showTable(false);
    showEmpty(false);
    const message = 'Не вдалося завантажити історію: ' + (error?.message || error);
    showError(message);
    setFeedback('Список не оновився. Перевір бекенд або спробуй ще раз.', 'error');
  }
}

const debouncedReload = debounce(() => loadHistory(1), 300);

el.searchInput.addEventListener('input', debouncedReload);
el.statusFilter.addEventListener('change', () => loadHistory(1));
el.pageSize.addEventListener('change', () => loadHistory(1));
[el.sortField, el.sortDirection].forEach((node) => {
  node.addEventListener('change', () => {
    applyClientSorting();
  });
});
el.prevPageButton.addEventListener('click', async () => {
  await loadHistory(Math.max(1, getCurrentPage() - 1));
  focusTableRegion();
});
el.nextPageButton.addEventListener('click', async () => {
  await loadHistory(getCurrentPage() + 1);
  focusTableRegion();
});
el.reloadButton.addEventListener('click', () => loadHistory(getCurrentPage()));
el.clearFiltersButton?.addEventListener('click', () => {
  el.searchInput.value = '';
  el.statusFilter.value = 'all';
  el.sortField.value = 'updated_at';
  el.sortDirection.value = 'desc';
  el.pageSize.value = '25';
  loadHistory(1);
});

loadHistory(1);
