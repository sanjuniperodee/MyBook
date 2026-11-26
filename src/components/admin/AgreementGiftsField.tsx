import { availableAddons, formatPrice, getDeliveryOptions } from "@/config/site";

export { giftFields, giftsFromForm } from "@/shared/domain/agreementGifts";
import { giftFields } from "@/shared/domain/agreementGifts";

/**
 * «Бесплатно по договорённости»: подарочная упаковка и (или) доставка. Ничего не отмечено — клиент платит за них по прайсу.
 * Отмеченное клиент выбирает при оформлении заказа сам, и оно стоит 0 ₸ (само в заказ не добавляется).
 */
export function AgreementGiftsField({ values = {} }: { values?: Record<string, string> }) {
  const wrap = availableAddons("hardcover").find((a) => a.id === "giftwrap")?.price ?? 0;
  const delivery = Math.max(0, ...getDeliveryOptions().map((d) => d.price));
  return (
    <fieldset className="rounded-[var(--r-ctl)] border border-line px-3.5 pt-1 pb-3 sm:col-span-2" data-testid="agreement-gifts-field">
      <legend className="px-1 text-sm font-medium text-ink-soft">Бесплатно по договорённости</legend>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="size-4 accent-wine" name={giftFields.giftwrap} defaultChecked={values[giftFields.giftwrap] === "on"} />
          Подарочная упаковка <span className="text-muted">· обычно {formatPrice(wrap)}</span>
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" className="size-4 accent-wine" name={giftFields.delivery} defaultChecked={values[giftFields.delivery] === "on"} />
          Доставка <span className="text-muted">· {delivery ? `до ${formatPrice(delivery)}` : "стоимость рассчитывается индивидуально"}</span>
        </label>
      </div>
      <p className="hint">Не отмечено — клиент платит по прайсу. Отмеченное клиент выбирает при оформлении сам, и оно стоит 0 ₸. У электронной книги упаковки и доставки нет.</p>
    </fieldset>
  );
}
