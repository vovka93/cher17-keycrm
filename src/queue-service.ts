import redis from "./redis";
import { SDK } from "./sdk.generated";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder, OrderMapping } from "./types";
import {
  calculateBackoff,
  convertSiteOrderToCRM,
  convertSiteOrderToPipelineCard,
  validateSiteOrder,
  calculateOrderTotal,
} from "./utils";
import {
  createOrUpdateOrderMapping,
  addStatusToHistory,
} from "./order-mapping-service";

const api = new SDK("https://openapi.keycrm.app/v1", Bun.env["KEYCRM_KEY"]);

/**
 * Додавання замовлення в чергу обробки
 * Створює початковий запис в історії зі статусом 'pending'
 */
export async function enqueueOrder(order: SiteOrder): Promise<void> {
  // Валідація даних замовлення
  const validation = validateSiteOrder(order);
  if (!validation.isValid) {
    const errorMsg = `❌ Помилка валідації замовлення ${order.externalOrderId}: ${validation.errors.join(", ")}`;
    console.error(errorMsg);

    // Створюємо запис з помилкою
    await createOrUpdateOrderMapping(order, "failed");
    await addStatusToHistory(
      order.externalOrderId,
      "failed",
      undefined,
      errorMsg,
    );

    throw new Error(errorMsg);
  }

  // Перевірка суми замовлення
  const calculatedTotal = calculateOrderTotal(order);
  if (Math.abs(calculatedTotal - order.totalCost) > 0.01) {
    console.warn(
      `⚠️ Невідповідність суми в замовленні ${order.externalOrderId}: заявлено ${order.totalCost}, розраховано ${calculatedTotal}`,
    );
  }

  const orderData = JSON.stringify(order);
  await redis.rpush(REDIS_KEYS.PENDING_QUEUE, orderData);

  // Створюємо початковий запис в історії
  await createOrUpdateOrderMapping(order, "pending");

  console.log(`✅ Замовлення ${order.externalOrderId} додано в чергу`);
}

/**
 * Створення картки воронки продаж (лід)
 */
async function createPipelineCard(
  siteOrder: SiteOrder,
  orderId: string,
): Promise<void> {
  try {
    console.log(`🎯 Створення картки воронки для замовлення ${orderId}...`);

    const crmPipelineData = convertSiteOrderToPipelineCard(siteOrder);
    const crmResponse =
      await api.pipelines.createNewPipelineCard(crmPipelineData);

    console.log(`📋 Картка воронки створена:`, crmResponse);

    // Оновлюємо історію з відповіддю CRM
    await addStatusToHistory(orderId, "completed", crmResponse);
  } catch (error) {
    const errorMessage = `Помилка створення картки воронки: ${error instanceof Error ? error.message : error}`;
    console.error(`❌ ${errorMessage}`);

    await addStatusToHistory(orderId, "failed", undefined, errorMessage);
    throw error;
  }
}

/**
 * Створення нового замовлення в CRM
 */
async function createNewOrder(
  siteOrder: SiteOrder,
  orderId: string,
): Promise<void> {
  try {
    console.log(`🛒 Створення замовлення в CRM для ${orderId}...`);

    const crmOrderData = convertSiteOrderToCRM(siteOrder);
    const orderResponse = await api.order.createNewOrder(crmOrderData);
    const crmOrderId = String(orderResponse.id);

    // Зберігаємо зв'язок ID замовлення з CRM
    await redis.set(siteOrder.externalOrderId, crmOrderId);

    console.log(`📦 Замовлення створено в CRM з ID: ${crmOrderId}`);

    // Отримуємо повні дані замовлення з CRM
    let fullOrderData = orderResponse;
    try {
      fullOrderData = await api.order.getOrderById(crmOrderId);
    } catch (fetchError) {
      console.warn(`⚠️ Не вдалося отримати повні дані замовлення:`, fetchError);
      // Використовуємо базову відповідь, якщо повні дані недоступні
    }

    // Формуємо розширену відповідь для історії
    const enhancedCrmResponse = {
      ...fullOrderData,
      payment_method: siteOrder.paymentMethod,
      payment_amount: siteOrder.totalCost,
    };

    // Оновлюємо історію з повною відповіддю CRM
    await addStatusToHistory(orderId, "completed", enhancedCrmResponse);
  } catch (error) {
    const errorMessage = `Помилка створення замовлення: ${error instanceof Error ? error.message : error}`;
    console.error(`❌ ${errorMessage}`);

    await addStatusToHistory(orderId, "failed", undefined, errorMessage);
    throw error;
  }
}

