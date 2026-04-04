import redis from "./redis";
import { REDIS_KEYS } from "./config";

export async function recordWorkerHeartbeat(worker: string): Promise<void> {
  await redis.hset(REDIS_KEYS.WORKER_STATS(worker), "last_heartbeat_at", String(Date.now()));
}

export async function recordWorkerPoll(worker: string): Promise<void> {
  await redis.hincrby(REDIS_KEYS.WORKER_STATS(worker), "poll_count", 1);
  await recordWorkerHeartbeat(worker);
}

export async function recordWorkerEvent(
  worker: string,
  fields: Record<string, string | number | null | undefined>,
): Promise<void> {
  const normalized = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .flatMap(([key, value]) => [key, value == null ? "" : String(value)]);

  if (normalized.length > 0) {
    await redis.hset(REDIS_KEYS.WORKER_STATS(worker), ...normalized);
  }
  await recordWorkerHeartbeat(worker);
}

export async function incrementWorkerCounter(worker: string, field: string): Promise<void> {
  await redis.hincrby(REDIS_KEYS.WORKER_STATS(worker), field, 1);
  await recordWorkerHeartbeat(worker);
}

export async function getWorkerStats(worker: string): Promise<Record<string, string>> {
  const stats = await redis.hgetall(REDIS_KEYS.WORKER_STATS(worker));
  return (stats || {}) as Record<string, string>;
}
