import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Search, RefreshCw, Filter, ChartColumn } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const HISTORY_UI_TITLE = "cher17 / History";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius)] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-95 focus-visible:ring-[color:color-mix(in_oklch,var(--ring)_25%,white_75%)]",
        outline:
          "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[color:color-mix(in_oklch,var(--accent)_48%,white_52%)] focus-visible:ring-[color:color-mix(in_oklch,var(--ring)_25%,white_75%)]",
        secondary:
          "border border-[color:color-mix(in_oklch,var(--primary)_20%,white_80%)] bg-[color:color-mix(in_oklch,var(--primary)_10%,white_90%)] text-[var(--primary)] hover:bg-[color:color-mix(in_oklch,var(--primary)_16%,white_84%)] focus-visible:ring-[color:color-mix(in_oklch,var(--ring)_25%,white_75%)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
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
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>,
) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("history-card rounded-[var(--radius)]", className)} {...props} />;
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b px-4 py-4 sm:px-5", className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-4 py-4 sm:px-5", className)} {...props} />;
}

function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("history-pill inline-flex items-center rounded-full px-3 py-1 text-xs font-medium", className)} {...props} />;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "history-input flex h-11 w-full rounded-[var(--radius)] px-4 py-2 text-sm outline-none transition",
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
        "history-select flex h-11 w-full rounded-[var(--radius)] px-4 py-2 text-sm outline-none transition",
        props.className,
      )}
    />
  );
}

function FilterField({
  label,
  htmlFor,
  icon,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={className}>
      <span className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function StatSkeleton({ title }: { title: string }) {
  return (
    <div className="history-surface rounded-[var(--radius)] p-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-foreground)]">{title}</div>
      <div className="mt-2 h-7 w-20 rounded-md bg-[color:color-mix(in_oklch,var(--muted)_70%,white_30%)]" />
    </div>
  );
}

function AppShell() {
  return (
    <html lang="uk" className="dark">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{HISTORY_UI_TITLE}</title>
        <link rel="stylesheet" href="/history/styles.css" />
      </head>
      <body className="min-h-screen text-[var(--foreground)] antialiased">
        <a
          href="#history-results"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--primary)] focus:px-3 focus:py-2 focus:text-[var(--primary-foreground)]"
        >
          Перейти до таблиці
        </a>

        <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl">
              Історія синхронізації
            </h1>

            <Button id="reloadButton" variant="secondary" type="button">
              <RefreshCw className="h-4 w-4" />
              Оновити
            </Button>
          </header>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <Card>
              <CardHeader className="border-b-0 pb-3">
                <h2 className="text-lg font-semibold">Огляд</h2>
              </CardHeader>
              <CardContent className="pt-0">
                <div id="statsCards" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <StatSkeleton title="Записів" />
                  <StatSkeleton title="Готово" />
                  <StatSkeleton title="Увага" />
                  <StatSkeleton title="Відкладено" />
                  <StatSkeleton title="Середній чек" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b-0 pb-3">
                <h2 className="text-lg font-semibold">Фільтри</h2>
              </CardHeader>
              <CardContent className="pt-0">
                <form className="grid gap-3 md:grid-cols-2" role="search">
                  <FilterField label="Пошук" htmlFor="searchInput" icon={<Search className="h-3.5 w-3.5" />} className="md:col-span-2">
                    <Input id="searchInput" type="search" placeholder="ID, ПІБ, телефон, email, SKU, CRM ID" autoComplete="off" />
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

                  <div className="md:col-span-2 pt-1">
                    <Button id="clearFiltersButton" variant="outline" type="button">
                      Скинути фільтри
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4 overflow-hidden">
            <CardHeader>
              <h2 className="text-lg font-semibold">Замовлення</h2>
            </CardHeader>
            <CardContent>
              <div className="history-surface mb-4 flex flex-col gap-3 rounded-[var(--radius)] p-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="space-y-1">
                  <p id="resultsLabel" className="text-sm font-medium text-[var(--foreground)]">Завантаження...</p>
                  <p id="querySummary" className="text-xs text-[var(--muted-foreground)]">—</p>
                </div>
                <nav className="flex items-center gap-2" aria-label="Пагінація історії замовлень">
                  <Button id="prevPageButton" variant="outline" size="sm" type="button">← Назад</Button>
                  <div id="pageIndicator" className="min-w-28 text-center text-sm text-[var(--muted-foreground)]" aria-live="polite">—</div>
                  <Button id="nextPageButton" variant="outline" size="sm" type="button">Вперед →</Button>
                </nav>
              </div>

              <div id="feedbackBanner" className="hidden mb-4 rounded-[var(--radius)] border px-4 py-3 text-sm" role="status" aria-live="polite"></div>

              <div id="loadingState" className="history-surface rounded-[var(--radius)] px-4 py-12 text-center text-[var(--muted-foreground)]">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--primary)]"></div>
                <p className="text-sm font-medium text-[var(--foreground)]">Тягну історію…</p>
              </div>

              <div id="errorState" className="hidden rounded-[var(--radius)] border border-[color:color-mix(in_oklch,var(--destructive)_25%,white_75%)] bg-[color:color-mix(in_oklch,var(--destructive)_8%,white_92%)] px-4 py-8 text-center text-[color:color-mix(in_oklch,var(--destructive)_78%,black_22%)]" role="alert"></div>

              <div id="emptyState" className="history-surface hidden rounded-[var(--radius)] px-4 py-12 text-center">
                <p className="text-sm font-medium">Нічого не знайдено</p>
              </div>

              <div id="tableWrap" className="hidden overflow-x-auto rounded-[var(--radius)] border bg-[color:color-mix(in_oklch,var(--card)_94%,white_6%)]" tabIndex={0}>
                <table id="history-results" className="min-w-full divide-y text-sm">
                  <caption className="sr-only">Історія замовлень і синхронізації з KeyCRM</caption>
                  <thead className="history-table-head sticky top-0 text-left text-[11px] uppercase tracking-[0.18em]">
                    <tr>
                      <th scope="col" className="px-4 py-3">Замовлення</th>
                      <th scope="col" className="px-4 py-3">Клієнт</th>
                      <th scope="col" className="px-4 py-3">Деталі</th>
                      <th scope="col" className="px-4 py-3">CRM / sync</th>
                      <th scope="col" className="px-4 py-3">Стан</th>
                      <th scope="col" className="px-4 py-3">Активність</th>
                    </tr>
                  </thead>
                  <tbody id="historyTableBody" className="divide-y bg-[color:color-mix(in_oklch,var(--card)_97%,white_3%)]"></tbody>
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
