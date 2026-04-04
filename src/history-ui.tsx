import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Search,
  RefreshCw,
  Filter,
  ChartColumn,
} from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const HISTORY_UI_TITLE = "cher17 / History";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-cyan-500 text-slate-950 hover:bg-cyan-400",
        outline:
          "border border-slate-700 bg-slate-950/70 text-slate-100 hover:border-cyan-500 hover:bg-slate-900",
        secondary:
          "border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20",
        ghost: "text-slate-300 hover:bg-slate-900 hover:text-white",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button(
  {
    className,
    variant,
    size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> &
    VariantProps<typeof buttonVariants>,
) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-800 bg-slate-950/95 shadow-[0_24px_80px_-28px_rgba(6,182,212,0.25)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-slate-800 px-4 py-4 sm:px-5", className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs font-medium text-slate-300",
        className,
      )}
      {...props}
    />
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "flex h-11 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30",
        props.className,
      )}
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "flex h-11 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-4 py-2 text-sm text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/30",
        props.className,
      )}
    />
  );
}

function FilterField({
  label,
  htmlFor,
  hint,
  icon,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      <span className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        {icon}
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function StatSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{title}</div>
      <div className="mt-2 h-7 w-20 rounded-lg bg-slate-800" />
      <div className="mt-2 h-3 w-24 rounded bg-slate-800" />
    </div>
  );
}