/**
 * Оновлення статусу існуючого замовлення
 */
async function updateExistingOrder(
  siteOrder: SiteOrder,
  orderId: string,
  statusId: number,
): Promise<void> {
  try {
    // Отримуємо CRM ID замовлення
    const crmOrderId = (await redis.get(siteOrder.externalOrderId)) as string;

    if (!crmOrderId) {
      throw new Error(`CRM ID не знайдено для замовлення ${orderId}`);
    }

    console.log(
      `🔄 Оновлення статусу замовлення ${crmOrderId} на ${statusId}...`,
    );

    const updateResponse = await api.order.updateExistingOrder(crmOrderId, {
      status_id: statusId,
    });

    console.log(`✅ Статус замовлення оновлено:`, updateResponse);

    // Оновлюємо історію з відповіддю про оновлення
    await addStatusToHistory(orderId, "completed", updateResponse);
  } catch (error) {
    const errorMessage = `Помилка оновлення замовлення: ${error instanceof Error ? error.message : error}`;
    console.error(`❌ ${errorMessage}`);

    await addStatusToHistory(orderId, "failed", undefined, errorMessage);
    throw error;
  }
}

/**
 * Основна функція обробки замовлення
 * Розподіляє обробку залежно від типу статусу замовлення
 */
export async function processOrder(orderData: string): Promise<boolean> {
  const siteOrder: SiteOrder = JSON.parse(orderData);
  const orderId = siteOrder.externalOrderId;

  try {
    console.log(
      `🚀 Початок обробки замовлення ${orderId} (статус: ${siteOrder.orderStatus})`,
    );

    // Оновлюємо статус на 'processing'
    await addStatusToHistory(orderId, "processing");

    // Визначаємо тип обробки залежно від статусу замовлення
    /*
      orderStatus → 0/1/2/3 (Cart/New/Sent/Delivered)
      paymentStatus → 0/1 (Not paid/Paid)
    */
    switch (siteOrder.orderStatus) {
      case 0:
        // Створення картки воронки продаж (лід)
        await createPipelineCard(siteOrder, orderId);
        break;

      case 1:
        // Створення нового замовлення
        await createNewOrder(siteOrder, orderId);
        break;

      case 2:
        // Оновлення статусу на "Відправлено"
        await updateExistingOrder(siteOrder, orderId, 8); // status_id: 8 = Sent
        break;

      case 3:
        // Оновлення статусу на "Доставлено"
        await updateExistingOrder(siteOrder, orderId, 9); // status_id: 9 = Delivered
        break;

      default:
        throw new Error(
          `Невідомий статус замовлення: ${siteOrder.orderStatus}`,
        );
    }

    // Очищуємо лічильники повторних спроб
    await redis.del(REDIS_KEYS.RETRY_COUNT(orderId));
    await redis.del(REDIS_KEYS.RETRY_AT(orderId));

    console.log(`✅ Замовлення ${orderId} успішно оброблено`);
    return true;
  } catch (error) {
    const errorMessage = `Помилка обробки замовлення ${orderId}: ${error instanceof Error ? error.message : error}`;
    console.error(`❌ ${errorMessage}`);

    // Додаємо інформацію про помилку в історію
    await addStatusToHistory(orderId, "failed", undefined, errorMessage);

    return false;
  }
}

/**
 * Обробка невдалих замовлень з логікою повторних спроб
 */
export async function handleFailedOrder(orderData: string): Promise<void> {
  const siteOrder: SiteOrder = JSON.parse(orderData);
  const orderId = siteOrder.externalOrderId;

  // Отримуємо поточну кількість спроб
  const retryCountStr = await redis.get(REDIS_KEYS.RETRY_COUNT(orderId));
  const retryCount = retryCountStr ? parseInt(retryCountStr as string) : 0;

  if (retryCount >= CONFIG.MAX_RETRIES) {
    // Переміщаємо в Dead Letter Queue після максимальної кількості спроб
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

  // Розраховуємо час наступної спроби з експоненційною затримкою
  const backoffMs = calculateBackoff(retryCount);
  const retryAt = Date.now() + backoffMs;
  await redis.set(REDIS_KEYS.RETRY_AT(orderId), retryAt.toString());

  // Повертаємо в чергу обробки
  await redis.rpush(REDIS_KEYS.PROCESSING_QUEUE, orderData);

  console.log(
    `🔁 Замовлення ${orderId} буде повторно оброблено через ${Math.round(backoffMs / 1000)}с (спроба ${newRetryCount}/${CONFIG.MAX_RETRIES})`,
  );
}
