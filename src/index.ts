import { createWebhookServer } from "./webhook-server";
import { processQueue } from "./queue-worker";
import { processFiscalizationQueue } from "./fiscalization-worker";

const app = createWebhookServer();

console.log(
  `🚀 Webhook сервер запущено на http://localhost:${app.server?.port}`,
);

processQueue();
processFiscalizationQueue();
