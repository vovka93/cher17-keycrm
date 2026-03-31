import { createHash } from "crypto";
import { CONFIG } from "./config";
import type { SiteOrder } from "./types";

const KYIV_TIME_ZONE = "Europe/Kyiv";

function getKyivDateParts(input: number | string | Date): {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
} {
  const date = input instanceof Date ? input : new Date(input);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: KYIV_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  ) as Record<string, string | undefined>;

  return {
    year: map.year ?? "1970",
    month: map.month ?? "01",
    day: map.day ?? "01",
    hour: map.hour ?? "00",
    minute: map.minute ?? "00",
    second: map.second ?? "00",
  };
}

export function formatDateTimeKyiv(input: number | string | Date): string {
  const { year, month, day, hour, minute, second } = getKyivDateParts(input);
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

export function formatIsoKyiv(input: number | string | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  const utcMs = date.getTime();
  const kyivAsUtcMs = new Date(formatDateTimeKyiv(date).replace(" ", "T") + "Z").getTime();
  const offsetMinutes = Math.round((kyivAsUtcMs - utcMs) / 60000);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${formatDateTimeKyiv(date).replace(" ", "T")}${sign}${hh}:${mm}`;
}

// Розрахунок затримки з exponential backoff
export function calculateBackoff(retryCount: number): number {
  const backoff = Math.min(
    CONFIG.INITIAL_BACKOFF * Math.pow(CONFIG.BACKOFF_MULTIPLIER, retryCount),
    CONFIG.MAX_BACKOFF,
  );
  // Додаємо jitter (випадкову затримку) для уникнення thundering herd
  return backoff + Math.random() * 1000;
}

function getItemSku(item: SiteOrder["items"][number]) {
  return item.sku?.trim() || String(item.externalItemId ?? "").trim();
}

// Конвертація замовлення з сайту в формат CRM
export function convertSiteOrderToCRM(siteOrder: SiteOrder) {
  const shippingData = parseShippingAddress(
    siteOrder.deliveryAddress,
    siteOrder.deliveryMethod,
  );
  const isPaid = Number(siteOrder.paymentStatus) === 1;
  let discount =
    siteOrder.discount && siteOrder.discount > 0
      ? siteOrder.discount
      : undefined;
  return {
    source_id: 2, // ID джерела (сайт)
    source_uuid: siteOrder.externalOrderId,
    buyer_comment: siteOrder.additionalInfo || undefined,
    ordered_at: formatDateTimeKyiv(siteOrder.date),
    buyer: {
      full_name: `${siteOrder.firstName} ${siteOrder.lastName}`.trim(),
      email: siteOrder.email,
      phone: formatPhoneNumber(siteOrder.phone),
    },
    products: siteOrder.items.map((item) => ({
      name: item.name,
      sku: getItemSku(item),
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
      isPaid
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
    `🚚 Доставка: ${order.deliveryMethod || "Не вказано"}`,
    `💳 Оплата: ${order.paymentMethod || "Не вказано"}`,
    "",
    `📍 Адреса доставки: ${order.deliveryAddress || "Не вказано"}`,
    order.additionalInfo ? `📝 Коментар: ${order.additionalInfo}` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    title: `Замовлення #${order.externalOrderId}`,
    pipeline_id: 1,
    source_id: 2,
    communicate_at: formatIsoKyiv(orderDate),
    manager_comment: managerComment,

    contact: {
      full_name: `${order.firstName} ${order.lastName}`.trim() || undefined,
      email: order.email || undefined,
      phone: formatPhoneNumber(order.phone) || undefined,
    },

    products: order.items.map((item) => ({
      sku: getItemSku(item),
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
  const firstPart = parts[0];
  if (firstPart) {
    const regionMatch = firstPart.match(/\(([^)]+)\)/);
    if (regionMatch?.[1]) {
      region = regionMatch[1];
    }

    city = firstPart.replace(/\s*\(.*?\)\s*/, "").trim();
  }

  // 2. Проходимо інші сегменти
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

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

export function createLeadDedupHash(order: SiteOrder): string {
  const fullName = `${order.firstName} ${order.lastName}`.trim().toLowerCase();
  const phone = formatPhoneNumber(order.phone ?? "")
    .trim()
    .toLowerCase();
  const products = order.items
    .map((item) => ({
      name: item.name.trim().toLowerCase(),
      quantity: item.quantity,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const payload = JSON.stringify({
    fullName,
    phone,
    products,
  });

  return createHash("sha256").update(payload).digest("hex");
}
