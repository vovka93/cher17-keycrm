import redis from "./redis";
import { SDK } from "./sdk.generated";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder, OrderMapping } from "./types";
import {
  calculateBackoff,
  convertSiteOrderToCRM,
  convertSiteOrderToPipelineCard,
  createLeadDedupHash,
  validateSiteOrder,
  calculateOrderTotal,
} from "./utils";
import {
  createOrUpdateOrderMapping,
  addStatusToHistory,
} from "./order-mapping-service";

const api = new SDK("https://openapi.keycrm.app/v1", Bun.env["KEYCRM_KEY"]);

function shouldDelayLeadCreation(order: SiteOrder): boolean {
  return Number(order.orderStatus) === 0 && Number(order.paymentStatus) !== 1;
}

async function findExistingCrmOrderIdBySourceUuid(
  sourceUuid: string,
): Promise<string | null> {
  try {
    const res: any = await api.order.getOrdersBySourceUuid(sourceUuid);
    const orders: any[] = Array.isArray(res?.data)
      ? res.data
      : Array.isArray(res?.orders)
        ? res.orders
        : Array.isArray(res)
          ? res
          : [];

    const match = orders.find((o) => String(o?.source_uuid) === String(sourceUuid));
    const id = match?.id;
    return id != null ? String(id) : null;
  } catch (e) {
    // Якщо пошук не вдався - не блокуємо створення, просто йдемо далі
    return null;
  }
}

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

  if (shouldDelayLeadCreation(order)) {
    const retryAt = Date.now() + CONFIG.LEAD_DELAY_MS;
    await redis.set(REDIS_KEYS.RETRY_AT(order.externalOrderId), retryAt.toString());
    await redis.rpush(REDIS_KEYS.PROCESSING_QUEUE, orderData);

    // Створюємо початковий запис в історії
    await createOrUpdateOrderMapping(order, "pending");
    await addStatusToHistory(
      order.externalOrderId,
      "pending",
      undefined,
      `Створення ліда відкладено на ${Math.round(CONFIG.LEAD_DELAY_MS / 60000)} хвилин — чекаємо можливу оплату`,
    );

    console.log(`⏳ Лід-кандидат ${order.externalOrderId} відкладено на ${Math.round(CONFIG.LEAD_DELAY_MS / 60000)} хвилин`);
    return;
  }

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
  let leadHashKey: string | null = null;
  try {
    console.log(`🎯 Створення картки воронки для замовлення ${orderId}...`);

    // Оплачені замовлення не мають потрапляти в ліди
    if (Number(siteOrder.paymentStatus) === 1) {
      const message = `💡 Замовлення ${orderId} оплачене, пропускаємо створення ліда.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", { message });
      return;
    }

    // Якщо замовлення вже існує в CRM, лід не створюємо
    const existingCrmOrderId = (await redis.get(
      siteOrder.externalOrderId,
    )) as string | null;
    if (existingCrmOrderId) {
      const message = `💡 Замовлення ${orderId} вже існує в CRM (ID: ${existingCrmOrderId}), пропускаємо створення ліда.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        orderId: existingCrmOrderId,
      });
      return;
    }

    const foundCrmOrderId = await findExistingCrmOrderIdBySourceUuid(orderId);
    if (foundCrmOrderId) {
      await redis.set(siteOrder.externalOrderId, foundCrmOrderId);
      const message = `💡 Замовлення ${orderId} знайдено в CRM (ID: ${foundCrmOrderId}), пропускаємо створення ліда.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        orderId: foundCrmOrderId,
      });
      return;
    }

    const leadHash = createLeadDedupHash(siteOrder);
    leadHashKey = REDIS_KEYS.LEAD_HASH(leadHash);
    const acquired = (await redis.setnx(leadHashKey, orderId)) === 1;
    if (!acquired) {
      const message = `♻️ Дубль ліда, пропускаємо створення картки для ${orderId}.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        lead_hash: leadHash,
      });
      return;
    }

    const crmPipelineData = convertSiteOrderToPipelineCard(siteOrder);
    const crmResponse =
      await api.pipelines.createNewPipelineCard(crmPipelineData);

    console.log(`📋 Картка воронки створена:`, crmResponse);

    // Оновлюємо історію з відповіддю CRM
    await addStatusToHistory(orderId, "completed", crmResponse);
  } catch (error) {
    const errorMessage = `Помилка створення картки воронки: ${error instanceof Error ? error.message : error}`;
    console.error(`❌ ${errorMessage}`);

    if (leadHashKey) {
      await redis.del(leadHashKey);
    }

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
  let orderProcessedKey: string | null = null;
  let createLockKey: string | null = null;
  try {
    console.log(`🛒 Створення замовлення в CRM для ${orderId}...`);

    // Якщо CRM ID вже є в Redis, значить замовлення вже створено (навіть якщо подія прийшла з іншим orderStatus)
    const existingCrmOrderId = (await redis.get(
      siteOrder.externalOrderId,
    )) as string | null;
    if (existingCrmOrderId) {
      const message = `♻️ Замовлення вже існує в CRM (ID: ${existingCrmOrderId}), пропускаємо створення для ${orderId}.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        orderId: existingCrmOrderId,
      });
      return;
    }

    // Якщо Redis мапінг загубився (падіння між create та set), спробуємо знайти по source_uuid в CRM
    const foundCrmOrderId = await findExistingCrmOrderIdBySourceUuid(orderId);
    if (foundCrmOrderId) {
      await redis.set(siteOrder.externalOrderId, foundCrmOrderId);
      const message = `♻️ Замовлення вже існує в CRM (ID: ${foundCrmOrderId}), відновили мапінг і пропускаємо створення для ${orderId}.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        orderId: foundCrmOrderId,
      });
      return;
    }

    // Додатковий захист від дублювання створення (на випадок повторних вебхуків/ретраїв)
    createLockKey = `orders:create_lock:${orderId}`;
    const lockAcquired = (await redis.setnx(createLockKey, "1")) === 1;
    if (lockAcquired) {
      await redis.expire(createLockKey, 300);
    }
    if (!lockAcquired) {
      const message = `🔒 Створення замовлення ${orderId} вже запущено, пропускаємо дубль.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", { message });
      return;
    }

    orderProcessedKey = REDIS_KEYS.ORDER_PROCESSED(orderId, siteOrder.orderStatus);
    const existingOrder = await redis.get(orderProcessedKey);

    if (existingOrder) {
      const message = `♻️ Дубль замовлення, пропускаємо створення для ${orderId}.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        orderId: existingOrder,
      });
      return;
    }

    await redis.set(orderProcessedKey, "processing");

    const crmOrderData = convertSiteOrderToCRM(siteOrder);
    const orderResponse = await api.order.createNewOrder(crmOrderData);

    if (!orderResponse.id) {
      if (orderProcessedKey) {
        await redis.del(orderProcessedKey);
      }
      await addStatusToHistory(orderId, "failed", orderResponse);
      return;
    }

    const { id } = orderResponse;
    const crmOrderId = String(id);

    // Зберігаємо зв'язок ID замовлення з CRM
    await redis.set(siteOrder.externalOrderId, crmOrderId);
    await redis.set(orderProcessedKey!, crmOrderId);

    console.log(`📦 Замовлення створено в CRM з ID: ${crmOrderId}`);

    // Отримуємо повні дані замовлення з CRM
    let fullOrderData = orderResponse;
    try {
      fullOrderData = await api.order.getOrderById(crmOrderId);
    } catch (fetchError) {
      console.warn(`⚠️ Не вдалося отримати повні дані замовлення:`, fetchError);
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

    if (orderProcessedKey) {
      await redis.del(orderProcessedKey);
    }

    if (createLockKey) {
      await redis.del(createLockKey);
    }

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
  let orderProcessedKey: string | null = null;
  try {
    // Отримуємо CRM ID замовлення
    const crmOrderId = (await redis.get(siteOrder.externalOrderId)) as string;

    if (!crmOrderId) {
      throw new Error(`CRM ID не знайдено для замовлення ${orderId}`);
    }

    orderProcessedKey = REDIS_KEYS.ORDER_PROCESSED(orderId, siteOrder.orderStatus);
    const existingUpdate = await redis.get(orderProcessedKey);

    if (existingUpdate) {
      const message = `♻️ Дубль оновлення статусу, пропускаємо для ${orderId}.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        statusId: existingUpdate,
      });
      return;
    }

    await redis.set(orderProcessedKey, String(statusId));

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

    if (orderProcessedKey) {
      await redis.del(orderProcessedKey);
    }

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
  const lockKey = REDIS_KEYS.ORDER_LOCK(orderId);

  const orderStatus = Number(siteOrder.orderStatus);
  const paymentStatus = Number(siteOrder.paymentStatus);

  let lockAcquired = false;

  try {
    lockAcquired = (await redis.setnx(lockKey, "1")) === 1;
    if (lockAcquired) {
      await redis.expire(lockKey, 30);
    }

    if (!lockAcquired) {
      console.log(`🔒 Замовлення ${orderId} вже обробляється іншим воркером, пропускаємо`);
      return true;
    }

    console.log(
      `🚀 Початок обробки замовлення ${orderId} (статус: ${orderStatus}, оплата: ${paymentStatus})`,
    );

    // Оновлюємо статус на 'processing'
    await addStatusToHistory(orderId, "processing");

    // Визначаємо тип обробки залежно від статусу замовлення
    /*
      orderStatus → 0/1/2/3 (Cart/New/Sent/Delivered)
      paymentStatus → 0/1 (Not paid/Paid)
    */
    switch (orderStatus) {
      case 0:
        if (paymentStatus === 1) {
          // Оплачені замовлення не мають потрапляти в ліди
          await createNewOrder(siteOrder, orderId);
        } else {
          // Створення картки воронки продаж (лід)
          await createPipelineCard(siteOrder, orderId);
        }
        break;

      case 1:
        // Створення нового замовлення
        await createNewOrder(siteOrder, orderId);
        break;

      case 2:
        // Оновлення статусу на "Відправлено"
        await updateExistingOrder(siteOrder, orderId, 9); // status_id: 9 = Sent
        break;

      case 3:
        // Оновлення статусу на "Доставлено"
        await updateExistingOrder(siteOrder, orderId, 21); // status_id: 21 = Delivered
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
  } finally {
    if (lockAcquired) {
      await redis.del(lockKey);
    }
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
