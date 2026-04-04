import redis from "./redis";
import { CONFIG, REDIS_KEYS } from "./config";
import { processOrder, handleFailedOrder } from "./queue-service";
import { moveDueDelayedJobs } from "./delayed-queue";
import {
  incrementWorkerCounter,
  recordWorkerEvent,
  recordWorkerPoll,
} from "./worker-observability";

const ORDER_WORKER = "orders";

// Воркер обробки черги
export async function processQueue(): Promise<void> {
  let isProcessing = false;

  const processNextBatch = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      await recordWorkerPoll(ORDER_WORKER);
      const movedDelayed = await moveDueDelayedJobs(
        REDIS_KEYS.DELAYED_QUEUE,
        REDIS_KEYS.PROCESSING_QUEUE,
        20,
      );
      if (movedDelayed > 0) {
        await recordWorkerEvent(ORDER_WORKER, { last_moved_delayed: movedDelayed });
      }

      const orderData = await redis.lpop(REDIS_KEYS.PENDING_QUEUE)
        || await redis.lpop(REDIS_KEYS.PROCESSING_QUEUE);

      if (!orderData) {
        await recordWorkerEvent(ORDER_WORKER, { last_result: "idle" });
        return;
      }

      const success = await processOrder(orderData as string);
      if (!success) {
        await incrementWorkerCounter(ORDER_WORKER, "failed_jobs");
        await handleFailedOrder(orderData as string);
        await recordWorkerEvent(ORDER_WORKER, { last_result: "retry_or_dlq" });
        return;
      }

      await incrementWorkerCounter(ORDER_WORKER, "processed_jobs");
      await recordWorkerEvent(ORDER_WORKER, { last_result: "processed" });
    } catch (error) {
      console.error("Помилка в воркері черги:", error);
      await incrementWorkerCounter(ORDER_WORKER, "worker_errors");
      await recordWorkerEvent(ORDER_WORKER, {
        last_result: "error",
        last_error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isProcessing = false;
    }
  };

  setInterval(processNextBatch, CONFIG.PROCESSING_INTERVAL);
}
