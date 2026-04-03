import redis from "./redis";
import { CONFIG, REDIS_KEYS } from "./config";
import { processFiscalizationWatchItem } from "./fiscalization-service";

export async function processFiscalizationQueue(): Promise<void> {
  let isProcessing = false;

  const processNext = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const item = await redis.lpop(REDIS_KEYS.FISCALIZATION_QUEUE);
      if (!item) return;

      await processFiscalizationWatchItem(String(item));
    } catch (error) {
      console.error("Помилка fiscalization worker:", error);
    } finally {
      isProcessing = false;
    }
  };

  setInterval(processNext, CONFIG.FISCALIZATION_PROCESSING_INTERVAL);
}
