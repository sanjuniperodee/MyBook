"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { track } from "@/lib/analytics-client";
import { Check, LoaderCircle, Minus, Plus, Tag, X } from "lucide-react";
import { checkPromoAction, createOrderAction, type CheckoutState, type PromoPreview } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TrustList } from "@/components/TrustList";
import { Alert } from "@/components/ui/Alert";
import { availableAddons, deliveryOptions, formatPrice, plans, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
import { cn, nowMs } from "@/lib/utils";
import { orderByDate, startOfDay, toIsoDay } from "@/lib/occasions";
import { calculatePrice } from "@/lib/pricing";

export function CheckoutForm({
  bookId,
  defaults,
  blocked,
  initialPromo = null,
  initialPlan,
}: {
  initialPlan?: PlanId;
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
  const [planId, setPlanId] = useState<PlanId>(initialPlan ?? "hardcover");
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<DeliveryId>("courier");
  const [now] = useState(() => new Date(nowMs()));
  useEffect(() => track("begin_checkout"), []);
  const today = toIsoDay(now);
  const [desiredDate, setDesiredDate] = useState(defaults.desiredDate && defaults.desiredDate >= today ? defaults.desiredDate : "");
  const plan = plans.find((p) => p.id === planId)!;
  const [promo, setPromo] = useState<PromoPreview | null>(initialPromo);
  const [promoInput, setPromoInput] = useState(initialPromo?.code ?? "");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [checkingPromo, startPromo] = useTransition();
  const discount = promo?.ok && promo.kind && promo.value ? { kind: promo.kind, value: promo.value } : null;
  const [addonIds, setAddonIds] = useState<AddonId[]>([]);
  const offered = availableAddons(planId);
  const { itemsAmount: items, discountAmount, deliveryAmount: deliveryPrice, addons: appliedAddons, amount: total } = calculatePrice(planId, qty, delivery, discount, addonIds);
  const express = planId === "premium" || appliedAddons.includes("express");
  const toggleAddon = (id: AddonId) => setAddonIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  // Успеваем ли к дате с выбранным тарифом и доставкой.
  const fit = desiredDate
    ? (() => {
        const by = orderByDate(desiredDate, express ? "premium" : planId, delivery);
        const byPremium = orderByDate(desiredDate, "premium", delivery);
        return {
          ok: by >= startOfDay(now),
          premiumOk: byPremium >= startOfDay(now),
          by,
        };
      })()
    : null;
  const applyPromo = () =>
    startPromo(async () => {
      setPromoError(null);
      const res = await checkPromoAction(promoInput);
      if (res.ok) setPromo(res);
      else setPromoError(res.error ?? "Промокод не подошёл");
    });

  return (
    <form action={action} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
      <input type="hidden" name="bookId" value={bookId} />
      <input type="hidden" name="plan" value={planId} />
      <input type="hidden" name="quantity" value={qty} />
      <input type="hidden" name="delivery" value={plan.printed ? delivery : ""} />
      <input type="hidden" name="promoCode" value={promo?.ok ? promo.code : ""} />
      <input type="hidden" name="addons" value={appliedAddons.join(",")} />

      <div className="space-y-10">
        <section>
          <h2 className="text-xl font-semibold">1. Вариант книги</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPlanId(p.id)}
                className={cn("relative rounded-2xl border bg-white p-5 text-left transition", planId === p.id ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
              >
                {planId === p.id ? (
                  <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                    <Check className="size-3.5" />
                  </span>
                ) : null}
                <div className="font-semibold">{p.name}</div>
                <div className="mt-1 font-serif text-2xl">{formatPrice(p.price)}</div>
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {p.features.slice(0, 3).map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          {plan.printed ? (
            <div className="mt-5 flex items-center gap-4">
              <span className="text-sm text-ink-soft">Количество экземпляров</span>
              <div className="flex items-center rounded-full border border-line bg-white">
                <button
                  type="button"
                  className="flex size-10 items-center justify-center disabled:opacity-40"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="Меньше"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-8 text-center font-medium tabular-nums">{qty}</span>
                <button
                  type="button"
                  className="flex size-10 items-center justify-center disabled:opacity-40"
                  onClick={() => setQty((q) => Math.min(20, q + 1))}
                  disabled={qty >= 20}
                  aria-label="Больше"
                >
                  <Plus className="size-4" />
                </button>
              </div>
              {plan.extraCopyPrice ? <span className="text-sm text-muted">каждый следующий — {formatPrice(plan.extraCopyPrice)}</span> : null}
            </div>
          ) : null}
          {offered.length ? (
            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {offered.map((a) => {
                const on = appliedAddons.includes(a.id);
                return (
                  <label
                    key={a.id}
                    className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition", on ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
                  >
                    <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={on} onChange={() => toggleAddon(a.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex justify-between gap-2 font-medium">
                        {a.name} <span className="shrink-0 font-normal text-ink-soft">+{formatPrice(a.price)}</span>
                      </span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted">{a.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </section>

        {plan.printed ? (
          <section>
            <h2 className="text-xl font-semibold">2. Доставка</h2>
            <div className="mt-4 grid gap-3">
              {deliveryOptions.map((d) => (
                <label
                  key={d.id}
                  className={cn("flex cursor-pointer items-center gap-4 rounded-2xl border bg-white p-4 transition", delivery === d.id ? "border-wine ring-4 ring-wine/10" : "border-line")}
                >
                  <input type="radio" name="_delivery" className="size-4 accent-wine" checked={delivery === d.id} onChange={() => setDelivery(d.id)} />
                  <div className="flex-1">
                    <div className="font-medium">{d.name}</div>
                    <div className="text-sm text-muted">{d.description}</div>
                  </div>
                  <div className="text-sm font-medium">{d.price ? formatPrice(d.price) : "Бесплатно"}</div>
                </label>
              ))}
            </div>
            {delivery !== "pickup" ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label className="label" htmlFor="city">
                    Город
                  </label>
                  <input className="input" id="city" name="city" required maxLength={100} autoComplete="address-level2" />
                </div>
                <div>
                  <label className="label" htmlFor="address">
                    Адрес
                  </label>
                  <input className="input" id="address" name="address" required maxLength={300} placeholder="Улица, дом, квартира" autoComplete="street-address" />
                </div>
                <div>
                  <label className="label" htmlFor="postalCode">
                    Индекс
                  </label>
                  <input className="input" id="postalCode" name="postalCode" maxLength={20} autoComplete="postal-code" />
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {plan.printed ? (
          <section>
            <h2 className="text-xl font-semibold">3. Подарок</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_220px]">
              <div>
                <label className="label" htmlFor="giftNote">
                  Текст открытки
                </label>
                <textarea className="input" id="giftNote" name="giftNote" rows={3} maxLength={500} placeholder="Например: «С годовщиной, любимый! Твоя Алия»" />
                <p className="mt-1.5 text-xs text-muted">Напечатаем на открытке и вложим в упаковку. Можно оставить пустым.</p>
              </div>
              <div>
                <label className="label" htmlFor="desiredDate">
                  Нужна к дате
                </label>
                <input className="input" id="desiredDate" name="desiredDate" type="date" min={today} value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
                {fit ? (
                  fit.ok ? (
                    <p className="mt-1.5 text-xs text-emerald-700" data-testid="date-fit">
                      <Check className="mr-0.5 inline size-3" /> Успеваем
                      {defaults.occasionLabel ? ` к празднику «${defaults.occasionLabel}»` : ""}
                    </p>
                  ) : fit.premiumOk && !express ? (
                    <p className="mt-1.5 text-xs text-amber-700" data-testid="date-fit">
                      Обычное производство не успеет.{" "}
                      {offered.some((a) => a.id === "express") ? (
                        <button type="button" className="font-medium underline" onClick={() => toggleAddon("express")}>
                          Добавить экспресс-печать
                        </button>
                      ) : (
                        <button type="button" className="font-medium underline" onClick={() => setPlanId("premium")}>
                          Выбрать «Премиум»
                        </button>
                      )}{" "}
                      — печатаем вне очереди.
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs text-amber-700" data-testid="date-fit">
                      {delivery === "post" ? "С почтовой доставкой не успеем — попробуйте курьера или самовывоз." : "К этой дате напечатать уже не успеем, но постараемся ускориться — напишите нам."}
                    </p>
                  )
                ) : (
                  <p className="mt-1.5 text-xs text-muted">Подскажем, успеваем ли</p>
                )}
              </div>
            </div>
            <label className="mt-4 flex items-start gap-2.5 text-sm text-ink-soft">
              <input type="checkbox" name="surprise" className="mt-0.5 size-4 accent-wine" />
              <span>Это сюрприз — не звонить получателю заранее, согласовывать доставку со мной</span>
            </label>
          </section>
        ) : null}

        <section>
          <h2 className="text-xl font-semibold">{plan.printed ? "4" : "2"}. Контакты</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="contactName">
                {plan.printed ? "Имя получателя" : "Ваше имя"}
              </label>
              <input className="input" id="contactName" name="contactName" defaultValue={defaults.name} required maxLength={100} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="contactPhone">
                Телефон
              </label>
              <input className="input" id="contactPhone" name="contactPhone" type="tel" defaultValue={defaults.phone} placeholder="+7 7__ ___ __ __" required autoComplete="tel" />
            </div>
            <div>
              <label className="label" htmlFor="contactEmail">
                E-mail
              </label>
              <input className="input" id="contactEmail" name="contactEmail" type="email" defaultValue={defaults.email} required autoComplete="email" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="comment">
                Комментарий к заказу
              </label>
              <textarea className="input" id="comment" name="comment" rows={2} maxLength={1000} placeholder="Например, удобное время доставки" />
            </div>
          </div>
        </section>
      </div>

      <aside>
        <div className="card sticky top-24 p-6">
          <h2 className="text-lg font-semibold">Итого</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">
                {plan.name}
                {plan.printed && qty > 1 ? ` × ${qty}` : ""}
              </dt>
              <dd>{formatPrice(items)}</dd>
            </div>
            {discountAmount ? (
              <div className="flex justify-between text-emerald-700">
                <dt>
                  {promo?.code?.startsWith("GIFT-") ? "Сертификат" : "Промокод"} {promo?.code} ({promo?.label})
                </dt>
                <dd>−{formatPrice(discountAmount)}</dd>
              </div>
            ) : null}
            {appliedAddons.map((id) => {
              const a = offered.find((x) => x.id === id)!;
              return (
                <div key={id} className="flex justify-between">
                  <dt className="text-muted">{a.name}</dt>
                  <dd>{formatPrice(a.price)}</dd>
                </div>
              );
            })}
            {plan.printed ? (
              <div className="flex justify-between">
                <dt className="text-muted">Доставка</dt>
                <dd>{deliveryPrice ? formatPrice(deliveryPrice) : "Бесплатно"}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4">
            {promo?.ok ? (
              <>
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  <span className="flex items-center gap-1.5">
                    <Tag className="size-4" /> {promo.code} применён
                  </span>
                  <button type="button" onClick={() => setPromo(null)} aria-label="Убрать промокод" className="p-1">
                    <X className="size-4" />
                  </button>
                </div>
                {promo.kind === "fixed" && promo.value && promo.value > items ? (
                  <p className="mt-2 text-xs leading-snug text-amber-800">
                    Номинал больше стоимости книг на {formatPrice(promo.value - items)} — остаток не сохранится. Можно выбрать тариф дороже или добавить экземпляр.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="flex gap-2">
                <input
                  className="input h-10 text-sm uppercase placeholder:normal-case"
                  placeholder="Промокод"
                  value={promoInput}
                  maxLength={40}
                  onChange={(e) => setPromoInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (promoInput.trim()) applyPromo();
                    }
                  }}
                />
                <button type="button" className="btn btn-outline btn-sm h-10 shrink-0" onClick={applyPromo} disabled={!promoInput.trim() || checkingPromo}>
                  {checkingPromo ? <LoaderCircle className="size-4 animate-spin" /> : "Применить"}
                </button>
              </div>
            )}
            {promoError ? <p className="mt-1.5 text-xs text-red-700">{promoError}</p> : null}
          </div>
          <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
            <span className="font-medium">К оплате</span>
            <span className="font-serif text-3xl font-medium">{formatPrice(total)}</span>
          </div>
          {state.error ? <Alert className="mt-4">{state.error}</Alert> : null}
          <label className="mt-5 flex items-start gap-2.5 text-xs text-muted">
            <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-wine" />
            <span>
              Я проверил(а) макет книги и принимаю{" "}
              <Link href="/offer" target="_blank" className="text-wine underline">
                условия оферты
              </Link>
              . После оформления редактирование книги будет закрыто.
            </span>
          </label>
          <SubmitButton className="btn-lg mt-5 w-full" pendingText="Оформляем…">
            Оформить заказ
          </SubmitButton>
          {blocked ? <p className="mt-3 text-center text-xs text-red-700">Сначала исправьте замечания выше</p> : null}
          <TrustList compact className="mt-6 border-t border-line pt-5 text-ink-soft" />
        </div>
      </aside>
    </form>
  );
}