function AppShell() {
  return (
    <html lang="uk">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{HISTORY_UI_TITLE}</title>
        <link rel="stylesheet" href="/history/styles.css" />
      </head>
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <a
          href="#history-results"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-cyan-500 focus:px-3 focus:py-2 focus:text-slate-950"
        >
          Перейти до таблиці
        </a>

        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-200">cher17</Badge>
                <Badge>History</Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Історія синхронізації замовлень
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-400 sm:text-[15px]">
                  Чистий журнал замовлень без зайвого шуму: швидкий пошук, фільтри, статуси, CRM-слід і деталі по кліку.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button id="reloadButton" variant="secondary" type="button">
                <RefreshCw className="h-4 w-4" />
                Оновити
              </Button>
            </div>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
            <Card>
              <CardHeader className="border-b-0 pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Огляд поточної вибірки</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Тільки ключові сигнали по сторінці: успішні, проблемні, відкладені й сума.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div id="statsCards" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <StatSkeleton title="Записів" />
                  <StatSkeleton title="Completed" />
                  <StatSkeleton title="Failed" />
                  <StatSkeleton title="Delayed" />
                  <StatSkeleton title="Середній чек" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b-0 pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Фільтри</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Пошук по ID, клієнту, телефону, email, SKU та CRM-полях.
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <form className="grid gap-3 md:grid-cols-2" role="search">
                  <FilterField
                    label="Пошук"
                    htmlFor="searchInput"
                    hint="ID, ПІБ, телефон, email, SKU, CRM ID"
                    icon={<Search className="h-3.5 w-3.5" />}
                    className="md:col-span-2"
                  >
                    <Input
                      id="searchInput"
                      type="search"
                      placeholder="10234, Олена, 380..., SKU, CRM ID"
                      autoComplete="off"
                    />
                  </FilterField>

                  <FilterField label="Статус" htmlFor="statusFilter" icon={<Filter className="h-3.5 w-3.5" />}>
                    <Select id="statusFilter" defaultValue="all">
                      <option value="all">Усі</option>
                      <option value="pending">pending</option>
                      <option value="processing">processing</option>
                      <option value="completed">completed</option>
                      <option value="failed">failed</option>
                    </Select>
                  </FilterField>

                  <FilterField label="На сторінку" htmlFor="pageSize">
                    <Select id="pageSize" defaultValue="25">
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </Select>
                  </FilterField>

                  <FilterField label="Сортування" htmlFor="sortField" icon={<ChartColumn className="h-3.5 w-3.5" />}>
                    <Select id="sortField" defaultValue="updated_at">
                      <option value="updated_at">Оновлено</option>
                      <option value="created_at">Створено</option>
                      <option value="site_order.date">Дата замовлення</option>
                      <option value="site_order.totalCost">Сума</option>
                      <option value="current_status">Статус</option>
                      <option value="site_order.externalOrderId">Site ID</option>
                    </Select>
                  </FilterField>

                  <FilterField label="Напрям" htmlFor="sortDirection">
                    <Select id="sortDirection" defaultValue="desc">
                      <option value="desc">↓ Новіші</option>
                      <option value="asc">↑ Старіші</option>
                    </Select>
                  </FilterField>

                  <div className="md:col-span-2 flex flex-wrap items-center gap-2 pt-1">
                    <Button id="clearFiltersButton" variant="outline" type="button">
                      Скинути фільтри
                    </Button>
                    <p className="text-xs text-slate-500">
                      Результати оновлюються автоматично, деталі догружаються тільки при розкритті рядка.
                    </p>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4 overflow-hidden">
            <CardHeader>
              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Журнал замовлень</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Розкрий рядок, щоб подивитись товари, історію статусів і CRM-відповідь без перевантаження списку.
                  </p>
                </div>
                <div id="resultsChips" className="flex flex-wrap gap-2" aria-live="polite" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p id="resultsLabel" className="text-sm font-medium text-slate-200">
                    Завантаження...
                  </p>
                  <p id="querySummary" className="text-xs text-slate-500">
                    Очікуємо дані від бекенда
                  </p>
                </div>
                <nav className="flex items-center gap-2" aria-label="Пагінація історії замовлень">
                  <Button id="prevPageButton" variant="outline" size="sm" type="button">
                    ← Назад
                  </Button>
                  <div id="pageIndicator" className="min-w-28 text-center text-sm text-slate-400" aria-live="polite">
                    —
                  </div>
                  <Button id="nextPageButton" variant="outline" size="sm" type="button">
                    Вперед →
                  </Button>
                </nav>
              </div>

              <div id="feedbackBanner" className="hidden mb-4 rounded-xl border px-4 py-3 text-sm" role="status" aria-live="polite"></div>

              <div id="loadingState" className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-12 text-center text-slate-300">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400"></div>
                <p className="text-sm font-medium text-slate-100">Тягну історію…</p>
                <p className="mt-1 text-xs text-slate-500">Підтягуємо поточну сторінку, не весь світ одразу</p>
              </div>

              <div id="errorState" className="hidden rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-8 text-center text-rose-200" role="alert"></div>

              <div id="emptyState" className="hidden rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-12 text-center">
                <p className="text-sm font-medium text-slate-100">Нічого не знайдено</p>
                <p className="mt-1 text-xs text-slate-500">Зміни пошук або скинь фільтри.</p>
              </div>

              <div id="tableWrap" className="hidden overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/80" tabIndex={0}>
                <table id="history-results" className="min-w-full divide-y divide-slate-800 text-sm">
                  <caption className="sr-only">Історія замовлень і синхронізації з KeyCRM</caption>
                  <thead className="sticky top-0 bg-slate-900 text-left text-[11px] uppercase tracking-[0.18em] text-slate-300">
                    <tr>
                      <th scope="col" className="px-4 py-3">Замовлення</th>
                      <th scope="col" className="px-4 py-3">Клієнт</th>
                      <th scope="col" className="px-4 py-3">Деталі</th>
                      <th scope="col" className="px-4 py-3">CRM / sync</th>
                      <th scope="col" className="px-4 py-3">Стан</th>
                      <th scope="col" className="px-4 py-3">Активність</th>
                    </tr>
                  </thead>
                  <tbody id="historyTableBody" className="divide-y divide-slate-800 bg-slate-950/50"></tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </main>

        <script type="module" src="/history/app.js"></script>
      </body>
    </html>
  );
}

export function renderHistoryPage() {
  return "<!doctype html>" + renderToStaticMarkup(<AppShell />);
}
