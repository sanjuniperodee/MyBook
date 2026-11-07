"use client";

import { useMessages } from "@/i18n/client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { track } from "@/lib/analytics-client";
import { checkPromoAction, createOrderAction, type CheckoutState, type PromoPreview } from "./actions";
import { soldAddons, getPlan, getPlans, getVisiblePlans, isQuotedDelivery, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
import { nowMs } from "@/lib/dates";
import { toIsoDay } from "@/lib/occasions";
import { quoteCheckout } from "@/modules/ordering/domain/Pricing";
import type { AgreementGift } from "@/shared/domain/agreementGifts";
import { Alert } from "@/components/ui/Alert";
import { AgreementChoice, ConsentField, ContactsBlock, DeliveryBlock, GiftBlock, MobileSummary, PlanStep, PromoBox, ReviewBlock, StepActions, Summary, UpgradeNote, type AgreementMode, type FormValues, type PromoField } from "./form/sections";
import { Group, Stepper } from "./form/ui";
import { fieldOfServerError, stepOfField, validateCheckout, type CheckoutErrors, type CheckoutField } from "./form/validate";

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

/** Поля по порядку на странице: к первому из ошибочных переводим фокус. */
const FOCUS_ORDER: CheckoutField[] = ["country", "city", "address", "postalCode", "contactName", "contactPhone", "contactEmail", "giftNote", "consent"];

/**
 * Оформление заказа мастером из трёх шагов: состав и тираж → доставка и получатель → проверка и оплата. Одна форма
 * (createOrderAction): все шаги в разметке, неактивные скрыты, поэтому каждое поле уходит на сервер как раньше. Проверка
 * полей — в браузере по тем же правилам, что у сервера, с ошибкой у самого поля; цену считает quoteCheckout — та же
 * функция, что на сервере.
 */
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
  agreement?: { dealNumber: number; agreedTotal: number; prepaid: number; plan: PlanId | null; batch?: { index: number; size: number } | null; /** Что менеджер отдал бесплатно (упаковка, доставка) — 0 ₸, если клиент выберет. */ gifts?: AgreementGift[] } | null;
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
  const t = useMessages().checkout;
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<CheckoutErrors>({});
  // Ответ сервера с ошибкой поля показываем у поля, пока человек его не поправил.
  const [ackedServerError, setAcked] = useState<string | null>(null);
  const [state, action] = useActionState<CheckoutState, FormData>(async (prev, form) => {
    const res = await createOrderAction(prev, form);
    const field = res.error ? fieldOfServerError(res.error, t.errors) : null;
    if (field) setStep(stepOfField(field));
    return res;
  }, {});
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [chosenPlan, setPlanId] = useState<PlanId>(agreement?.plan ?? (upgrade && !getPlan(initialPlan ?? "digital")?.printed ? "hardcover" : initialPlan) ?? "hardcover");

  // Договорённость: продолжить по ней или оформить заказ «с нуля» по обычной цене (внесённое засчитается как аванс).
  const [mode, setMode] = useState<AgreementMode>("agreed");
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<DeliveryId>("courier");
  const [now] = useState(() => new Date(nowMs()));
  useEffect(() => track("begin_checkout"), []);
  const today = toIsoDay(now);
  const [desiredDate, setDesiredDate] = useState(defaults.desiredDate && defaults.desiredDate >= today ? defaults.desiredDate : "");
  const [giftOpen] = useState(() => !!defaults.desiredDate && defaults.desiredDate >= today);
  const [values, setValues] = useState<FormValues>({ contactName: defaults.name, contactPhone: defaults.phone, contactEmail: defaults.email, country: "", city: "", address: "", postalCode: "", giftNote: "", comment: "", surprise: false, consent: false });
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
  const printed = !!plan.printed;
  // Бесплатное по договорённости действует, только пока клиент продолжает по ней (не «с нуля»).
  const gifts: AgreementGift[] = agreement && mode === "agreed" && !upgrade ? (agreement.gifts ?? []) : [];
  const offered = soldAddons(planId);
  // Какие тарифы предлагаем: зафиксированный договорённостью; при дозаказе печатной версии — только печатные; иначе все, что продаются.
  const shownPlans = lockedPlan ? getPlans().filter((x) => x.id === lockedPlan) : upgrade ? getVisiblePlans().filter((x) => x.printed) : getVisiblePlans();
  const toggleAddon = (id: AddonId) => setAddonIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const deliveryQuoted = printed && isQuotedDelivery(delivery, quote.price.gifted);

  const set: Parameters<typeof ContactsBlock>[0]["set"] = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => {
      if (!(key in e)) return e;
      const rest = { ...e };
      delete rest[key as CheckoutField];
      return rest;
    });
    if (state.error) setAcked(state.error);
  };
  const serverField = state.error ? fieldOfServerError(state.error, t.errors) : null;
  const shown: CheckoutErrors = { ...(serverField && state.error !== ackedServerError ? { [serverField]: state.error } : {}), ...errors };

  const steps = [
    { id: "plan", label: t.wizard.steps.plan, short: t.wizard.short.plan },
    printed ? { id: "delivery", label: t.wizard.steps.delivery, short: t.wizard.short.delivery } : { id: "contacts", label: t.wizard.steps.contacts, short: t.wizard.short.contacts },
    { id: "pay", label: t.wizard.steps.pay, short: t.wizard.short.pay },
  ];

  const focusField = (field: CheckoutField) => requestAnimationFrame(() => document.getElementById(field)?.focus());
  const go = (i: number) => {
    setStep(i);
    setReached((r) => Math.max(r, i));
    requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
      titleRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };
  // Ошибки полей: в состоянии формы, фокус — на первом по порядку; шаг переключаем на тот, где поле лежит.
  const fail = (errs: CheckoutErrors) => {
    setErrors(errs);
    const first = FOCUS_ORDER.find((f) => errs[f]);
    if (!first) return false;
    setStep(stepOfField(first));
    setReached((r) => Math.max(r, stepOfField(first)));
    focusField(first);
    return true;
  };
  const validateAll = () => validateCheckout(values, { printed, delivery }, t.errors);
  const next = () => {
    if (step === 1) {
      const own = Object.fromEntries(Object.entries(validateAll()).filter(([f]) => stepOfField(f as CheckoutField) === 1)) as CheckoutErrors;
      if (fail(own)) return;
    }
    go(Math.min(2, step + 1));
  };

  return (
    <form
      noValidate
      action={action}
      onSubmit={(e) => {
        // Enter в поле первых шагов — «Далее», а не отправка заказа.
        if (step < 2) {
          e.preventDefault();
          next();
          return;
        }
        if (fail(validateAll())) e.preventDefault();
      }}
      className="space-y-5 pb-28 lg:pb-0"
    >
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="plan" value={planId} />
      <input type="hidden" name="quantity" value={qty} />
      <input type="hidden" name="delivery" value={printed ? delivery : ""} />
      <input type="hidden" name="promoCode" value={promo?.ok ? promo.code : ""} />
      <input type="hidden" name="addons" value={appliedAddons.join(",")} />
      {upgrade ? <input type="hidden" name="upgradeFrom" value={upgrade.orderId} /> : null}

      <Stepper steps={steps} current={step} reached={reached} onGo={go} />
      <MobileSummary plan={plan} qty={qty} price={{ items, discountAmount, agreedDiscount, prepaidApplied, addons: appliedAddons, deliveryPrice, total, gifted: quote.price.gifted ?? [], deliveryQuoted }} promo={promoField} upgrade={upgrade} offered={offered} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="min-w-0">
          <header className="mb-5">
            <p className="text-xs text-muted">{t.wizard.stepOf(step + 1, steps.length)}</p>
            <h2 ref={titleRef} tabIndex={-1} className="scroll-mt-40 font-serif text-[28px] leading-tight font-medium outline-none sm:text-[32px]">
              {steps[step].label}
            </h2>
          </header>

          {/* Шаг 1: состав и тираж */}
          <div id="step-plan" hidden={step !== 0} className="space-y-5">
            {upgrade ? <UpgradeNote upgrade={upgrade} /> : null}
            {agreement ? <AgreementChoice agreement={agreement} mode={mode} onMode={setMode} /> : null}
            <PlanStep plans={shownPlans} planId={planId} lockedPlan={lockedPlan} onPlan={setPlanId} qty={qty} onQty={setQty} offered={offered} applied={appliedAddons} onToggleAddon={toggleAddon} gifts={gifts} />
          </div>

          {/* Шаг 2: доставка и получатель (у электронной версии — только контакты) */}
          <div id={printed ? "step-delivery" : "step-contacts"} hidden={step !== 1} className="space-y-7">
            {printed ? <DeliveryBlock delivery={delivery} onDelivery={setDelivery} gifts={gifts} v={values} set={set} errors={shown} /> : null}
            <div id={printed ? "step-contacts" : undefined}>
              <ContactsBlock printed={printed} v={values} set={set} errors={shown} />
            </div>
            {printed ? (
              <div id="step-gift">
                <GiftBlock now={now} today={today} desiredDate={desiredDate} onDesiredDate={setDesiredDate} occasionLabel={defaults.occasionLabel} planId={planId} delivery={delivery} offered={offered} applied={appliedAddons} onToggleAddon={toggleAddon} onPlan={setPlanId} v={values} set={set} errors={shown} open={giftOpen} />
              </div>
            ) : null}
          </div>

          {/* Шаг 3: проверка и оплата */}
          <div id="step-pay" hidden={step !== 2} className="space-y-7">
            <ReviewBlock plan={plan} qty={qty} applied={appliedAddons} delivery={delivery} v={values} desiredDate={desiredDate} onEdit={go} />
            <PromoBox promo={promoField} items={items} />
            <Group title={t.wizard.payTitle}>
              <p className="text-sm leading-relaxed text-ink-soft">{t.wizard.payText}</p>
            </Group>
            <ConsentField checked={values.consent} onChange={(on) => set("consent", on)} error={shown.consent} />
            {Object.keys(shown).length && step === 2 ? <Alert kind="warning">{t.wizard.fixFields}</Alert> : null}
          </div>

          <div className="max-lg:hidden">
            <StepActions step={step} last={step === 2} onBack={() => go(Math.max(0, step - 1))} onNext={next} blocked={blocked} error={step === 2 ? (serverField ? undefined : state.error) : undefined} />
          </div>
        </div>

        <Summary plan={plan} qty={qty} price={{ items, discountAmount, agreedDiscount, prepaidApplied, addons: appliedAddons, deliveryPrice, total, gifted: quote.price.gifted ?? [], deliveryQuoted }} promo={promoField} upgrade={upgrade} offered={offered} />
      </div>

      <StepActions mobile step={step} last={step === 2} onBack={() => go(Math.max(0, step - 1))} onNext={next} blocked={blocked} error={state.error && !serverField ? state.error : undefined} />
    </form>
  );
}
