import { CONFIG } from "./config";
import type { SiteOrder } from "./types";

// Розрахунок затримки з exponential backoff
export function calculateBackoff(retryCount: number): number {
  const backoff = Math.min(
    CONFIG.INITIAL_BACKOFF * Math.pow(CONFIG.BACKOFF_MULTIPLIER, retryCount),
    CONFIG.MAX_BACKOFF,
  );
  // Додаємо jitter (випадкову затримку) для уникнення thundering herd
  return backoff + Math.random() * 1000;
}

// Мапінг способів доставки
export const DELIVERY_MAPPING: Record<string, number> = {
  "Нова Пошта": 1,
  "Укрпошта": 2,
  "Самовивіз": 3,
  // Додайте інші за потреби
};

// Мапінг способів оплати
export const PAYMENT_MAPPING: Record<string, number> = {
  "LiqPay": 1,
  "WayForPay": 2,
  "Готівка": 3,
  // Додайте інші за потреби
};

// Конвертація замовлення з сайту в формат CRM
export function convertSiteOrderToCRM(siteOrder: SiteOrder) {
  const fullName = `${siteOrder.firstName} ${siteOrder.lastName}`.trim();

  return {
    source_id: CONFIG.SOURCE_ID,
    source_uuid: siteOrder.externalOrderId,
    buyer: {
      full_name: fullName,
      email: siteOrder.email,
      phone: siteOrder.phone,
    },
    grand_total: siteOrder.totalCost,
    total_discount: siteOrder.discount || 0,
    buyer_comment: siteOrder.additionalInfo || undefined,
    products: siteOrder.items.map((item) => ({
      name: item.name,
      sku: item.externalItemId.toString(),
      price: item.cost,
      price_sold: item.cost,
      quantity: item.quantity,
      picture: item.imageUrl,
      comment: item.description,
      // Якщо є знижка на конкретний товар, можна додати її тут
      // discount_amount: ...,
    })),
    shipping: {
      shipping_address_city: siteOrder.deliveryAddress ? extractCity(siteOrder.deliveryAddress) : undefined,
      shipping_receive_point: siteOrder.deliveryAddress || undefined,
      recipient_full_name: fullName, // ПІБ отримувача
      recipient_phone: siteOrder.phone,
      delivery_service_id: DELIVERY_MAPPING[siteOrder.deliveryMethod] || undefined,
    },
  };
}

export function convertSiteOrderToPipelineCard(order: SiteOrder) {
  const fullName = `${order.firstName} ${order.lastName}`.trim();
  const extraInfoParts: string[] = [];

  extraInfoParts.push(`Зовнішній ID замовлення: ${order.externalOrderId}`);
  extraInfoParts.push(`Зовнішній ID клієнта: ${order.externalCustomerId}`);
  extraInfoParts.push(`Статус замовлення (код): ${order.orderStatus}`);
  extraInfoParts.push(`Статус оплати (код): ${order.paymentStatus}`);

  if (order.statusDescription)
    extraInfoParts.push(`Опис статусу: ${order.statusDescription}`);

  if (order.deliveryMethod)
    extraInfoParts.push(`Спосіб доставки: ${order.deliveryMethod}`);

  if (order.deliveryAddress)
    extraInfoParts.push(`Адреса доставки: ${order.deliveryAddress}`);

  if (order.paymentMethod)
    extraInfoParts.push(`Спосіб оплати: ${order.paymentMethod}`);

  if (order.currency) extraInfoParts.push(`Валюта: ${order.currency}`);

  if (order.discount) extraInfoParts.push(`Знижка: ${order.discount}`);

  if (order.shipping)
    extraInfoParts.push(`Вартість доставки: ${order.shipping}`);

  if (order.additionalInfo)
    extraInfoParts.push(`Додаткова інформація: ${order.additionalInfo}`);

  return {
    pipeline_id: CONFIG.PIPELINE_ID, // Додаємо ID воронки
    source_id: CONFIG.SOURCE_ID,
    title: `Замовлення #${order.externalOrderId} (${fullName})`,
    communicate_at: new Date(order.date).toISOString(),

    manager_comment: extraInfoParts.join("\n"),

    contact: {
      full_name: fullName || undefined,
      email: order.email || undefined,
      phone: order.phone || undefined,
    },

    products: order.items.map((item) => ({
      sku: String(item.externalItemId),
      name: item.name,
      price: item.cost,
      quantity: item.quantity,
      picture: item.imageUrl || undefined,
    })),

    payments: [],

    custom_fields: [],
  };
}

// Простий парсер міста з адреси
export function extractCity(address: string): string {
  const match = address.match(/^([^,]+)/);
  return match ? (match[1] ? match[1].trim() : "") : "";
}

// Utility для затримки
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));
