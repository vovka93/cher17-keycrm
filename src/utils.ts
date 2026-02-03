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
  const shippingData = parseShippingAddress(
    siteOrder.deliveryAddress,
    siteOrder.deliveryMethod,
  );
  let discount =
    siteOrder.discount && siteOrder.discount > 0
      ? siteOrder.discount
      : undefined;
  return {
    source_id: 2, // ID джерела (сайт)
    source_uuid: siteOrder.externalOrderId,
    buyer_comment: siteOrder.additionalInfo || undefined,
    ordered_at: new Date(siteOrder.date)
      .toISOString()
      .replace("T", " ")
      .substring(0, 19),
    buyer: {
      full_name: `${siteOrder.firstName} ${siteOrder.lastName}`.trim(),
      email: siteOrder.email,
      phone: formatPhoneNumber(siteOrder.phone),
    },
    products: siteOrder.items.map((item) => ({
      name: item.name,
      sku: item.externalItemId.toString(),
      price: item.cost,
      quantity: item.quantity,
      picture: item.imageUrl,
      comment: item.description,
      // Add product attributes for better categorization
      properties: item.category
        ? [
            {
              name: "Категорія",
              value: item.category,
            },
          ]
        : undefined,
    })),
    shipping: shippingData
      ? {
          shipping_service: shippingData.service,
          shipping_address_city: shippingData.city,
          shipping_address_country: "Ukraine", // Assuming Ukraine based on context
          shipping_address_region: shippingData.region,
          shipping_address_zip: shippingData.zip,
          shipping_receive_point: shippingData.receivePoint,
          shipping_secondary_line: shippingData.secondaryLine,
        }
      : undefined,
    payments:
      siteOrder.paymentStatus === 1
        ? [
            {
              payment_method: siteOrder.paymentMethod,
              amount: siteOrder.totalCost,
              status: "paid" as const,
              description: `Оплата замовлення #${siteOrder.externalOrderId}`,
            },
          ]
        : [
            {
              payment_method: siteOrder.paymentMethod,
              amount: siteOrder.totalCost,
              status: "not_paid" as const,
              description: `Замовлення #${siteOrder.externalOrderId}`,
            },
          ],
    discount_amount: discount,
    // Add marketing data if available
    marketing: {
      utm_source: "website",
      utm_medium: "direct",
    },
    custom_fields: [
      {
        uuid: "OR_1001",
        value: discount ?? 0,
      },
    ].filter((field) => !!field.value),
  };
}

export function convertSiteOrderToPipelineCard(order: SiteOrder) {
  const shippingData = parseShippingAddress(
    order.deliveryAddress,
    order.deliveryMethod,
  );
  const orderDate = new Date(order.date);

  // Create formatted manager comment with structured information
  const managerComment = [
    `📋 ЗАМОВЛЕННЯ #${order.externalOrderId}`,
    "",
    `👤 Клієнт: ${order.firstName} ${order.lastName}`,
    `📞 Телефон: ${formatPhoneNumber(order.phone)}`,
    `📧 Email: ${order.email}`,
    "",
    `💰 Сума: ${order.totalCost} ${order.currency || "UAH"}`,
    `🚚 Доставка: ${order.deliveryMethod || "Не вказано"}`,
    `💳 Оплата: ${order.paymentMethod || "Не вказано"}`,
    "",
    `📦 Товари (${order.items.length} шт.):`,
    ...order.items.map(
      (item, index) =>
        `${index + 1}. ${item.name} (${item.quantity} шт. × ${item.cost} ${order.currency || "UAH"})`,
    ),
    "",
    `📍 Адреса доставки: ${order.deliveryAddress || "Не вказано"}`,
    order.additionalInfo ? `📝 Коментар: ${order.additionalInfo}` : "",
    "",
    `⏰ Час замовлення: ${orderDate.toLocaleString("uk-UA")}`,
    `🔗 ID клієнта: ${order.externalCustomerId}`,
    `📊 Статус оплати: ${order.paymentStatus === 1 ? "Оплачено" : "Не оплачено"}`,
    `📈 Статус замовлення: ${order.statusDescription || "Невідомо"} (${order.orderStatus})`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    title: `Замовлення #${order.externalOrderId}`,
    pipeline_id: 3,
    source_id: 2,
    communicate_at: orderDate.toISOString(),
    manager_comment: managerComment,

    contact: {
      full_name: `${order.firstName} ${order.lastName}`.trim() || undefined,
      email: order.email || undefined,
      phone: formatPhoneNumber(order.phone) || undefined,
    },

    products: order.items.map((item) => ({
      sku: String(item.externalItemId),
      name: item.name,
      price: item.cost,
      quantity: item.quantity,
      picture: item.imageUrl || undefined,
      comment: item.description,
      // Add product properties for better tracking
      properties: item.category
        ? [
            {
              name: "Категорія",
              value: item.category,
            },
          ]
        : undefined,
    })),

    custom_fields: [
      {
        uuid: "LD_1002",
        value: order.discount ?? 0,
      },
    ].filter((field) => !!field.value),
  };
}

