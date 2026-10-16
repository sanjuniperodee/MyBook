"use client";

import { useMessages } from "@/i18n/client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { track } from "@/lib/analytics-client";
import { checkPromoAction, createOrderAction, type CheckoutState, type PromoPreview } from "./actions";
import { availableAddons, getPlan, getPlans, getVisiblePlans, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
import { nowMs } from "@/lib/dates";
import { toIsoDay } from "@/lib/occasions";
import { quoteCheckout } from "@/modules/ordering/domain/Pricing";
import { AgreementChoice, ContactsSection, DeliverySection, GiftSection, MobileBar, PlanSection, Summary, UpgradeNote, type AgreementMode, type PromoField } from "./form/sections";

/** Промокод или сертификат: ввод, проверка на сервере (checkPromoAction), применённый и ошибка. */
function usePromo(initial: PromoPreview | null, failed: string): PromoField {
  const [value, setValue] = useState<PromoPreview | null>(initial);
  const [input, setInput] = useState(initial?.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [checking, start] = useTransition();
  const apply = () =>
    start(async () => {
      setError(null);
      const res = await checkPromoAction(input);
      if (res.ok) setValue(res);
      else setError(res.error ?? failed);
    });
  return { value, input, setInput, apply, remove: () => setValue(null), checking, error };
}

export function CheckoutForm({
  bookId,
  defaults,
  blocked,
  initialPromo = null,
  initialPlan,
  agreement = null,
  upgrade = null,
}: {
  /** Договорённость менеджера с клиентом: цена книги, внесённая предоплата и тариф (ручная сделка). Доставка и допы — сверху. */
  agreement?: { dealNumber: number; agreedTotal: number; prepaid: number; plan: PlanId | null } | null;
  initialPlan?: PlanId;
  /** Печатная версия к уже оплаченной электронной: её оплата засчитывается, выбор — только печатные тарифы. */
  upgrade?: { orderId: string; number: number; credit: number } | null;
  initialPromo?: PromoPreview | null;
  bookId: string;
  defaults: {
    name: string;
    email: string;
    phone: string;
    desiredDate?: string | null;
    occasionLabel?: string | null;
  };
  blocked: boolean;
}) {
  const [state, action] = useActionState<CheckoutState, FormData>(createOrderAction, {});
  const t = useMessages().checkout;
  const [chosenPlan, setPlanId] = useState<PlanId>(agreement?.plan ?? (upgrade && !getPlan(initialPlan ?? "digital")?.printed ? "hardcover" : initialPlan) ?? "hardcover");

  // Договорённость: продолжить по ней или оформить заказ «с нуля» по обычной цене (внесённое засчитается как аванс).
  const [mode, setMode] = useState<AgreementMode>("agreed");
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<DeliveryId>("courier");
  const [now] = useState(() => new Date(nowMs()));
  useEffect(() => track("begin_checkout"), []);
  const today = toIsoDay(now);
  const [desiredDate, setDesiredDate] = useState(defaults.desiredDate && defaults.desiredDate >= today ? defaults.desiredDate : "");
  const promoField = usePromo(initialPromo, t.promoFailed);
  const promo = promoField.value;
  const discount = promo?.ok && promo.kind && promo.value ? { kind: promo.kind, value: promo.value } : null;
  const [addonIds, setAddonIds] = useState<AddonId[]>([]);
  // Тариф (по договорённости — зафиксирован) и итог — той же функцией, что на сервере (quoteCheckout).
  const quote = quoteCheckout({ plan: chosenPlan, quantity: qty, delivery, discount, addons: addonIds, agreement, mode, upgradeCredit: upgrade?.credit });
  const { itemsAmount: items, deliveryAmount: deliveryPrice, addons: appliedAddons, amount: total } = quote.price;
  const discountAmount = quote.promoDiscount;
  const agreedDiscount = quote.agreedDiscount;
  const prepaidApplied = quote.price.prepaidAmount ?? 0;
  const { plan: planId, lockedPlan } = quote;
  const plan = getPlans().find((p) => p.id === planId)!;
  const offered = availableAddons(planId);
  // Какие тарифы предлагаем: зафиксированный договорённостью; при дозаказе печатной версии — только печатные; иначе все, что продаются.
  const shownPlans = lockedPlan ? getPlans().filter((x) => x.id === lockedPlan) : upgrade ? getVisiblePlans().filter((x) => x.printed) : getVisiblePlans();
  const toggleAddon = (id: AddonId) => setAddonIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  return (
    <form action={action} className="grid gap-10 pb-24 lg:grid-cols-[minmax(0,1fr)_360px] lg:pb-0">
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="plan" value={planId} />
      <input type="hidden" name="quantity" value={qty} />
      <input type="hidden" name="delivery" value={plan.printed ? delivery : ""} />
      <input type="hidden" name="promoCode" value={promo?.ok ? promo.code : ""} />
      <input type="hidden" name="addons" value={appliedAddons.join(",")} />
      {upgrade ? <input type="hidden" name="upgradeFrom" value={upgrade.orderId} /> : null}

      <div className="space-y-10">
        {upgrade ? <UpgradeNote upgrade={upgrade} /> : null}
        {agreement ? <AgreementChoice agreement={agreement} mode={mode} onMode={setMode} /> : null}
        <PlanSection plans={shownPlans} planId={planId} lockedPlan={lockedPlan} onPlan={setPlanId} qty={qty} onQty={setQty} offered={offered} applied={appliedAddons} onToggleAddon={toggleAddon} />
        {plan.printed ? <DeliverySection delivery={delivery} onDelivery={setDelivery} /> : null}
        {plan.printed ? (
          <GiftSection now={now} today={today} desiredDate={desiredDate} onDesiredDate={setDesiredDate} occasionLabel={defaults.occasionLabel} planId={planId} delivery={delivery} offered={offered} applied={appliedAddons} onToggleAddon={toggleAddon} onPlan={setPlanId} />
        ) : null}
        <ContactsSection printed={!!plan.printed} defaults={defaults} />
      </div>

      <Summary
        plan={plan}
        qty={qty}
        price={{ items, discountAmount, agreedDiscount, prepaidApplied, addons: appliedAddons, deliveryPrice, total }}
        promo={promoField}
        upgrade={upgrade}
        offered={offered}
        error={state.error}
        blocked={blocked}
      />

      <MobileBar total={total} />
    </form>
  );
}
