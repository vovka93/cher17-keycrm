import { Elysia, t } from "elysia";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder } from "./types";
import { enqueueOrder } from "./queue-service";
import redis from "./redis";

export function createWebhookServer() {
  return (
    new Elysia()
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
