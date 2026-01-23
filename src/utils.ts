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

// Конвертація замовлення з сайту в формат CRM
export function convertSiteOrderToCRM(siteOrder: SiteOrder) {
  return {
    source_id: 2, // ID джерела (сайт)
    source_uuid: siteOrder.externalOrderId,
    buyer: {
      full_name: `${siteOrder.firstName} ${siteOrder.lastName}`.trim(),
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
    })),
    shipping: siteOrder.deliveryAddress
      ? {
          shipping_address_city: extractCity(siteOrder.deliveryAddress),
          shipping_receive_point: siteOrder.deliveryAddress,
        }
      : undefined,
  };
}

export function convertSiteOrderToPipelineCard(order: SiteOrder) {
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
    title: `Замовлення #${order.externalOrderId}`,
    communicate_at: new Date(order.date).toISOString(),

    manager_comment: extraInfoParts.join("\n"),

    contact: {
      full_name: `${order.firstName} ${order.lastName}`.trim() || undefined,
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
