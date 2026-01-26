import redis from "./redis";
import { SDK } from "./sdk.generated";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder } from "./types";
import {
  calculateBackoff,
  convertSiteOrderToCRM,
  convertSiteOrderToPipelineCard,
  PAYMENT_MAPPING,
} from "./utils";

const api = new SDK("https://openapi.keycrm.app/v1", Bun.env["KEYCRM_KEY"]);

// Додавання замовлення в чергу
export async function enqueueOrder(order: SiteOrder): Promise<void> {
  const orderData = JSON.stringify(order);
  await redis.rpush(REDIS_KEYS.PENDING_QUEUE, orderData);
  console.log(`✅ Замовлення ${order.externalOrderId} додано в чергу`);
}

// Обробка замовлення
export async function processOrder(orderData: string): Promise<boolean> {
  const siteOrder: SiteOrder = JSON.parse(orderData);
  const orderId = siteOrder.externalOrderId;

  try {
    console.log(`🔄 Обробка замовлення ${orderId}...`);

    /*
      orderStatus → 0/1/2/3 (Cart/New/Sent/Delivered)
      paymentStatus → 0/1 (Not paid/Paid)
    */
    if (siteOrder.orderStatus == 0) {
      const crmOrderData = convertSiteOrderToPipelineCard(siteOrder);
      const result = await api.pipelines.createNewPipelineCard(crmOrderData);
      console.log(result);
    }
    if (siteOrder.orderStatus == 1) {
      const crmOrderData = convertSiteOrderToCRM(siteOrder);
      const result = await api.order.createNewOrder(crmOrderData);
      redis.set(siteOrder.externalOrderId, String(result.id));
      if (siteOrder.paymentStatus == 1 && result["id"]) {
        const orderId = String(result["id"]);
        const paymentMethodId = PAYMENT_MAPPING[siteOrder.paymentMethod];

        await api.order.createNewOrderPayment(orderId, {
          payment_method_id: paymentMethodId,
          payment_method: !paymentMethodId ? siteOrder.paymentMethod : undefined,
          amount: siteOrder.totalCost,
        });
      }
    }
    if (siteOrder.orderStatus == 2) {
      const orderId = await redis.get(siteOrder.externalOrderId);
      if (orderId) {
        api.order.updateExistingOrder(orderId, {
          status_id: 8,
        });
      }
    }
    if (siteOrder.orderStatus == 3) {
      const orderId = await redis.get(siteOrder.externalOrderId);
      if (orderId) {
        api.order.updateExistingOrder(orderId, {
          status_id: 9,
        });
      }
    }

    // Очищаємо лічильник повторів
    await redis.del(REDIS_KEYS.RETRY_COUNT(orderId));
    await redis.del(REDIS_KEYS.RETRY_AT(orderId));

    return true;
  } catch (error) {
    console.error(`❌ Помилка обробки замовлення ${orderId}:`, error);
    return false;
  }
}

// Обробка невдалого замовлення з retry логікою
export async function handleFailedOrder(orderData: string): Promise<void> {
  const siteOrder: SiteOrder = JSON.parse(orderData);
  const orderId = siteOrder.externalOrderId;

  // Отримуємо поточну кількість спроб
  const retryCountStr = await redis.get(REDIS_KEYS.RETRY_COUNT(orderId));
  const retryCount = retryCountStr ? parseInt(retryCountStr as string) : 0;

  if (retryCount >= CONFIG.MAX_RETRIES) {
    // Переміщаємо в Dead Letter Queue
    console.log(
      `💀 Замовлення ${orderId} переміщено в DLQ після ${retryCount} спроб`,
    );
    await redis.rpush(REDIS_KEYS.DEAD_LETTER_QUEUE, orderData);
    await redis.del(REDIS_KEYS.RETRY_COUNT(orderId));
    await redis.del(REDIS_KEYS.RETRY_AT(orderId));
    return;
  }

  // Збільшуємо лічильник спроб
  const newRetryCount = retryCount + 1;
  await redis.set(REDIS_KEYS.RETRY_COUNT(orderId), newRetryCount.toString());

  // Розраховуємо час наступної спроби
  const backoffMs = calculateBackoff(retryCount);
  const retryAt = Date.now() + backoffMs;
  await redis.set(REDIS_KEYS.RETRY_AT(orderId), retryAt.toString());

  // Повертаємо в чергу обробки
  await redis.rpush(REDIS_KEYS.PROCESSING_QUEUE, orderData);

  console.log(
    `🔁 Замовлення ${orderId} буде повторно оброблено через ${Math.round(backoffMs / 1000)}с (спроба ${newRetryCount}/${CONFIG.MAX_RETRIES})`,
  );
}
