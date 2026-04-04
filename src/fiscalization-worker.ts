import redis from "./redis";
import { CONFIG, REDIS_KEYS } from "./config";
import { processFiscalizationWatchItem } from "./fiscalization-service";
import { moveDueDelayedJobs } from "./delayed-queue";
import {
  incrementWorkerCounter,
  recordWorkerEvent,
  recordWorkerPoll,
} from "./worker-observability";

const FISCALIZATION_WORKER = "fiscalization";

export async function processFiscalizationQueue(): Promise<void> {
  let isProcessing = false;

  const processNext = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      await recordWorkerPoll(FISCALIZATION_WORKER);
      const movedDelayed = await moveDueDelayedJobs(
        REDIS_KEYS.FISCALIZATION_DELAYED_QUEUE,
        REDIS_KEYS.FISCALIZATION_QUEUE,
        20,
      );
      if (movedDelayed > 0) {
        await recordWorkerEvent(FISCALIZATION_WORKER, { last_moved_delayed: movedDelayed });
      }

      const item = await redis.lpop(REDIS_KEYS.FISCALIZATION_QUEUE);
      if (!item) {
        await recordWorkerEvent(FISCALIZATION_WORKER, { last_result: "idle" });
        return;
      }

      await processFiscalizationWatchItem(String(item));
      await incrementWorkerCounter(FISCALIZATION_WORKER, "processed_jobs");
      await recordWorkerEvent(FISCALIZATION_WORKER, { last_result: "processed" });
    } catch (error) {
      console.error("Помилка fiscalization worker:", error);
      await incrementWorkerCounter(FISCALIZATION_WORKER, "worker_errors");
      await recordWorkerEvent(FISCALIZATION_WORKER, {
        last_result: "error",
        last_error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      isProcessing = false;
    }
  };

  setInterval(processNext, CONFIG.FISCALIZATION_PROCESSING_INTERVAL);
}
