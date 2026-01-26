export const CONFIG = {
  MAX_RETRIES: 5,
  INITIAL_BACKOFF: 1000, // 1 секунда
  MAX_BACKOFF: 60000, // 1 хвилина
  BACKOFF_MULTIPLIER: 2,
  WEBHOOK_PORT: 3000,
  PROCESSING_INTERVAL: 5000, // Перевірка черги кожні 5 секунд

  // KeyCRM IDs
  SOURCE_ID: Number(Bun.env["KEYCRM_SOURCE_ID"] || 2),
  PIPELINE_ID: Number(Bun.env["KEYCRM_PIPELINE_ID"] || 1), // ID воронки для лідів
};

export const REDIS_KEYS = {
  PENDING_QUEUE: "orders:pending",
  PROCESSING_QUEUE: "orders:processing",
  DEAD_LETTER_QUEUE: "orders:dlq",
  RETRY_COUNT: (orderId: string) => `orders:retry:${orderId}`,
  RETRY_AT: (orderId: string) => `orders:retry_at:${orderId}`,
};
