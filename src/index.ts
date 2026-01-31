import { createWebhookServer } from "./webhook-server";
import { processQueue } from "./queue-worker";

const app = createWebhookServer();

console.log(
  `🚀 Webhook сервер запущено на http://localhost:${app.server?.port}`,
);

processQueue();
