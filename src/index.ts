import { createWebhookServer } from "./webhook-server";
import { processQueue } from "./queue-worker";

// Запускаємо вебхук сервер
const app = createWebhookServer();

console.log(
  `🚀 Webhook сервер запущено на http://localhost:${app.server?.port}`,
);

console.log(`📋 Endpoints:`);
console.log(`   POST /webhook - прийом замовлень з сайту`);
console.log(`   GET  /health - статус черг`);
console.log(`   GET  /dlq - перегляд Dead Letter Queue`);

// Запускаємо воркер обробки черги
processQueue();
