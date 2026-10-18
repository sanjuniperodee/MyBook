import { availableAddons, formatPrice, getDeliveryOptions } from "@/config/site";

/** Что можно отметить бесплатным по договорённости — галочками в формах заведения клиента и сделок. */
export const giftFields = { giftwrap: "giftWrap", delivery: "giftDelivery" } as const;

/** Галочки формы → список бесплатного (недоступное тарифу сервер всё равно отбросит). */
export function giftsFromForm(values: Record<string, string>): ("giftwrap" | "delivery")[] {
  return [...(values[giftFields.giftwrap] === "on" ? (["giftwrap"] as const) : []), ...(values[giftFields.delivery] === "on" ? (["delivery"] as const) : [])];
}

/**
 * «Бесплатно по договорённости»: подарочная упаковка и (или) доставка. Ничего не отмечено — клиент платит за них по прайсу.
 * Отмеченное клиент выбирает при оформлении заказа сам, и оно стоит 0 ₸ (само в заказ не добавляется).
 */
export function AgreementGiftsField({ values = {} }: { values?: Record<string, string> }) {
  const wrap = availableAddons("hardcover").find((a) => a.id === "giftwrap")?.price ?? 0;
  const delivery = Math.max(0, ...getDeliveryOptions().map((d) => d.price));
  return (
    <fieldset className="rounded-xl border border-line px-3 py-2 sm:col-span-2" data-testid="agreement-gifts-field">
      <legend className="px-1 text-sm font-medium">Бесплатно по договорённости</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name={giftFields.giftwrap} defaultChecked={values[giftFields.giftwrap] === "on"} />
          Подарочная упаковка <span className="text-muted">· обычно {formatPrice(wrap)}</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name={giftFields.delivery} defaultChecked={values[giftFields.delivery] === "on"} />
          Доставка <span className="text-muted">· до {formatPrice(delivery)}</span>
        </label>
      </div>
      <p className="mt-1 text-xs text-muted">Не отмечено — клиент платит по прайсу. Отмеченное клиент выбирает при оформлении сам, и оно стоит 0 ₸. У электронной книги упаковки и доставки нет.</p>
    </fieldset>
  );
}
