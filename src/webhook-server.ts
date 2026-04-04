import { Elysia, t } from "elysia";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder, OrderMapping } from "./types";
import { enqueueOrder } from "./queue-service";
import {
  getOrderHistory,
  getOrderHistoryLegacy,
  getOrderHistoryCount,
  getOrderMappingsByStatus,
  cleanHistory,
  getHistoryStats,
} from "./order-mapping-service";
import { renderHistoryPage } from "./history-ui.tsx";
import historyAppScript from "./history-app.js" with { type: "text" };
import redis from "./redis";
import { handleFiscalizationWebhook } from "./fiscalization-service";
import { getDelayedQueueCount, getNextDelayedRunAt } from "./delayed-queue";
import { getWorkerStats } from "./worker-observability";

export function createWebhookServer() {
  const HISTORY_SEARCH_LIMIT = 1000;
  const DEFAULT_PAGE_SIZE = 10;
  const MAX_PAGE_SIZE = 100;
  const HISTORY_BASIC_AUTH_USERNAME = Bun.env["HISTORY_USERNAME"] || "dev";
  const HISTORY_BASIC_AUTH_PASSWORD = Bun.env["HISTORY_PASSWORD"] || "dev";

  function isAuthorizedHistoryRequest(headers: Record<string, string | undefined>) {
    const authorization = headers.authorization || headers.Authorization;
    if (!authorization || !authorization.startsWith("Basic ")) {
      return false;
    }

    try {
      const encoded = authorization.slice("Basic ".length);
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const [username, ...rest] = decoded.split(":");
      const password = rest.join(":");
      return username === HISTORY_BASIC_AUTH_USERNAME && password === HISTORY_BASIC_AUTH_PASSWORD;
    } catch {
      return false;
    }
  }

  async function normalizeOrder(order: OrderMapping) {
    const retryAtRaw = await redis.get(REDIS_KEYS.RETRY_AT(order._rowid));
    const retryAt = retryAtRaw ? Number(retryAtRaw) : null;
    const isDelayedLead = Boolean(
      retryAt &&
      retryAt > Date.now() &&
      Number(order.site_order?.orderStatus) === 0 &&
      Number(order.site_order?.paymentStatus) !== 1,
    );

    return {
      _rowid: order._rowid,
      site_order: order.site_order,
      crm_order: order.crm_order,
      status_history: order.status_history,
      current_status: order.current_status,
      created_at: order.created_at,
      updated_at: order.updated_at,
      queue_meta: {
        retry_at: retryAt,
        is_delayed_lead: isDelayedLead,
        delay_minutes: isDelayedLead && retryAt ? Math.max(0, Math.ceil((retryAt - Date.now()) / 60000)) : null,
      },
    };
  }

  function buildOrderSearchText(order: OrderMapping) {
    const site = order.site_order || ({} as OrderMapping["site_order"]);
    const crm = order.crm_order || {};
    const itemBits = (site.items || []).flatMap((item) => [
      item.name,
      item.category,
      item.description,
      item.sku,
      item.externalItemId,
    ]);
    const historyBits = (order.status_history || []).flatMap((entry) => [
      entry.status,
      entry.error_message,
      entry.crm_response?.message,
      entry.crm_response?.id,
      entry.crm_response?.status,
    ]);

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
      ...itemBits,
      ...historyBits,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  async function buildHistoryResponse(query: {
    status?: string;
    limit?: string;
    page?: string;
    pageSize?: string;
    search?: string;
    q?: string;
  }) {
    const { status, limit, page, pageSize, search, q } = query;
    const parsedLimit = limit ? parseInt(limit) : 100;
    const pageNumber = page ? parseInt(page) : 1;
    const resolvedPageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, pageSize ? parseInt(pageSize) : DEFAULT_PAGE_SIZE),
    );
    const searchQuery = (search || q || "").trim().toLowerCase();
    const shouldPaginate = Boolean(page || (!limit && !status));

    let orders: OrderMapping[];
    let totalCount: number;

    if (searchQuery) {
      const searchSource = status
        ? await getOrderMappingsByStatus(
            status as OrderMapping["current_status"],
            HISTORY_SEARCH_LIMIT,
          )
        : await getOrderHistoryLegacy(HISTORY_SEARCH_LIMIT);

      const filteredOrders = searchSource.filter((order) =>
        buildOrderSearchText(order).includes(searchQuery),
      );

      totalCount = filteredOrders.length;
      if (shouldPaginate) {
        const offset = (pageNumber - 1) * resolvedPageSize;
        orders = filteredOrders.slice(offset, offset + resolvedPageSize);
      } else {
        orders = filteredOrders.slice(0, parsedLimit);
      }
    } else if (status) {
      orders = await getOrderMappingsByStatus(
        status as OrderMapping["current_status"],
        parsedLimit,
      );
      totalCount = orders.length;
    } else if (page) {
      orders = await getOrderHistory(pageNumber, resolvedPageSize);
      totalCount = await getOrderHistoryCount();
    } else {
      orders = await getOrderHistoryLegacy(parsedLimit);
      totalCount = orders.length;
    }

    if (shouldPaginate) {
      const totalPages = Math.ceil(totalCount / resolvedPageSize);
      return {
        success: true,
        query: {
          search: searchQuery || null,
          status: status || null,
        },
        pagination: {
          current_page: pageNumber,
          per_page: resolvedPageSize,
          total_count: totalCount,
          total_pages: totalPages,
          has_next: pageNumber < totalPages,
          has_prev: pageNumber > 1,
        },
        orders: await Promise.all(orders.map(normalizeOrder)),
      };
    }

    return {
      success: true,
      query: {
        search: searchQuery || null,
        status: status || null,
      },
      total: orders.length,
      orders: await Promise.all(orders.map(normalizeOrder)),
    };
  }

  // History router group
  const historyRouter = new Elysia({ prefix: "/history" })
    .get("/", async ({ headers, query, set }) => {
      if (!isAuthorizedHistoryRequest(headers)) {
        set.status = 401;
        set.headers["www-authenticate"] = 'Basic realm="cher17-history"';
        return "Unauthorized";
      }

      const accept = headers.accept || "";
      const wantsHtml = accept.includes("text/html") && query.format !== "json";

      if (wantsHtml) {
        set.headers["content-type"] = "text/html; charset=utf-8";
        return renderHistoryPage();
      }

      try {
        return await buildHistoryResponse(query);
      } catch (error) {
        console.error("Error fetching order history:", error);
        return {
          success: false,
          error: "Failed to fetch order history",
        };
      }
    },
    {
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("pending"),
            t.Literal("processing"),
            t.Literal("completed"),
            t.Literal("failed"),
          ]),
        ),
        limit: t.Optional(t.String()),
        page: t.Optional(t.String()),
        pageSize: t.Optional(t.String()),
        search: t.Optional(t.String()),
        q: t.Optional(t.String()),
        format: t.Optional(t.String()),
      }),
    })
    .get(
      "/data",
      async ({ headers, query, set }) => {
        if (!isAuthorizedHistoryRequest(headers)) {
          set.status = 401;
          set.headers["www-authenticate"] = 'Basic realm="cher17-history"';
          return {
            success: false,
            error: "Unauthorized",
          };
        }

        try {
          return await buildHistoryResponse(query);
        } catch (error) {
          console.error("Error fetching order history:", error);
          return {
            success: false,
            error: "Failed to fetch order history",
          };
        }
      },
      {
        query: t.Object({
          status: t.Optional(
            t.Union([
              t.Literal("pending"),
              t.Literal("processing"),
              t.Literal("completed"),
              t.Literal("failed"),
            ]),
          ),
          limit: t.Optional(t.String()),
          page: t.Optional(t.String()),
          pageSize: t.Optional(t.String()),
          search: t.Optional(t.String()),
          q: t.Optional(t.String()),
          format: t.Optional(t.String()),
        }),
      },
    )
    .get("/app.js", ({ headers, set }) => {
      if (!isAuthorizedHistoryRequest(headers)) {
        set.status = 401;
        set.headers["www-authenticate"] = 'Basic realm="cher17-history"';
        return "Unauthorized";
      }

      set.headers["content-type"] = "application/javascript; charset=utf-8";
      return historyAppScript;
    })
    .get(
      "/:page",
      async ({ headers, params, query, set }) => {
        if (!isAuthorizedHistoryRequest(headers)) {
          set.status = 401;
          set.headers["www-authenticate"] = 'Basic realm="cher17-history"';
          return {
            success: false,
            error: "Unauthorized",
          };
        }

        const { page } = params;
        const { status } = query;
        const pageNumber = parseInt(page);

        if (isNaN(pageNumber) || pageNumber < 1) {
          return {
            success: false,
            error: "Invalid page number",
          };
        }

        try {
          const pageSize = 10; // Fixed 10 orders per page
          let orders: OrderMapping[];
          let totalCount: number;

          if (status) {
            orders = await getOrderMappingsByStatus(
              status as OrderMapping["current_status"],
              pageSize * pageNumber, // Get enough items for pagination
            );
            totalCount = orders.length; // Approximate for status filter
            // Apply pagination manually for status filter
            const startIndex = (pageNumber - 1) * pageSize;
            orders = orders.slice(startIndex, startIndex + pageSize);
          } else {
            orders = await getOrderHistory(pageNumber, pageSize);
            totalCount = await getOrderHistoryCount();
          }

          const totalPages = Math.ceil(totalCount / pageSize);

          return {
            success: true,
            pagination: {
              current_page: pageNumber,
              per_page: pageSize,
              total_count: totalCount,
              total_pages: totalPages,
              has_next: pageNumber < totalPages,
              has_prev: pageNumber > 1,
            },
            orders: await Promise.all(orders.map(normalizeOrder)),
          };
        } catch (error) {
          console.error("Error fetching paginated order history:", error);
          return {
            success: false,
            error: "Failed to fetch order history",
          };
        }
      },
      {
        params: t.Object({
          page: t.String(),
        }),
        query: t.Object({
          status: t.Optional(
            t.Union([
              t.Literal("pending"),
              t.Literal("processing"),
              t.Literal("completed"),
              t.Literal("failed"),
            ]),
          ),
        }),
      },
    )
    .get("/stats", async ({ headers, set }) => {
      if (!isAuthorizedHistoryRequest(headers)) {
        set.status = 401;
        set.headers["www-authenticate"] = 'Basic realm="cher17-history"';
        return {
          success: false,
          error: "Unauthorized",
        };
      }

      try {
        const stats = await getHistoryStats();
        return {
          success: true,
          ...stats,
          formatted: {
            total: stats.total,
            oldestRecord: stats.oldestRecord
              ? new Intl.DateTimeFormat("uk-UA", {
                  dateStyle: "short",
                  timeStyle: "medium",
                  timeZone: "Europe/Kyiv",
                }).format(new Date(stats.oldestRecord))
              : null,
            newestRecord: stats.newestRecord
              ? new Intl.DateTimeFormat("uk-UA", {
                  dateStyle: "short",
                  timeStyle: "medium",
                  timeZone: "Europe/Kyiv",
                }).format(new Date(stats.newestRecord))
              : null,
            byStatus: stats.byStatus,
          },
        };
      } catch (error) {
        console.error("Error fetching history stats:", error);
        return {
          success: false,
          error: "Failed to fetch history statistics",
        };
      }
    })
    .get("/clean", async ({ headers, set }) => {
      if (!isAuthorizedHistoryRequest(headers)) {
        set.status = 401;
        set.headers["www-authenticate"] = 'Basic realm="cher17-history"';
        return {
          success: false,
          error: "Unauthorized",
        };
      }

      try {
        const result = await cleanHistory();

        return {
          success: true,
          ...result,
        };
      } catch (error) {
        console.error("Error cleaning history:", error);
        set.status = 500;
        return {
          success: false,
          error: "Failed to clean history",
        };
      }
    });

  // DLQ router group
  const dlqRouter = new Elysia({ prefix: "/dlq" })
    .get("/", async () => {
      const dlqCount = await redis.llen(REDIS_KEYS.DEAD_LETTER_QUEUE);
      const items: Array<{ order: SiteOrder; reason?: string; retryCount?: number; errorMessage?: string; failedAt?: number }> = [];

      for (let i = 0; i < Math.min(dlqCount, 100); i++) {
        const item = await redis.lindex(REDIS_KEYS.DEAD_LETTER_QUEUE, i);
        if (!item) continue;
        const parsed = JSON.parse(item as string);
        items.push(parsed.order ? parsed : { order: parsed });
      }

      return {
        count: dlqCount,
        items,
      };
    })
    .post(
      "/retry",
      async ({ body, set }) => {
        const dlqCount = await redis.llen(REDIS_KEYS.DEAD_LETTER_QUEUE);

        for (let i = 0; i < dlqCount; i++) {
          const item = await redis.lindex(REDIS_KEYS.DEAD_LETTER_QUEUE, i);
          if (!item) continue;

          const parsed = JSON.parse(item as string);
          const order: SiteOrder = parsed.order ? parsed.order : parsed;
          if (order.externalOrderId !== body.orderId) continue;

          await redis.lrem(REDIS_KEYS.DEAD_LETTER_QUEUE, 1, item);
          await redis.del(REDIS_KEYS.RETRY_COUNT(body.orderId));
          await redis.del(REDIS_KEYS.RETRY_AT(body.orderId));
          await redis.rpush(REDIS_KEYS.PENDING_QUEUE, JSON.stringify(order));

          return {
            success: true,
            message: "Замовлення повернуто в чергу",
          };
        }

        set.status = 404;
        return { error: "Замовлення не знайдено в DLQ" };
      },
      {
        body: t.Object({
          orderId: t.String(),
        }),
      },
    );

  return (
    new Elysia()
      .use(historyRouter)
      .use(dlqRouter)
      // POST /webhook - прийом замовлень з сайту
      .post(
        "/webhook",
        async ({ body }) => {
          for (const order of body.orders) {
            await enqueueOrder(order);
          }

          return {
            success: true,
            queued: body.orders.length,
            message: `${body.orders.length} замовлень додано в чергу`,
          };
        },
        {
          body: t.Object({
            orders: t.Array(t.Any()),
          }),
          response: {
            202: t.Object({
              success: t.Boolean(),
              queued: t.Number(),
              message: t.String(),
            }),
          },
          error({ code, error, set }) {
            console.error("Помилка обробки webhook:", error);
            set.status = 500;
            return { error: "Internal server error" };
          },
        },
      )

      .post(
        "/fiscalization",
        async ({ body, set }) => {
          try {
            const result = await handleFiscalizationWebhook(body as any);
            set.status = 200;
            return {
              ...result,
            };
          } catch (error) {
            console.error("Помилка обробки fiscalization webhook:", error);
            set.status = 400;
            return {
              success: false,
              error: error instanceof Error ? error.message : "Invalid fiscalization webhook",
            };
          }
        },
        {
          body: t.Object({
            event: t.Optional(t.String()),
            context: t.Object({
              id: t.Union([t.String(), t.Number()]),
              source_uuid: t.Optional(t.Union([t.String(), t.Null()])),
              status_id: t.Optional(t.Union([t.String(), t.Number()])),
              fiscal_status: t.Optional(t.Union([t.String(), t.Null()])),
            }, { additionalProperties: true }),
          }, { additionalProperties: true }),
        },
      )

      // GET /health - статус черг
      .get("/health", async () => {
        const pendingCount = await redis.llen(REDIS_KEYS.PENDING_QUEUE);
        const processingCount = await redis.llen(REDIS_KEYS.PROCESSING_QUEUE);
        const delayedCount = await getDelayedQueueCount(REDIS_KEYS.DELAYED_QUEUE);
        const dlqCount = await redis.llen(REDIS_KEYS.DEAD_LETTER_QUEUE);
        const fiscalizationCount = await redis.llen(REDIS_KEYS.FISCALIZATION_QUEUE);
        const fiscalizationDelayedCount = await getDelayedQueueCount(REDIS_KEYS.FISCALIZATION_DELAYED_QUEUE);
        const fiscalizationDlqCount = await redis.llen(REDIS_KEYS.FISCALIZATION_DEAD_LETTER_QUEUE);
        const nextOrderRunAt = await getNextDelayedRunAt(REDIS_KEYS.DELAYED_QUEUE);
        const nextFiscalizationRunAt = await getNextDelayedRunAt(REDIS_KEYS.FISCALIZATION_DELAYED_QUEUE);
        const workers = {
          orders: await getWorkerStats("orders"),
          fiscalization: await getWorkerStats("fiscalization"),
        };

        return {
          status: "healthy",
          queues: {
            pending: pendingCount,
            processing: processingCount,
            delayed: delayedCount,
            fiscalization: fiscalizationCount,
            fiscalizationDelayed: fiscalizationDelayedCount,
            deadLetter: dlqCount,
            fiscalizationDeadLetter: fiscalizationDlqCount,
          },
          nextRuns: {
            orderDelayedAt: nextOrderRunAt,
            fiscalizationDelayedAt: nextFiscalizationRunAt,
          },
          workers,
        };
      })

      .listen(CONFIG.WEBHOOK_PORT)
  );
}
