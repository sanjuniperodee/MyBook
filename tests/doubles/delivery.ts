import { applyCatalog } from "@/config/site";

/**
 * Фиксированные цены доставки, как если бы владелец вписал их в «Ценах и тарифах»: по умолчанию курьер и по Казахстану
 * рассчитываются индивидуально (0 ₸ в заказе), а тесты расчёта проверяют и платную доставку.
 */
export const FIXED_DELIVERY = { delivery: { courier: { price: 2000, fixed: true }, post: { price: 3500, fixed: true } } } as const;

export const useFixedDelivery = () => applyCatalog(FIXED_DELIVERY);
