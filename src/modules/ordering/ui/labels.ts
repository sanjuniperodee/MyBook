import type { AddonId, DeliveryId, PlanId } from "@/config/site";

/**
 * Подписи тарифов, допов и доставки в CRM — по-русски, без словарей (их берут и клиентские формы админки).
 * Клиенту, в письмах и PDF названия идут из словаря: planName(), deliveryName(), addonName() в i18n/labels.
 */
export const planLabels: Record<PlanId, string> = { digital: "Электронная версия", hardcover: "Твёрдая обложка", premium: "Премиум" };
export const addonLabels: Record<AddonId, string> = { express: "Экспресс-печать", giftwrap: "Подарочная упаковка" };
/** Порядок ключей — порядок в списках выбора. */
export const deliveryLabels: Record<DeliveryId, string> = { courier: "Курьер по городу", post: "Доставка по Казахстану", pickup: "Самовывоз", abroad: "В другую страну (стоимость считает менеджер)" };

/** Адрес доставки одной строкой: страна (для другой страны), индекс, город, адрес; пусто — «—» решает вызывающий. */
export function deliveryAddress(o: { country?: string | null; postalCode: string | null; city: string | null; address: string | null }): string {
  return [o.country, o.postalCode, o.city, o.address].filter(Boolean).join(", ");
}
