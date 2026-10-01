import type { AddonId, DeliveryId, PlanId } from "@/config/site";
import type { FormatId } from "@/lib/book/formats";
import type { InteriorId } from "@/lib/book/interiors";
import type { Locale } from "./config";
import { messagesFor } from "./messages";

/**
 * Названия тарифов, доставки, допов, обложек и оформления на нужном языке — для писем, PDF и CRM (CRM — на русском).
 * Неизвестный id возвращается как есть, чтобы старые записи не ломали вывод.
 */
export function planName(id: string, locale: Locale = "ru") {
  return messagesFor(locale).common.plans[id as PlanId]?.name ?? id;
}

export function deliveryName(id: string | null | undefined, locale: Locale = "ru") {
  return id ? (messagesFor(locale).common.delivery[id as DeliveryId]?.name ?? id) : "—";
}

export function addonName(id: string, locale: Locale = "ru") {
  return messagesFor(locale).common.addons[id as AddonId]?.name ?? id;
}

export function coverName(id: string, locale: Locale = "ru") {
  return messagesFor(locale).catalog.covers[id] ?? id;
}

export function interiorName(id: string, locale: Locale = "ru") {
  return messagesFor(locale).catalog.interiors[id as InteriorId]?.name ?? id;
}

export function formatName(id: string, locale: Locale = "ru") {
  return messagesFor(locale).catalog.formats[id as FormatId] ?? id;
}
