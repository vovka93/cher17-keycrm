const HISTORY_UI_TITLE = "cher17 / History";

export function renderHistoryPage() {
  return `<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${HISTORY_UI_TITLE}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { background: #0b1020; }
      .glass { background: rgba(15, 23, 42, 0.78); backdrop-filter: blur(14px); }
      .mono { font-variant-ligatures: none; }
    </style>
  </head>
  <body class="min-h-screen bg-slate-950 text-slate-100">
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-sm uppercase tracking-[0.24em] text-cyan-400/80">cher17</p>
          <h1 class="text-3xl font-bold tracking-tight text-white">Історія синхронізації замовлень</h1>
          <p class="mt-2 max-w-3xl text-sm text-slate-400">
            Зручний перегляд того, що прийшло з сайту, що повернув KeyCRM, і що зараз відкладено в черзі — з пошуком, фільтрами, сортуванням та деталями по кожному замовленню.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span class="rounded-full border border-slate-700 px-3 py-1">UI</span>
          <span class="rounded-full border border-slate-700 px-3 py-1">Search</span>
          <span class="rounded-full border border-slate-700 px-3 py-1">Sort</span>
          <span class="rounded-full border border-slate-700 px-3 py-1">Tailwind</span>
        </div>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <section class="glass rounded-2xl border border-slate-800 p-4 shadow-2xl shadow-cyan-950/20">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label class="xl:col-span-2">
              <span class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Пошук</span>
              <input id="searchInput" type="search" placeholder="ID, телефон, email, ПІБ, товар, статус, CRM ID..."
                class="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-500" />
            </label>
            <label>
              <span class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Статус</span>
              <select id="statusFilter" class="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white focus:border-cyan-500">
                <option value="all">Усі</option>
                <option value="pending">pending</option>
                <option value="processing">processing</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
              </select>
            </label>
            <label>
              <span class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Сортування</span>
              <select id="sortField" class="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white focus:border-cyan-500">
                <option value="updated_at">Оновлено</option>
                <option value="created_at">Створено</option>
                <option value="site_order.date">Дата замовлення</option>
                <option value="site_order.totalCost">Сума</option>
                <option value="current_status">Статус</option>
                <option value="site_order.externalOrderId">Site ID</option>
              </select>
            </label>
            <label>
              <span class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Напрям</span>
              <select id="sortDirection" class="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white focus:border-cyan-500">
                <option value="desc">↓ Новіші / більші</option>
                <option value="asc">↑ Старіші / менші</option>
              </select>
            </label>
            <label>
              <span class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">На сторінку</span>
              <select id="pageSize" class="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white focus:border-cyan-500">
                <option value="10">10</option>
                <option value="25" selected>25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </label>
          </div>
        </section>

        <section class="glass rounded-2xl border border-slate-800 p-4 shadow-2xl shadow-cyan-950/20">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-semibold uppercase tracking-wide text-slate-300">Статистика</h2>
              <p class="text-xs text-slate-500">Оновлюється разом із таблицею</p>
            </div>
            <button id="reloadButton" class="rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-300 transition hover:bg-cyan-500/20">
              Оновити
            </button>
          </div>
          <div id="statsCards" class="mt-4 grid grid-cols-2 gap-3"></div>
        </section>
      </div>

      <section class="mt-4 glass rounded-2xl border border-slate-800 shadow-2xl shadow-cyan-950/20 overflow-hidden">
        <div class="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 class="text-lg font-semibold text-white">Замовлення</h2>
            <p id="resultsLabel" class="text-sm text-slate-400">Завантаження...</p>
          </div>
          <div class="flex flex-wrap gap-2 text-xs text-slate-400">
            <span class="rounded-full border border-slate-700 px-3 py-1">Клік по рядку → деталі</span>
            <span class="rounded-full border border-slate-700 px-3 py-1">Пошук працює по site + keycrm</span>
            <span class="rounded-full border border-slate-700 px-3 py-1">Delayed lead видно окремо</span>
          </div>
        </div>

        <div class="flex flex-col gap-3 border-b border-slate-800 bg-slate-950/30 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div id="querySummary" class="text-xs text-slate-500">Server-side filter: none</div>
          <div class="flex items-center gap-2">
            <button id="prevPageButton" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">← Назад</button>
            <div id="pageIndicator" class="min-w-28 text-center text-sm text-slate-400">—</div>
            <button id="nextPageButton" class="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:border-cyan-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">Вперед →</button>
          </div>
        </div>

        <div id="loadingState" class="px-4 py-10 text-center text-slate-400">Тягну історію…</div>
        <div id="errorState" class="hidden px-4 py-10 text-center text-rose-300"></div>

        <div id="tableWrap" class="hidden overflow-x-auto">
          <table class="min-w-full divide-y divide-slate-800 text-sm">
            <thead class="bg-slate-900/70 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th class="px-4 py-3">Замовлення</th>
                <th class="px-4 py-3">Клієнт</th>
                <th class="px-4 py-3">Товари</th>
                <th class="px-4 py-3">Сайт</th>
                <th class="px-4 py-3">KeyCRM</th>
                <th class="px-4 py-3">Статус</th>
                <th class="px-4 py-3">Оновлено</th>
              </tr>
            </thead>
            <tbody id="historyTableBody" class="divide-y divide-slate-800 bg-slate-950/50"></tbody>
          </table>
        </div>
      </section>
    </div>

    <script src="/history/app.js"></script>
  </body>
</html>`;
}
