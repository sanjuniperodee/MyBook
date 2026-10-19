import { formatPrice, getPlan } from "@/config/site";
import { DiscountPolicy, percentLabel } from "@/shared/domain/discount";

/**
 * Подсказка у поля цены (бюджет сделки, цена договорённости): «ниже прайса на N%», а сверх лимита сотрудника — что
 * сохранить так не получится. Решает сервер (DiscountPolicy); подсказка лишь предупреждает заранее.
 * list — прайс, с которым сравниваем (null — сумма не цена продажи); planless — тарифа нет, прайс — самый дорогой.
 */
export function DiscountHint({ list, price, maxPercent }: { list: { listPrice: number; planless: boolean } | null; price: number; maxPercent: number | null }) {
  if (!list || !(price > 0)) return null;
  const percent = DiscountPolicy.percent(list.listPrice, price);
  if (percent <= 0) return null;
  const over = !DiscountPolicy.allows({ listPrice: list.listPrice, price, maxPercent });
  return (
    <span className={`mt-1 block text-[11px] ${over ? "text-red-700" : "text-amber-800"}`} data-testid="discount-hint">
      Ниже прайса{list.planless ? " самого дорогого тарифа" : ""} ({formatPrice(list.listPrice)}) на {percentLabel(percent)}
      {over ? ` — больше лимита ${maxPercent}%: ${list.planless ? "укажите тариф договорённости или " : ""}согласуйте с руководителем` : ""}
    </span>
  );
}

/** То же для формы с выбором тарифа: прайс — цена выбранного тарифа (тариф не выбран — подсказки нет). */
export function PlanDiscountHint({ plan, price, maxPercent }: { plan: string; price: number; maxPercent: number | null }) {
  const p = plan ? getPlan(plan) : undefined;
  return <DiscountHint list={p ? { listPrice: p.price, planless: false } : null} price={price} maxPercent={maxPercent} />;
}
