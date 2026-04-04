import redis from "./redis";

export async function enqueueDelayed(
  queueKey: string,
  item: string,
  runAtMs: number,
): Promise<void> {
  await redis.zadd(queueKey, runAtMs, item);
}

export async function moveDueDelayedJobs(
  delayedQueueKey: string,
  targetQueueKey: string,
  limit: number = 20,
): Promise<number> {
  const now = Date.now();
  const items = await redis.zrangebyscore(delayedQueueKey, 0, now, "LIMIT", 0, limit);
  if (!items || items.length === 0) {
    return 0;
  }

  let moved = 0;
  for (const item of items) {
    const removed = await redis.zrem(delayedQueueKey, item as string);
    if (removed) {
      await redis.rpush(targetQueueKey, item as string);
      moved += 1;
    }
  }

  return moved;
}

export async function removeDelayedJob(
  delayedQueueKey: string,
  item: string,
): Promise<void> {
  await redis.zrem(delayedQueueKey, item);
}

export async function getNextDelayedRunAt(
  delayedQueueKey: string,
): Promise<number | null> {
  const result = await redis.zrange(delayedQueueKey, 0, 0, "WITHSCORES");
  if (!result || result.length < 2) return null;
  return Number(result[1]);
}

export async function getDelayedQueueCount(delayedQueueKey: string): Promise<number> {
  return await redis.zcard(delayedQueueKey);
}
