import { Elysia, t } from "elysia";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder, OrderMapping } from "./types";
import { enqueueOrder } from "./queue-service";
import {
  getOrderHistory,
  getOrderMappingsByStatus,
  cleanHistory,
  getHistoryStats,
} from "./order-mapping-service";
import redis from "./redis";

export function createWebhookServer() {
  return (
    new Elysia()
      .get(
        "/history",
        async ({ query }) => {
          const { status, limit } = query;
          const parsedLimit = limit ? parseInt(limit) : 100;

          try {
            let orders: OrderMapping[];

            if (status) {
              orders = await getOrderMappingsByStatus(
                status as OrderMapping["current_status"],
              );
            } else {
              orders = await getOrderHistory(parsedLimit);
            }

            return {
              success: true,
              total: orders.length,
              orders: orders.map((order) => ({
                _rowid: order._rowid,
                site_order: order.site_order,
                crm_order: order.crm_order,
                crm_pipeline_card: order.crm_pipeline_card,
                status_history: order.status_history,
                current_status: order.current_status,
                created_at: order.created_at,
                updated_at: order.updated_at,
              })),
            };
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
          }),
        },
      )
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

      // GET /history/stats - get history statistics
      .get("/history/stats", async () => {
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

      // POST /history/clean - clean history with various options
      .post(
        "/history/clean",
        async ({ body, set }) => {
          // Require confirmation for destructive operations
          if (body.confirm !== "DELETE_HISTORY") {
            set.status = 400;
            return {
              success: false,
              error: "Confirmation required. Add confirm: 'DELETE_HISTORY' to proceed."
            };
          }

          try {
            const result = await cleanHistory({
              olderThan: body.olderThan,
              status: body.status,
              dryRun: body.dryRun || false,
            });

            return {
              success: true,
              ...result,
              message: body.dryRun
                ? `Dry run: ${result.toDelete} items would be deleted`
                : `Successfully deleted ${result.deleted} out of ${result.toDelete} items`,
            };
          } catch (error) {
            console.error("Error cleaning history:", error);
            set.status = 500;
            return {
              success: false,
              error: "Failed to clean history",
            };
          }
        },
        {
          body: t.Object({
            confirm: t.Literal('DELETE_HISTORY'),
            dryRun: t.Optional(t.Boolean()),
            olderThan: t.Optional(t.Number()),
            status: t.Optional(t.Array(t.Union([
              t.Literal('pending'), 
              t.Literal('processing'), 
              t.Literal('completed'), 
              t.Literal('failed')
            ])))
          }),
        },
      )

      // GET /dlq - перегляд Dead Letter Queue
      .get("/dlq", async () => {
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

      // POST /dlq/retry - повторна обробка замовлення з DLQ
      .post(
        "/dlq/retry",
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
      )

      .listen(CONFIG.WEBHOOK_PORT)
  );
}
