import redis from "./redis";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder } from "./types";
import { processOrder, handleFailedOrder } from "./queue-service";

// Воркер обробки черги
export async function processQueue(): Promise<void> {
  const processNextBatch = async () => {
    try {
      const orderData = await redis.lpop(REDIS_KEYS.PENDING_QUEUE);

      // Якщо немає нових — пробуємо processing
      if (!orderData) {
        const processingOrder = await redis.lpop(REDIS_KEYS.PROCESSING_QUEUE);
        if (!processingOrder) return;

        const siteOrder: SiteOrder = JSON.parse(processingOrder as string);
        const orderId = siteOrder.externalOrderId;
        const retryAtStr = await redis.get(REDIS_KEYS.RETRY_AT(orderId));
        if (!retryAtStr) return;

        const retryAt = parseInt(retryAtStr as string);
        if (Date.now() < retryAt) {
          await redis.rpush(REDIS_KEYS.PROCESSING_QUEUE, processingOrder);
          return;
        }

        const success = await processOrder(processingOrder as string);
        if (!success) await handleFailedOrder(processingOrder as string);
        return;
      }

      const success = await processOrder(orderData as string);
      if (!success) await handleFailedOrder(orderData as string);
    } catch (error) {
      console.error("Помилка в воркері черги:", error);
    }
  };

  setInterval(processNextBatch, CONFIG.PROCESSING_INTERVAL);
}
