const state = {
  orders: [],
  filteredOrders: [],
  pagination: null,
  details: {},
  detailsLoading: {},
};

const statusTone = {
  pending: 'bg-[color:color-mix(in_oklch,var(--chart-4)_12%,white_88%)] text-[color:color-mix(in_oklch,var(--chart-4)_78%,black_22%)] border-[color:color-mix(in_oklch,var(--chart-4)_24%,white_76%)]',
  processing: 'bg-[color:color-mix(in_oklch,var(--chart-2)_12%,white_88%)] text-[color:color-mix(in_oklch,var(--chart-2)_82%,black_18%)] border-[color:color-mix(in_oklch,var(--chart-2)_24%,white_76%)]',
  completed: 'bg-[color:color-mix(in_oklch,var(--chart-2)_10%,white_90%)] text-[color:color-mix(in_oklch,var(--chart-2)_86%,black_14%)] border-[color:color-mix(in_oklch,var(--chart-2)_22%,white_78%)]',
  failed: 'bg-[color:color-mix(in_oklch,var(--destructive)_10%,white_90%)] text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)] border-[color:color-mix(in_oklch,var(--destructive)_22%,white_78%)]',
  delayed: 'bg-[color:color-mix(in_oklch,var(--primary)_10%,white_90%)] text-[var(--primary)] border-[color:color-mix(in_oklch,var(--primary)_20%,white_80%)]',
  fiscalization_webhook_received: 'bg-[color:color-mix(in_oklch,var(--chart-1)_10%,white_90%)] text-[var(--primary)] border-[color:color-mix(in_oklch,var(--chart-1)_18%,white_82%)]',
  fiscalization_watch_started: 'bg-[color:color-mix(in_oklch,var(--chart-3)_10%,white_90%)] text-[color:color-mix(in_oklch,var(--chart-3)_72%,black_28%)] border-[color:color-mix(in_oklch,var(--chart-3)_18%,white_82%)]',
  fiscalization_watch_exists: 'bg-[color:color-mix(in_oklch,var(--chart-3)_10%,white_90%)] text-[color:color-mix(in_oklch,var(--chart-3)_72%,black_28%)] border-[color:color-mix(in_oklch,var(--chart-3)_18%,white_82%)]',
  fiscalization_poll_checked: 'bg-[color:color-mix(in_oklch,var(--chart-1)_10%,white_90%)] text-[var(--primary)] border-[color:color-mix(in_oklch,var(--chart-1)_18%,white_82%)]',
  fiscalization_watch_retry: 'bg-[color:color-mix(in_oklch,var(--chart-4)_12%,white_88%)] text-[color:color-mix(in_oklch,var(--chart-4)_78%,black_22%)] border-[color:color-mix(in_oklch,var(--chart-4)_24%,white_76%)]',
  fiscalization_moved_to_bas: 'bg-[color:color-mix(in_oklch,var(--chart-2)_10%,white_90%)] text-[color:color-mix(in_oklch,var(--chart-2)_86%,black_14%)] border-[color:color-mix(in_oklch,var(--chart-2)_22%,white_78%)]',
  fiscalization_stop_status_changed: 'bg-[color:color-mix(in_oklch,var(--muted)_84%,white_16%)] text-[var(--muted-foreground)] border-[var(--border)]',
  fiscalization_watch_timeout: 'bg-[color:color-mix(in_oklch,var(--destructive)_10%,white_90%)] text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)] border-[color:color-mix(in_oklch,var(--destructive)_22%,white_78%)]',
  fiscalization_watch_error: 'bg-[color:color-mix(in_oklch,var(--destructive)_10%,white_90%)] text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)] border-[color:color-mix(in_oklch,var(--destructive)_22%,white_78%)]',
  fiscalization_skip_done: 'bg-[color:color-mix(in_oklch,var(--muted)_84%,white_16%)] text-[var(--muted-foreground)] border-[var(--border)]',
  fiscalization_ignored_status: 'bg-[color:color-mix(in_oklch,var(--muted)_84%,white_16%)] text-[var(--muted-foreground)] border-[var(--border)]',
  unknown: 'bg-[color:color-mix(in_oklch,var(--muted)_84%,white_16%)] text-[var(--muted-foreground)] border-[var(--border)]',
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
    neutral: 'mb-4 rounded-[var(--radius)] border border-[var(--border)] bg-[color:color-mix(in_oklch,var(--muted)_72%,white_28%)] px-4 py-3 text-sm text-[var(--foreground)]',
    success: 'mb-4 rounded-[var(--radius)] border border-[color:color-mix(in_oklch,var(--chart-2)_22%,white_78%)] bg-[color:color-mix(in_oklch,var(--chart-2)_10%,white_90%)] px-4 py-3 text-sm text-[color:color-mix(in_oklch,var(--chart-2)_86%,black_14%)]',
    error: 'mb-4 rounded-[var(--radius)] border border-[color:color-mix(in_oklch,var(--destructive)_22%,white_78%)] bg-[color:color-mix(in_oklch,var(--destructive)_10%,white_90%)] px-4 py-3 text-sm text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)]',
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
      `<span class="history-pill inline-flex items-center rounded-full px-3 py-1 text-xs">${escapeHtml(`${from}–${to} із ${pagination.total_count}`)}</span>`,
      `<span class="history-pill inline-flex items-center rounded-full px-3 py-1 text-xs">${escapeHtml(`sort: ${getSortFieldLabel(el.sortField.value)}`)}</span>`,
    ];

    if (el.statusFilter.value !== 'all') {
      chips.push(`<span class="inline-flex items-center rounded-full border border-[color:color-mix(in_oklch,var(--primary)_20%,white_80%)] bg-[color:color-mix(in_oklch,var(--primary)_10%,white_90%)] px-3 py-1 text-xs text-[var(--primary)]">${escapeHtml(`status: ${el.statusFilter.value}`)}</span>`);
    }
    if (searchValue) {
      chips.push(`<span class="history-pill inline-flex items-center rounded-full px-3 py-1 text-xs">${escapeHtml(`пошук: ${compactText(searchValue, 28)}`)}</span>`);
    }
    if (delayedCount) {
      chips.push(`<span class="inline-flex items-center rounded-full border border-[color:color-mix(in_oklch,var(--primary)_20%,white_80%)] bg-[color:color-mix(in_oklch,var(--primary)_10%,white_90%)] px-3 py-1 text-xs text-[var(--primary)]">${escapeHtml(`відкладено: ${delayedCount}`)}</span>`);
    }
    if (failedCount) {
      chips.push(`<span class="inline-flex items-center rounded-full border border-[color:color-mix(in_oklch,var(--destructive)_22%,white_78%)] bg-[color:color-mix(in_oklch,var(--destructive)_10%,white_90%)] px-3 py-1 text-xs text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)]">${escapeHtml(`помилки: ${failedCount}`)}</span>`);
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
    slate: 'border-[var(--border)] bg-[color:color-mix(in_oklch,var(--card)_96%,white_4%)]',
    emerald: 'border-[color:color-mix(in_oklch,var(--chart-2)_22%,white_78%)] bg-[color:color-mix(in_oklch,var(--chart-2)_10%,white_90%)]',
    rose: 'border-[color:color-mix(in_oklch,var(--destructive)_22%,white_78%)] bg-[color:color-mix(in_oklch,var(--destructive)_10%,white_90%)]',
    violet: 'border-[color:color-mix(in_oklch,var(--primary)_20%,white_80%)] bg-[color:color-mix(in_oklch,var(--primary)_10%,white_90%)]',
    cyan: 'border-[color:color-mix(in_oklch,var(--accent)_40%,white_60%)] bg-[color:color-mix(in_oklch,var(--accent)_30%,white_70%)]',
  };

  el.statsCards.innerHTML = cards.map((card) => `
    <section class="rounded-[var(--radius)] border p-4 ${toneClasses[card.tone] || toneClasses.slate}">
      <div class="text-[11px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">${escapeHtml(card.label)}</div>
      <div class="mt-2 text-xl font-semibold text-[var(--foreground)] sm:text-2xl">${escapeHtml(card.value)}</div>
      <div class="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">${escapeHtml(card.hint)}</div>
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

  const historyRows = (order.status_history || []).map((entry) => `
    <tr class="border-b last:border-b-0">
      <td class="w-44 px-3 py-2 align-top"><span class="inline-flex rounded-full border px-2 py-1 text-xs ${statusTone[entry.status] || statusTone.unknown}">${escapeHtml(prettifyHistoryStatus(entry.status))}</span></td>
      <td class="px-3 py-2 align-top text-[var(--muted-foreground)]">${escapeHtml(formatDate(entry.date))}</td>
      <td class="px-3 py-2 align-top text-[var(--foreground)]">${escapeHtml(compactText(entry.error_message || entry.crm_response?.message || entry.crm_response?.status || entry.crm_response?.fiscal_status || '—', 160))}</td>
      <td class="px-3 py-2 align-top text-[var(--muted-foreground)]">${escapeHtml(entry.retry_count ?? '—')}</td>
    </tr>
  `).join('');

  const itemsRows = (site.items || []).map((item) => `
    <tr class="border-b last:border-b-0">
      <td class="px-3 py-2 text-[var(--foreground)]">${escapeHtml(item.name || '—')}</td>
      <td class="px-3 py-2 text-[var(--muted-foreground)]">${escapeHtml(item.category || '—')}</td>
      <td class="px-3 py-2 text-[var(--foreground)]">${escapeHtml(item.quantity ?? '—')}</td>
      <td class="px-3 py-2 text-[var(--foreground)]">${escapeHtml(formatMoney(item.cost, site.currency || 'UAH'))}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="px-3 py-3 text-center text-[var(--muted-foreground)]">Немає товарів</td></tr>';

  const payloadRows = Object.entries(crm).slice(0, 12).map(([key, value]) => `
    <div class="grid gap-2 border-b py-2 last:border-b-0 md:grid-cols-[180px_minmax(0,1fr)]">
      <div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">${escapeHtml(key)}</div>
      <div class="break-words text-sm text-[var(--foreground)]">${escapeHtml(typeof value === 'object' ? compactText(JSON.stringify(value), 220) : value)}</div>
    </div>
  `).join('') || '<div class="text-sm text-[var(--muted-foreground)]">KeyCRM ще нічого не повернув.</div>';

  return `
    <div class="space-y-4 rounded-[var(--radius)] border bg-[color:color-mix(in_oklch,var(--card)_96%,white_4%)] p-4 shadow-[var(--shadow-xs)]">
      <section class="history-subtle rounded-[var(--radius)] p-4">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div class="text-xs font-medium text-[var(--muted-foreground)]">Замовлення #${escapeHtml(site.externalOrderId || order._rowid)}</div>
            <div class="mt-1 text-base font-semibold text-[var(--foreground)]">${escapeHtml(customerName)}</div>
            <div class="mt-1 text-sm text-[var(--muted-foreground)]">${escapeHtml(site.phone || '—')}${site.email ? ` · ${escapeHtml(site.email)}` : ''}</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <span class="inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone[displayStatus] || statusTone.unknown}">${escapeHtml(displayStatusLabel)}</span>
            ${crmId ? `<span class="history-pill inline-flex rounded-full px-2.5 py-1 text-xs">CRM ${escapeHtml(crmId)}</span>` : ''}
            ${delayLabel ? `<span class="history-pill inline-flex rounded-full px-2.5 py-1 text-xs">${escapeHtml(delayLabel)}</span>` : ''}
          </div>
        </div>
      </section>

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-[var(--foreground)]">Замовлення</h3>
          <div class="history-detail-grid grid gap-x-6 md:grid-cols-2">
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Сума</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(formatMoney(site.totalCost, site.currency || 'UAH'))}</div></div>
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Статус сайту</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(site.statusDescription || site.status || '—')}</div></div>
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Оплата / доставка</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml([site.paymentMethod, site.deliveryMethod].filter(Boolean).join(' · ') || '—')}</div></div>
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Дата замовлення</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(formatDate(site.date))}</div></div>
            <div class="md:col-span-2"><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Адреса доставки</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(site.deliveryAddress || '—')}</div></div>
            <div class="md:col-span-2"><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Коментар</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(site.additionalInfo || '—')}</div></div>
          </div>
        </section>

        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-[var(--foreground)]">CRM</h3>
          <div class="history-detail-grid grid gap-x-6 md:grid-cols-2">
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">CRM ID</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(crmId || '—')}</div></div>
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Source UUID</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(crm.source_uuid || '—')}</div></div>
            <div class="md:col-span-2"><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Останній результат</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(compactText(latestError || crm.message || 'Ще немає відповіді від CRM', 180))}</div></div>
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Оновлено</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(formatDate(order.updated_at))}</div></div>
            <div><div class="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-foreground)]">Створено</div><div class="mt-1 text-sm text-[var(--foreground)]">${escapeHtml(formatDate(order.created_at))}</div></div>
          </div>
        </section>
      </div>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-[var(--foreground)]">Товари</h3>
        <div class="overflow-hidden rounded-[var(--radius)] border bg-[var(--card)]">
          <table class="min-w-full text-sm">
            <thead class="history-table-head text-left text-[11px] uppercase tracking-[0.16em]">
              <tr>
                <th class="px-3 py-2">Товар</th>
                <th class="px-3 py-2">Категорія</th>
                <th class="px-3 py-2">К-сть</th>
                <th class="px-3 py-2">Ціна</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
          </table>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-[var(--foreground)]">Історія статусів</h3>
        <div class="overflow-hidden rounded-[var(--radius)] border bg-[var(--card)]">
          <table class="min-w-full text-sm">
            <thead class="history-table-head text-left text-[11px] uppercase tracking-[0.16em]">
              <tr>
                <th class="w-44 px-3 py-2">Статус</th>
                <th class="px-3 py-2">Дата</th>
                <th class="px-3 py-2">Що сталося</th>
                <th class="px-3 py-2">Retry</th>
              </tr>
            </thead>
            <tbody>${historyRows || '<tr><td colspan="4" class="px-3 py-3 text-center text-[var(--muted-foreground)]">Історія ще порожня</td></tr>'}</tbody>
          </table>
        </div>
      </section>

      <details class="rounded-[var(--radius)] border bg-[color:color-mix(in_oklch,var(--muted)_74%,white_26%)] px-4 py-3">
        <summary class="cursor-pointer text-sm font-medium text-[var(--foreground)]">CRM payload</summary>
        <div class="mt-3">${payloadRows}</div>
      </details>
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
  target.innerHTML = '<div class="history-surface rounded-[var(--radius)] px-4 py-6 text-sm text-[var(--muted-foreground)]">Тягну деталі замовлення…</div>';

  try {
    const response = await fetch(`/history/order/${encodeURIComponent(rowid)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const payload = await response.json();
    if (!payload.success || !payload.order) throw new Error(payload.error || 'Не вдалося завантажити деталі');
    state.details[rowid] = payload.order;
    target.innerHTML = renderOrderDetail(payload.order);
  } catch (error) {
    target.innerHTML = `<div class="rounded-[var(--radius)] border border-[color:color-mix(in_oklch,var(--destructive)_22%,white_78%)] bg-[color:color-mix(in_oklch,var(--destructive)_10%,white_90%)] px-4 py-6 text-sm text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)]">Не вдалося завантажити деталі: ${escapeHtml(error?.message || error)}</div>`;
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
      <tr class="cursor-pointer transition hover:bg-[color:color-mix(in_oklch,var(--accent)_42%,white_58%)] focus-within:bg-[color:color-mix(in_oklch,var(--accent)_42%,white_58%)]" data-expand-row="row-${index}" data-rowid="${escapeHtml(order._rowid)}" tabindex="0" aria-expanded="false">
        <td class="px-4 py-4 align-top">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-semibold text-[var(--foreground)]">#${escapeHtml(site.externalOrderId || order._rowid)}</div>
              <div class="mt-1 text-xs text-[var(--muted-foreground)] mono">rowid: ${escapeHtml(order._rowid)}</div>
            </div>
            <span class="rounded-full border px-2.5 py-1 text-[11px] font-medium ${statusTone[displayStatus] || statusTone.unknown}">${escapeHtml(displayStatusLabel)}</span>
          </div>
          <div class="mt-2 text-xs text-[var(--muted-foreground)]">${escapeHtml(formatDate(site.date))}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-[var(--foreground)]">${escapeHtml(customerName)}</div>
          <div class="mt-1 text-[var(--foreground)]">${escapeHtml(site.phone || '—')}</div>
          <div class="mt-1 text-xs text-[var(--muted-foreground)]">${escapeHtml(site.email || '—')}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-[var(--foreground)]">${escapeHtml(formatMoney(site.totalCost, site.currency || 'UAH'))}</div>
          <div class="mt-1 text-[var(--foreground)]">${escapeHtml(compactText(itemPreview, 72))}</div>
          <div class="mt-1 text-xs text-[var(--muted-foreground)]">${escapeHtml(`${itemCount} поз. · ${paymentDelivery || 'без логістики'}`)}</div>
        </td>
        <td class="px-4 py-4 align-top">
          <div class="font-medium text-[var(--foreground)]">${escapeHtml(crmId || 'Ще без CRM ID')}</div>
          <div class="mt-1 text-[var(--muted-foreground)]">${escapeHtml(compactText(syncSummary, 92))}</div>
          <div class="mt-1 text-xs text-[var(--muted-foreground)]">${escapeHtml(site.statusDescription || site.status || '—')}</div>
        </td>
        <td class="px-4 py-4 align-top">
          ${delayLabel
            ? `<div class="text-xs text-[var(--primary)]">${escapeHtml(compactText(delayLabel, 92))}</div>`
            : latestError
              ? `<div class="text-xs text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)]">${escapeHtml(compactText(latestError, 92))}</div>`
              : '<div class="text-xs text-[var(--muted-foreground)]">Без свіжих проблем</div>'}
        </td>
        <td class="px-4 py-4 align-top text-[var(--foreground)]">
          <div>${escapeHtml(formatDate(order.updated_at))}</div>
          <div class="mt-1 text-xs text-[var(--muted-foreground)]">створено: ${escapeHtml(formatDate(order.created_at))}</div>
        </td>
      </tr>
      <tr id="row-${index}" class="hidden bg-[color:color-mix(in_oklch,var(--muted)_68%,white_32%)]">
        <td colspan="6" class="px-4 pb-5 pt-1">
          <div data-detail-target="${escapeHtml(order._rowid)}" class="history-surface rounded-[var(--radius)] px-4 py-6 text-sm text-[var(--muted-foreground)]">Тягну деталі замовлення…</div>
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
