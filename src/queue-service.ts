import redis from "./redis";
import { SDK } from "./sdk.generated";
import { CONFIG, REDIS_KEYS } from "./config";
import type { SiteOrder, OrderMapping } from "./types";
import {
  calculateBackoff,
  convertSiteOrderToCRM,
  convertSiteOrderToPipelineCard,
  createLeadDedupHash,
  formatPhoneNumber,
  validateSiteOrder,
  calculateOrderTotal,
} from "./utils";
import {
  createOrUpdateOrderMapping,
  addStatusToHistory,
  getOrderMapping,
} from "./order-mapping-service";

const api = new SDK("https://openapi.keycrm.app/v1", Bun.env["KEYCRM_KEY"]);
const DUPLICATE_LEAD_STATUS_ID = 45;
const LEAD_SEARCH_PAGE_SIZE = 50;
const LEAD_SEARCH_MAX_PAGES = 5;

function shouldDelayLeadCreation(order: SiteOrder): boolean {
  return Number(order.orderStatus) === 0 && Number(order.paymentStatus) !== 1;
}

function getCrmOrderIdKey(orderId: string): string {
  return REDIS_KEYS.CRM_ORDER_ID(orderId);
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

function normalizeDigits(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function getPipelineCardIdFromCrmResponse(crmResponse: any): string | null {
  if (!crmResponse || typeof crmResponse !== "object") return null;
  const id = crmResponse.id;
  const hasPipelineCardShape =
    crmResponse.contact_id != null ||
    crmResponse.contact?.id != null ||
    crmResponse.target_type != null;
  if (!hasPipelineCardShape || id == null) return null;
  return String(id);
}

async function findDuplicateLeadCardByApi(
  siteOrder: SiteOrder,
  orderId: string,
): Promise<any | null> {
  const orderRef = String(orderId).toLowerCase();
  const targetPhone = normalizeDigits(formatPhoneNumber(siteOrder.phone ?? ""));
  const targetEmail = normalizeEmail(siteOrder.email);

  for (let page = 1; page <= LEAD_SEARCH_MAX_PAGES; page++) {
    const response = await api.pipelines.getPaginatedListOfPipelinesCards({
      limit: LEAD_SEARCH_PAGE_SIZE,
      page,
      include: "contact.client,status",
    });
    const cards: any[] = Array.isArray(response?.data)
      ? response.data
      : Array.isArray(response)
        ? response
        : [];

    if (cards.length === 0) {
      return null;
    }

    const matched = cards.find((card) => {
      if (!card || card.id == null) return false;

      const targetType = String(card.target_type ?? "").toLowerCase();
      if (targetType === "order") return false;

      const title = String(card.title ?? "").toLowerCase();
      const managerComment = String(card.manager_comment ?? "").toLowerCase();
      const byOrderRef = orderRef.length > 0 &&
        (title.includes(orderRef) || managerComment.includes(orderRef));

      const contactPhone = normalizeDigits(
        card.contact?.phone ?? card.contact?.client?.phone ?? "",
      );
      const contactEmail = normalizeEmail(
        card.contact?.email ?? card.contact?.client?.email ?? "",
      );
      const byPhone = targetPhone.length > 0 && contactPhone === targetPhone;
      const byEmail = targetEmail.length > 0 && contactEmail === targetEmail;

      return byOrderRef || byPhone || byEmail;
    });

    if (matched) {
      return matched;
    }

    if (cards.length < LEAD_SEARCH_PAGE_SIZE) {
      return null;
    }
  }

  return null;
}

async function moveDuplicateLeadToPaidStatus(
  siteOrder: SiteOrder,
  orderId: string,
): Promise<void> {
  if (Number(siteOrder.paymentStatus) !== 1) {
    return;
  }

  // Спочатку пробуємо знайти лід із локального mapping для цього замовлення.
  const existingMapping = await getOrderMapping(orderId);
  const mappedCardId = getPipelineCardIdFromCrmResponse(existingMapping?.crm_order);

  let leadCard: any | null = null;
  if (mappedCardId) {
    leadCard = await api.pipelines.getPipelinesCard(mappedCardId);
  } else {
    leadCard = await findDuplicateLeadCardByApi(siteOrder, orderId);
  }

  if (!leadCard || leadCard.id == null) {
    console.log(`ℹ️ Для оплаченого замовлення ${orderId} не знайдено дубль-лід.`);
    return;
  }

  const leadCardId = String(leadCard.id);
  const currentStatusId = Number(leadCard.status_id);

  if (currentStatusId === DUPLICATE_LEAD_STATUS_ID) {
    console.log(
      `ℹ️ Лід-дубль ${leadCardId} для замовлення ${orderId} вже має status_id=${DUPLICATE_LEAD_STATUS_ID}.`,
    );
    return;
  }

  await api.pipelines.updatePipelinesCard(leadCardId, {
    status_id: DUPLICATE_LEAD_STATUS_ID,
  });

  console.log(
    `✅ Лід-дубль ${leadCardId} переведено у status_id=${DUPLICATE_LEAD_STATUS_ID} для замовлення ${orderId}.`,
  );
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

  if (!shouldDelayLeadCreation(order)) {
    await redis.del(REDIS_KEYS.RETRY_AT(order.externalOrderId));
  }

  if (shouldDelayLeadCreation(order)) {
    const retryAt = Date.now() + CONFIG.LEAD_DELAY_MS;
    await redis.set(REDIS_KEYS.RETRY_AT(order.externalOrderId), retryAt.toString());
    await redis.rpush(REDIS_KEYS.PROCESSING_QUEUE, orderData);

    // Створюємо початковий запис в історії
    await createOrUpdateOrderMapping(order, "pending");

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
      getCrmOrderIdKey(siteOrder.externalOrderId),
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
      await redis.set(getCrmOrderIdKey(siteOrder.externalOrderId), foundCrmOrderId);
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
    if (acquired) {
      await redis.expire(leadHashKey, CONFIG.LEAD_HASH_TTL_SEC);
    }
    if (!acquired) {
      const message = `♻️ Дубль ліда, пропускаємо створення картки для ${orderId}.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", {
        message,
        lead_hash: leadHash,
      });
      return;
    }

    const crmMappingBeforeCreate = await redis.get(getCrmOrderIdKey(siteOrder.externalOrderId));
    if (crmMappingBeforeCreate) {
      const message = `💡 Перед створенням ліда вже з'явився CRM mapping (${crmMappingBeforeCreate}), пропускаємо.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", { message, orderId: crmMappingBeforeCreate });
      return;
    }

    const sourceUuidOrderBeforeCreate = await findExistingCrmOrderIdBySourceUuid(orderId);
    if (sourceUuidOrderBeforeCreate) {
      await redis.set(getCrmOrderIdKey(siteOrder.externalOrderId), sourceUuidOrderBeforeCreate);
      const message = `💡 Перед створенням ліда замовлення вже знайдено в CRM (${sourceUuidOrderBeforeCreate}), пропускаємо.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", { message, orderId: sourceUuidOrderBeforeCreate });
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

    if (Number(siteOrder.paymentStatus) === 1) {
      await moveDuplicateLeadToPaidStatus(siteOrder, orderId);
    }

    // Якщо CRM ID вже є в Redis, значить замовлення вже створено (навіть якщо подія прийшла з іншим orderStatus)
    const existingCrmOrderId = (await redis.get(
      getCrmOrderIdKey(siteOrder.externalOrderId),
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
      await redis.set(getCrmOrderIdKey(siteOrder.externalOrderId), foundCrmOrderId);
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
      await redis.expire(createLockKey, CONFIG.CREATE_LOCK_TTL_SEC);
    }
    if (!lockAcquired) {
      const message = `🔒 Створення замовлення ${orderId} вже запущено, пропускаємо дубль.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", { message });
      return;
    }

    const crmMappingBeforeCreate = await redis.get(getCrmOrderIdKey(siteOrder.externalOrderId));
    if (crmMappingBeforeCreate) {
      const message = `♻️ Після взяття create-lock уже є CRM mapping (${crmMappingBeforeCreate}), створення не потрібне.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", { message, orderId: crmMappingBeforeCreate });
      return;
    }

    const sourceUuidOrderBeforeCreate = await findExistingCrmOrderIdBySourceUuid(orderId);
    if (sourceUuidOrderBeforeCreate) {
      await redis.set(getCrmOrderIdKey(siteOrder.externalOrderId), sourceUuidOrderBeforeCreate);
      const message = `♻️ Після взяття create-lock замовлення вже знайдено в CRM (${sourceUuidOrderBeforeCreate}), створення не потрібне.`;
      console.log(message);
      await addStatusToHistory(orderId, "completed", { message, orderId: sourceUuidOrderBeforeCreate });
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
    await redis.expire(orderProcessedKey, CONFIG.PROCESSED_MARKER_TTL_SEC);

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
    await redis.set(getCrmOrderIdKey(siteOrder.externalOrderId), crmOrderId);
    await redis.set(REDIS_KEYS.CRM_ORDER_SITE_ORDER_ID(crmOrderId), siteOrder.externalOrderId);
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
    const crmOrderId = (await redis.get(getCrmOrderIdKey(siteOrder.externalOrderId))) as string;

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
    await redis.expire(orderProcessedKey, CONFIG.PROCESSED_MARKER_TTL_SEC);

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

async function syncPaidStatusOnce(
  siteOrder: SiteOrder,
  orderId: string,
): Promise<void> {
  const paidStatusSyncKey = REDIS_KEYS.ORDER_PAID_STATUS_SYNCED(orderId);
  const alreadySynced = await redis.get(paidStatusSyncKey);

  if (alreadySynced) {
    const message = `💡 Paid status для замовлення ${orderId} вже синхронізували раніше, повторний апдейт не потрібен.`;
    console.log(message);
    await addStatusToHistory(orderId, "completed", {
      message,
      statusId: Number(alreadySynced),
    });
    return;
  }

  await updateExistingOrder(siteOrder, orderId, 4);
  await redis.set(paidStatusSyncKey, "4");
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
      await redis.expire(lockKey, CONFIG.ORDER_LOCK_TTL_SEC);
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
        // Статус "Відправлено" більше не синхронізуємо в CRM автоматично.
        break;

      case 3:
        // Статус "Доставлено" більше не синхронізуємо в CRM автоматично.
        break;

      default:
        throw new Error(
          `Невідомий статус замовлення: ${siteOrder.orderStatus}`,
        );
    }

    if (orderStatus > 1 && paymentStatus === 1) {
      await syncPaidStatusOnce(siteOrder, orderId);
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
