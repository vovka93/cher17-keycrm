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
import redis from "./redis";

export function createWebhookServer() {
  // History router group
  const historyRouter = new Elysia({ prefix: "/history" })
    .get(
      "/",
      async ({ query }) => {
        const { status, limit, page } = query;
        const parsedLimit = limit ? parseInt(limit) : 100;
        const pageNumber = page ? parseInt(page) : 1;

        try {
          let orders: OrderMapping[];
          let totalCount: number;

          if (status) {
            orders = await getOrderMappingsByStatus(
              status as OrderMapping["current_status"],
              parsedLimit,
            );
            totalCount = orders.length;
          } else if (page) {
            // Use pagination if page parameter is provided
            const pageSize = 10;
            orders = await getOrderHistory(pageNumber, pageSize);
            totalCount = await getOrderHistoryCount();
          } else {
            // Legacy behavior - use limit
            orders = await getOrderHistoryLegacy(parsedLimit);
            totalCount = orders.length;
          }

          // For legacy response when using limit, for pagination response when using page
          if (page || (!limit && !status)) {
            const pageSize = 10;
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
              orders: orders.map((order) => ({
                _rowid: order._rowid,
                site_order: order.site_order,
                crm_order: order.crm_order,
                status_history: order.status_history,
                current_status: order.current_status,
                created_at: order.created_at,
                updated_at: order.updated_at,
              })),
            };
          } else {
            // Legacy response format
            return {
              success: true,
              total: orders.length,
              orders: orders.map((order) => ({
                _rowid: order._rowid,
                site_order: order.site_order,
                crm_order: order.crm_order,
                status_history: order.status_history,
                current_status: order.current_status,
                created_at: order.created_at,
                updated_at: order.updated_at,
              })),
            };
          }
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
        }),
      },
    )
    .get(
      "/:page",
      async ({ params, query }) => {
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
            orders: orders.map((order) => ({
              _rowid: order._rowid,
              site_order: order.site_order,
              crm_order: order.crm_order,
              status_history: order.status_history,
              current_status: order.current_status,
              created_at: order.created_at,
              updated_at: order.updated_at,
            })),
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
    .get("/stats", async () => {
      try {
        const stats = await getHistoryStats();
        return {
          success: true,
          ...stats,
          formatted: {
            total: stats.total,
            oldestRecord: stats.oldestRecord
              ? new Date(stats.oldestRecord).toISOString()
              : null,
            newestRecord: stats.newestRecord
              ? new Date(stats.newestRecord).toISOString()
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
    .get("/clean", async ({ set }) => {
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
      const items: SiteOrder[] = [];

      for (let i = 0; i < Math.min(dlqCount, 100); i++) {
        const item = await redis.lindex(REDIS_KEYS.DEAD_LETTER_QUEUE, i);
        if (!item) continue;
        items.push(JSON.parse(item as string));
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

          const order: SiteOrder = JSON.parse(item as string);
          if (order.externalOrderId !== body.orderId) continue;

          await redis.lrem(REDIS_KEYS.DEAD_LETTER_QUEUE, 1, item);
          await redis.del(REDIS_KEYS.RETRY_COUNT(body.orderId));
          await redis.del(REDIS_KEYS.RETRY_AT(body.orderId));
          await redis.rpush(REDIS_KEYS.PENDING_QUEUE, item);

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
      // .use(historyRouter)
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

      // GET /health - статус черг
      .get("/health", async () => {
        const pendingCount = await redis.llen(REDIS_KEYS.PENDING_QUEUE);
        const processingCount = await redis.llen(REDIS_KEYS.PROCESSING_QUEUE);
        const dlqCount = await redis.llen(REDIS_KEYS.DEAD_LETTER_QUEUE);

        return {
          status: "healthy",
          queues: {
            pending: pendingCount,
            processing: processingCount,
            deadLetter: dlqCount,
          },
        };
      })

      .listen(CONFIG.WEBHOOK_PORT)
  );
}