// Форматування номера телефону в міжнародний формат
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // If starts with 380 and has 12 digits, add +
  if (digits.startsWith("380") && digits.length === 12) {
    return `+${digits}`;
  }

  // If starts with 0 and has 10 digits, add 380
  if (digits.startsWith("0") && digits.length === 10) {
    return `+38${digits}`;
  }

  // If starts with 80 and has 11 digits, convert to +380
  if (digits.startsWith("80") && digits.length === 11) {
    return `+3${digits}`;
  }

  // Return original if can't format
  return phone;
}

// Розширений парсер адреси доставки
export function parseShippingAddress(
  deliveryAddress: string | null,
  deliveryMethod?: string,
): {
  service?: string;
  city?: string;
  region?: string;
  zip?: string;
  receivePoint?: string;
  secondaryLine?: string;
} | null {
  if (!deliveryAddress) return null;

  let service = deliveryMethod;
  if (deliveryMethod?.toLowerCase().includes("нова пошта")) {
    service = "Нова Пошта";
  } else if (deliveryMethod?.toLowerCase().includes("укрпошта")) {
    service = "Укрпошта";
  }

  const parts = deliveryAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let city = "";
  let region = "";
  let zip = "";
  let receivePoint = "";
  let secondaryLineParts: string[] = [];

  // 1. Місто + область з першого сегмента
  if (parts[0]) {
    const regionMatch = parts[0].match(/\(([^)]+)\)/);
    if (regionMatch) {
      region = regionMatch[1];
    }

    city = parts[0].replace(/\s*\(.*?\)\s*/, "").trim();
  }

  // 2. Проходимо інші сегменти
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // zip (UA або US)
    if (/^\d{5}(-\d{4})?$/.test(part)) {
      zip = part;
      continue;
    }

    // якщо сегмент = місто (дубль) — ігноруємо
    if (part.toLowerCase() === city.toLowerCase()) {
      continue;
    }

    // receive point (ТРЦ, магазин, відділення і т.д.)
    if (/відділення|трц|магазин|store|mall/i.test(part)) {
      receivePoint = receivePoint ? `${receivePoint}, ${part}` : part;
      continue;
    }

    // все інше — частина адреси
    secondaryLineParts.push(part);
  }

  const secondaryLine = secondaryLineParts.join(", ").trim();

  return {
    service,
    city: city || undefined,
    region: region || undefined,
    zip: zip || undefined,
    receivePoint: receivePoint || undefined,
    secondaryLine: secondaryLine || undefined,
  };
}

// Простий парсер міста з адреси (для зворотної сумісності)
export function extractCity(address: string): string {
  const shipping = parseShippingAddress(address);
  return shipping?.city || "";
}

// Utility для затримки
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Валідація даних замовлення перед конвертацією
export function validateSiteOrder(order: SiteOrder): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!order.externalOrderId) {
    errors.push("Відсутній ID замовлення");
  }

  if (!order.email && !order.phone) {
    errors.push("Відсутні email або телефон клієнта");
  }

  if (!order.items || order.items.length === 0) {
    errors.push("Відсутні товари в замовленні");
  }

  if (order.totalCost <= 0) {
    errors.push("Некоректна сума замовлення");
  }

  // Validate each item
  order.items?.forEach((item, index) => {
    if (!item.name) {
      errors.push(`Відсутня назва товару #${index + 1}`);
    }
    if (!item.cost || item.cost <= 0) {
      errors.push(`Некоректна ціна товару #${index + 1}`);
    }
    if (!item.quantity || item.quantity <= 0) {
      errors.push(`Некоректна кількість товару #${index + 1}`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Розрахунок загальної вартості замовлення
export function calculateOrderTotal(order: SiteOrder): number {
  return (
    order.items?.reduce((total, item) => {
      return total + item.cost * item.quantity;
    }, 0) || 0
  );
}

// Форматування валюти
export function formatCurrency(
  amount: number,
  currency: string = "UAH",
): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: currency === "UAH" ? "UAH" : "UAH",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
