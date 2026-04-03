import { Html } from "@elysiajs/html";

const HISTORY_UI_TITLE = "cher17 / History";

const controlClass =
  "w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30";
const buttonClass =
  "rounded-xl border px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:ring-offset-0";

function FilterField(
  {
    label,
    htmlFor,
    hint,
    className,
    children,
  }: {
    label: string;
    htmlFor: string;
    hint?: string;
    className?: string;
    children: any;
  },
) {
  return (
    <label for={htmlFor} class={className}>
      <span class="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-300">
        {label}
      </span>
      {children}
      {hint ? <span class="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Pill({ children }: { children: any }) {
  return (
    <span class="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}

function SectionCard(
  {
    title,
    subtitle,
    actions,
    children,
    className,
  }: {
    title: string;
    subtitle?: string;
    actions?: any;
    children: any;
    className?: string;
  },
) {
  return (
    <section class={`glass rounded-2xl border border-slate-800 shadow-2xl shadow-cyan-950/20 ${className || ""}`}>
      <div class="flex flex-col gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-base font-semibold text-white sm:text-lg">{title}</h2>
            {subtitle ? <p class="mt-1 text-sm text-slate-400">{subtitle}</p> : null}
          </div>
          {actions ? <div class="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      <div class="px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

export function HistoryPage() {
  return (
    <html lang="uk">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{HISTORY_UI_TITLE}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>{`
          body { background: #0b1020; }
          .glass { background: rgba(15, 23, 42, 0.78); backdrop-filter: blur(14px); }
          .mono { font-variant-ligatures: none; }
        `}</style>
      </head>
      <body class="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <a
          href="#history-results"
          class="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-cyan-500 focus:px-3 focus:py-2 focus:text-slate-950"
        >
          Перейти до таблиці
        </a>

        <main class="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <header class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div class="space-y-2">
              <p class="text-xs uppercase tracking-[0.28em] text-cyan-300">cher17</p>
              <div class="space-y-2">
                <h1 class="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Історія синхронізації замовлень
                </h1>
                <p class="max-w-3xl text-sm leading-6 text-slate-400 sm:text-[15px]">
                  В одному місці видно стан черги, дані із сайту, відповіді KeyCRM і повну історію змін для кожного замовлення.
                </p>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <Pill>Пошук</Pill>
              <Pill>Фільтри</Pill>
              <Pill>Деталі в один клік</Pill>
              <Pill>Delayed lead</Pill>
            </div>
          </header>

          <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)]">
            <SectionCard
              title="Фільтри та навігація"
              subtitle="Швидко звузь список за статусом, знайди потрібне замовлення або зміни порядок сортування."
            >
              <form class="grid gap-3 md:grid-cols-2 xl:grid-cols-5" role="search">
                <FilterField
                  label="Пошук"
                  htmlFor="searchInput"
                  className="xl:col-span-2"
                  hint="Працює по ID, клієнту, товару, телефону, email і полях KeyCRM"
                >
                  <input
                    id="searchInput"
                    type="search"
                    placeholder="Напр. 10234, Олена, 380..., SKU, CRM ID"
                    class={controlClass}
                    autocomplete="off"
                    aria-describedby="searchHelp"
                  />
                </FilterField>

                <FilterField label="Статус" htmlFor="statusFilter">
                  <select id="statusFilter" class={controlClass}>
                    <option value="all">Усі</option>
                    <option value="pending">pending</option>
                    <option value="processing">processing</option>
                    <option value="completed">completed</option>
                    <option value="failed">failed</option>
                  </select>
                </FilterField>

                <FilterField label="Сортування" htmlFor="sortField">
                  <select id="sortField" class={controlClass}>
                    <option value="updated_at">Оновлено</option>
                    <option value="created_at">Створено</option>
                    <option value="site_order.date">Дата замовлення</option>
                    <option value="site_order.totalCost">Сума</option>
                    <option value="current_status">Статус</option>
                    <option value="site_order.externalOrderId">Site ID</option>
                  </select>
                </FilterField>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-2 xl:col-span-1">
                  <FilterField label="Напрям" htmlFor="sortDirection">
                    <select id="sortDirection" class={controlClass}>
                      <option value="desc">↓ Новіші</option>
                      <option value="asc">↑ Старіші</option>
                    </select>
                  </FilterField>

                  <FilterField label="На сторінку" htmlFor="pageSize">
                    <select id="pageSize" class={controlClass}>
                      <option value="10">10</option>
                      <option value="25" selected>
                        25
                      </option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </FilterField>
                </div>
              </form>
              <p id="searchHelp" class="mt-3 text-xs leading-5 text-slate-500">
                Підказка: клік по рядку відкриває деталі. Пошук працює разом із серверною пагінацією.
              </p>
            </SectionCard>

            <SectionCard
              title="Огляд"
              subtitle="Швидкий зріз поточної сторінки з урахуванням активних фільтрів."
              actions={
                <button
                  id="reloadButton"
                  class={`${buttonClass} border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20`}
                  type="button"
                >
                  Оновити
                </button>
              }
            >
              <div id="statsCards" class="grid grid-cols-2 gap-3 lg:grid-cols-2"></div>
            </SectionCard>
          </div>

          <SectionCard
            title="Замовлення"
            subtitle="Список синхронізацій із ключовими полями. На мобільному таблиця залишається горизонтально скрольованою, без втрати даних."
            className="mt-4 overflow-hidden"
            actions={
              <>
                <Pill>Клік по рядку → деталі</Pill>
                <Pill>Пошук по site + keycrm</Pill>
                <Pill>Видно чергу та помилки</Pill>
              </>
            }
          >
            <div class="mb-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div class="space-y-1">
                <p id="resultsLabel" class="text-sm font-medium text-slate-200">Завантаження...</p>
                <p id="querySummary" class="text-xs text-slate-500">Server-side filter: none</p>
              </div>
              <nav class="flex items-center gap-2" aria-label="Пагінація історії замовлень">
                <button id="prevPageButton" type="button" class={`${buttonClass} border-slate-700 bg-slate-900/70 text-slate-200 hover:border-cyan-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40`}>← Назад</button>
                <div id="pageIndicator" class="min-w-28 text-center text-sm text-slate-400" aria-live="polite">—</div>
                <button id="nextPageButton" type="button" class={`${buttonClass} border-slate-700 bg-slate-900/70 text-slate-200 hover:border-cyan-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40`}>Вперед →</button>
              </nav>
            </div>

            <div id="feedbackBanner" class="hidden mb-4 rounded-xl border px-4 py-3 text-sm" role="status" aria-live="polite"></div>

            <div id="loadingState" class="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-10 text-center text-slate-300">
              <div class="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"></div>
              <p class="text-sm font-medium text-slate-200">Тягну історію…</p>
              <p class="mt-1 text-xs text-slate-500">Завантажую записи, статуси та метадані черги</p>
            </div>

            <div id="errorState" class="hidden rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-8 text-center text-rose-200" role="alert"></div>

            <div id="emptyState" class="hidden rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-10 text-center">
              <p class="text-sm font-medium text-slate-200">Нічого не знайдено</p>
              <p class="mt-1 text-xs text-slate-500">Спробуй змінити пошук, статус або розмір сторінки.</p>
            </div>

            <div id="tableWrap" class="hidden overflow-x-auto rounded-xl border border-slate-800" tabindex="0">
              <table id="history-results" class="min-w-full divide-y divide-slate-800 text-sm">
                <caption class="sr-only">Історія замовлень і синхронізації з KeyCRM</caption>
                <thead class="sticky top-0 bg-slate-900/90 text-left text-xs uppercase tracking-wide text-slate-300 backdrop-blur">
                  <tr>
                    <th scope="col" class="px-4 py-3">Замовлення</th>
                    <th scope="col" class="px-4 py-3">Клієнт</th>
                    <th scope="col" class="px-4 py-3">Товари</th>
                    <th scope="col" class="px-4 py-3">Сайт</th>
                    <th scope="col" class="px-4 py-3">KeyCRM</th>
                    <th scope="col" class="px-4 py-3">Статус</th>
                    <th scope="col" class="px-4 py-3">Оновлено</th>
                  </tr>
                </thead>
                <tbody id="historyTableBody" class="divide-y divide-slate-800 bg-slate-950/50"></tbody>
              </table>
            </div>
          </SectionCard>
        </main>

        <script type="module" src="/history/app.js"></script>
      </body>
    </html>
  );
}
