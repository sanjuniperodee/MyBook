/**
 * Расчёт для калькулятора цены на странице. Формула повторяет серверную (modules/ordering/domain/Pricing): первая книга —
 * цена тарифа, каждая следующая — цена дополнительного экземпляра, допы — один раз на заказ, у электронной книги один экземпляр.
 * Тарифы и допы приходят с сервера (в них уже учтены цены из админки), поэтому здесь нет обращений к конфигу.
 */
export interface PricePlan {
  id: string;
  price: number;
  extraCopyPrice?: number;
  printed: boolean;
}

export interface PriceAddon {
  id: string;
  price: number;
  hiddenFor: string[];
}

export const MAX_COPIES = 20;

export interface PriceResult {
  copies: number;
  book: number;
  extraCopies: number;
  addons: number;
  addonIds: string[];
  total: number;
}

export function calcPrice(plan: PricePlan, copies: number, addons: readonly PriceAddon[], chosen: readonly string[]): PriceResult {
  const qty = plan.printed ? Math.min(Math.max(1, Math.floor(copies) || 1), MAX_COPIES) : 1;
  const extraCopies = (qty - 1) * (plan.extraCopyPrice ?? plan.price);
  const applied = addons.filter((a) => !a.hiddenFor.includes(plan.id) && chosen.includes(a.id));
  const addonsAmount = applied.reduce((s, a) => s + a.price, 0);
  return { copies: qty, book: plan.price, extraCopies, addons: addonsAmount, addonIds: applied.map((a) => a.id), total: plan.price + extraCopies + addonsAmount };
}
