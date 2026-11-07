"use client";

import { Link, useMessages } from "@/i18n/client";
import type { AgreementGift } from "@/shared/domain/agreementGifts";
import { Check, ChevronRight, Gift, Globe, LoaderCircle, Minus, Plus, Tag, X } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TrustList } from "@/components/TrustList";
import { Alert } from "@/components/ui/Alert";
import { formatPrice, getDeliveryOptions, getPlan, getVisiblePlans, isAbroadDelivery, isQuotedDelivery, site, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
import { cn } from "@/lib/class-names";
import { orderByDate, startOfDay } from "@/lib/occasions";
import type { PromoPreview } from "../actions";

type Plan = NonNullable<ReturnType<typeof getPlan>>;
type Addon = { id: AddonId; price: number };
export type AgreementMode = "agreed" | "advance";

/** Суммы итога — из quoteCheckout. */
export interface SummaryPrice {
  items: number;
  discountAmount: number;
  agreedDiscount: number;
  prepaidApplied: number;
  addons: readonly AddonId[];
  deliveryPrice: number;
  total: number;
  /** Выбранное и бесплатное по договорённости (упаковка, доставка). */
  gifted?: readonly AgreementGift[];
  /** Доставка в другую страну: в итог не входит, стоимость рассчитает менеджер. */
  deliveryQuoted?: boolean;
}

/** Поле промокода: применённый (value), ввод, проверка и ошибка — usePromo. */
export interface PromoField {
  value: PromoPreview | null;
  input: string;
  setInput: (v: string) => void;
  apply: () => void;
  remove: () => void;
  checking: boolean;
  error: string | null;
}

/**
 * Шаг оформления — лист с номером и заголовком (шаги идут по порядку: вариант, доставка, подарок, контакты, оплата).
 * id — якорь для полоски шагов наверху.
 */
function Step({ id, n, title, children }: { id: string; n: number; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-[14px] border border-line bg-white">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-6">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white tabular-nums" aria-hidden>
          {n}
        </span>
        <h2 id={`${id}-title`} className="text-[17px] font-semibold">
          {title}
        </h2>
      </header>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

/** Выбранный вариант (тариф, доставка, доп): рамка цвета переплёта — общий вид у всех «карточек выбора». */
const option = (on: boolean) => cn("rounded-[10px] border bg-white transition-colors", on ? "border-wine bg-rose/25 ring-2 ring-wine/15" : "border-line-strong hover:border-ink/35");

/** Полоска шагов над формой: где я и сколько осталось; пункты — ссылки на шаги. */
export function StepsNav({ printed }: { printed: boolean }) {
  const t = useMessages().checkout;
  const steps = printed
    ? [
        ["step-plan", t.step.plan],
        ["step-delivery", t.step.delivery],
        ["step-gift", t.step.gift],
        ["step-contacts", t.step.contacts],
        ["step-pay", t.step.pay],
      ]
    : [
        ["step-plan", t.step.plan],
        ["step-contacts", t.step.contacts],
        ["step-pay", t.step.pay],
      ];
  return (
    <nav aria-label={t.stepsAria} className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="flex items-center gap-1 text-sm whitespace-nowrap">
        {steps.map(([id, label], i) => (
          <li key={id} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-line-strong" aria-hidden /> : null}
            <a href={`#${id}`} className="flex min-h-11 items-center gap-2 rounded-[10px] px-2 text-ink-soft hover:bg-ink/5 hover:text-ink sm:min-h-9">
              <span className="flex size-5 items-center justify-center rounded-full border border-line-strong text-[11px] font-medium text-muted tabular-nums">{i + 1}</span>
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Дозаказ печатной версии к оплаченной электронной: её оплата засчитается. */
export function UpgradeNote({ upgrade }: { upgrade: { number: number; credit: number } }) {
  const t = useMessages().checkout;
  return (
    <section className="rounded-[14px] border border-success/25 bg-success-bg p-5" data-testid="upgrade">
      <h2 className="text-lg font-semibold text-ink">{t.upgrade.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t.upgrade.text(upgrade.number, upgrade.credit > 0 ? formatPrice(upgrade.credit) : "0")}</p>
    </section>
  );
}

/** Договорённость менеджера: продолжить по ней или оформить заказ «с нуля» (внесённое — аванс). */
export function AgreementChoice({ agreement, mode, onMode }: { agreement: { dealNumber: number; agreedTotal: number; prepaid: number; batch?: { index: number; size: number } | null; gifts?: AgreementGift[] }; mode: AgreementMode; onMode: (mode: AgreementMode) => void }) {
  const m = useMessages();
  const t = m.checkout;
  return (
    <section className="rounded-[14px] border border-success/25 bg-success-bg p-5" data-testid="agreement">
      <input type="hidden" name="agreementMode" value={mode} />
      <h2 className="text-lg font-semibold text-ink">{t.agreement.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t.agreement.summary(agreement.dealNumber, formatPrice(agreement.agreedTotal), formatPrice(agreement.prepaid))}</p>
      {agreement.batch && agreement.batch.size > 1 ? <p className="mt-1 text-sm font-medium text-ink">{t.agreement.batch(agreement.batch.index + 1, agreement.batch.size)}</p> : null}
      {agreement.gifts?.length ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink" data-testid="agreement-gifts">
          <Gift className="size-4 shrink-0 text-success" aria-hidden /> {t.agreement.gifts(agreement.gifts.map((g) => m.common.agreementGifts[g]).join(", "))}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
        {(["agreed", "advance"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            onClick={() => onMode(id)}
            className={cn(option(mode === id), "p-4 text-left")}
          >
            <div className="text-sm font-semibold">{id === "agreed" ? t.agreement.continueTitle : t.agreement.newTitle}</div>
            <div className="mt-1 text-xs leading-snug text-muted">{id === "agreed" ? t.agreement.continueHint : t.agreement.newHint(formatPrice(agreement.prepaid))}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        {t.agreement.refund}{" "}
        <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="font-medium underline">
          {t.agreement.refundLink}
        </a>
      </p>
    </section>
  );
}

/** 1. Тариф, количество экземпляров и допы. */
export function PlanSection({ plans, planId, lockedPlan, onPlan, qty, onQty, offered, applied, onToggleAddon, gifts = [] }: { plans: readonly Plan[]; planId: PlanId; lockedPlan: PlanId | null; onPlan: (id: PlanId) => void; qty: number; onQty: (update: (q: number) => number) => void; offered: Addon[]; applied: readonly AddonId[]; onToggleAddon: (id: AddonId) => void; gifts?: readonly AgreementGift[] }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  const plan = plans.find((p) => p.id === planId) ?? getPlan(planId)!;
  return (
    <Step id="step-plan" n={1} title={t.step.plan}>
      {lockedPlan ? <p className="mb-4 rounded-[10px] bg-success-bg px-3 py-2 text-sm text-success" data-testid="plan-locked">{t.agreement.planLocked(c.plans[lockedPlan].name)}</p> : null}
      <div role="radiogroup" aria-label={t.step.plan} className={`grid gap-3 ${plans.length === 1 ? "sm:grid-cols-1" : plans.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {plans.map((p) => (
          <button
            type="button"
            key={p.id}
            disabled={!!lockedPlan}
            role="radio"
            aria-checked={planId === p.id}
            onClick={() => onPlan(p.id)}
            className={cn(option(planId === p.id), "relative p-4 text-left sm:p-5")}
          >
            {planId === p.id ? (
              <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                <Check className="size-3.5" />
              </span>
            ) : null}
            <div className="font-semibold">{c.plans[p.id].name}</div>
            <div className="mt-1 font-serif text-2xl">{formatPrice(p.price)}</div>
            <ul className="mt-3 space-y-1 text-xs leading-snug text-muted">
              {c.plans[p.id].features.slice(0, 3).map((f) => (
                <li key={f} className="flex gap-1.5">
                  <Check className="mt-px size-3 shrink-0 text-muted" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {plan.printed ? (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm text-ink-soft">{t.copies}</span>
          <div className="flex items-center rounded-[10px] border border-line-strong bg-white">
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-l-[10px] hover:bg-sunken disabled:opacity-40"
              onClick={() => onQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label={t.fewer}
            >
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center font-medium tabular-nums" aria-live="polite">{qty}</span>
            <button
              type="button"
              className="flex size-11 items-center justify-center rounded-r-[10px] hover:bg-sunken disabled:opacity-40"
              onClick={() => onQty((q) => Math.min(20, q + 1))}
              disabled={qty >= 20}
              aria-label={t.more}
            >
              <Plus className="size-4" />
            </button>
          </div>
          {plan.extraCopyPrice ? <span className="text-sm text-muted">{t.nextCopy(formatPrice(plan.extraCopyPrice))}</span> : null}
        </div>
      ) : null}
      {offered.length ? (
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {offered.map((a) => {
            const on = applied.includes(a.id);
            return (
              <label
                key={a.id}
                className={cn(option(on), "flex cursor-pointer items-start gap-3 p-4")}
              >
                <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={on} onChange={() => onToggleAddon(a.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2 font-medium">
                    {c.addons[a.id].name}{" "}
                    {a.id === "giftwrap" && gifts.includes("giftwrap") ? (
                      <span className="shrink-0 font-normal text-success">{t.agreement.giftFree}</span>
                    ) : (
                      <span className="shrink-0 font-normal text-ink-soft">+{formatPrice(a.price)}</span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{c.addons[a.id].description}</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </Step>
  );
}

/** 2. Доставка и адрес (для печатных тарифов). */
export function DeliverySection({ delivery, onDelivery, gifts = [] }: { delivery: DeliveryId; onDelivery: (id: DeliveryId) => void; gifts?: readonly AgreementGift[] }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  return (
    <Step id="step-delivery" n={2} title={t.step.delivery}>
      <div className="grid gap-2.5" role="radiogroup" aria-label={t.step.delivery}>
        {getDeliveryOptions().map((d) => (
          <label
            key={d.id}
            className={cn(option(delivery === d.id), "flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 p-4 sm:flex-nowrap sm:gap-4")}
          >
            <input type="radio" name="_delivery" className="size-4 accent-wine" checked={delivery === d.id} onChange={() => onDelivery(d.id)} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.delivery[d.id].name}</div>
              <div className="text-sm text-muted">{c.delivery[d.id].description}</div>
            </div>
            <div className="text-sm font-medium max-sm:basis-full max-sm:pl-7 sm:max-w-[38%] sm:shrink-0 sm:text-right">{isQuotedDelivery(d.id, gifts) ? <span className="text-xs font-normal text-muted">{t.quoted.price}</span> : !d.price ? c.free : gifts.includes("delivery") ? <span className="text-success">{t.agreement.giftFree}</span> : formatPrice(d.price)}</div>
          </label>
        ))}
      </div>
      {isQuotedDelivery(delivery, gifts) ? (
        <p className="mt-4 flex gap-2 rounded-[10px] bg-warning-bg p-3.5 text-sm text-warning" data-testid="abroad-note">
          <Globe className="mt-0.5 size-4 shrink-0" />
          {t.quoted.note}
        </p>
      ) : null}
      {delivery !== "pickup" ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_2fr]">
          {isAbroadDelivery(delivery) ? (
            <Field label={t.country} className="sm:col-span-2 sm:max-w-sm">
              <input className="input" id="country" name="country" required minLength={2} maxLength={60} placeholder={t.countryPlaceholder} autoComplete="country-name" />
            </Field>
          ) : null}
          <Field label={t.city}>
            <input className="input" id="city" name="city" required maxLength={100} autoComplete="address-level2" />
          </Field>
          <Field label={t.address}>
            <input className="input" id="address" name="address" required maxLength={300} placeholder={t.addressPlaceholder} autoComplete="street-address" />
          </Field>
          <Field label={t.postalCode}>
            <input className="input" id="postalCode" name="postalCode" required={isAbroadDelivery(delivery)} maxLength={20} inputMode={isAbroadDelivery(delivery) ? undefined : "numeric"} autoComplete="postal-code" />
          </Field>
        </div>
      ) : null}
    </Step>
  );
}

/** 3. Подарок: записка, к какой дате нужна книга (успеваем ли с этим тарифом и доставкой), сюрприз. */
export function GiftSection({ now, today, desiredDate, onDesiredDate, occasionLabel, planId, delivery, offered, applied, onToggleAddon, onPlan }: { now: Date; today: string; desiredDate: string; onDesiredDate: (day: string) => void; occasionLabel?: string | null; planId: PlanId; delivery: DeliveryId; offered: Addon[]; applied: readonly AddonId[]; onToggleAddon: (id: AddonId) => void; onPlan: (id: PlanId) => void }) {
  const t = useMessages().checkout;
  const express = planId === "premium" || applied.includes("express");
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
  return (
    <Step id="step-gift" n={3} title={t.step.gift}>
      <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
        <Field label={t.giftNote} hint={t.giftNoteHint}>
          <textarea className="input" id="giftNote" name="giftNote" rows={3} maxLength={500} placeholder={t.giftNotePlaceholder} />
        </Field>
        <div>
          <label className="label" htmlFor="desiredDate">
            {t.desiredDate}
          </label>
          <input className="input" id="desiredDate" name="desiredDate" type="date" min={today} value={desiredDate} onChange={(e) => onDesiredDate(e.target.value)} />
          {fit ? (
            fit.ok ? (
              <p className="mt-1.5 text-xs text-success" data-testid="date-fit">
                <Check className="mr-0.5 inline size-3" /> {isAbroadDelivery(delivery) ? t.abroad.fitOk : t.fitOk}
                {occasionLabel && !isAbroadDelivery(delivery) ? t.fitOccasion(occasionLabel) : ""}
              </p>
            ) : fit.premiumOk && !express ? (
              <p className="mt-1.5 text-xs text-warning" data-testid="date-fit">
                {t.fitSlow}{" "}
                {offered.some((a) => a.id === "express") ? (
                  <button type="button" className="font-medium underline" onClick={() => onToggleAddon("express")}>
                    {t.addExpress}
                  </button>
                ) : getVisiblePlans().some((p) => p.id === "premium") ? (
                  <button type="button" className="font-medium underline" onClick={() => onPlan("premium")}>
                    {t.choosePremium}
                  </button>
                ) : null}{" "}
                {t.fitFaster}
              </p>
            ) : (
              <p className="mt-1.5 text-xs text-warning" data-testid="date-fit">
                {isAbroadDelivery(delivery) ? t.abroad.fitNo : delivery === "post" ? t.fitPost : t.fitNo}
              </p>
            )
          ) : (
            <p className="mt-1.5 text-xs text-muted">{t.fitHint}</p>
          )}
        </div>
      </div>
      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm text-ink-soft">
        <input type="checkbox" name="surprise" className="mt-0.5 size-4 shrink-0 accent-wine" />
        <span>{t.surprise}</span>
      </label>
    </Step>
  );
}

/** Контакты получателя (или покупателя электронной версии) и комментарий. */
export function ContactsSection({ printed, defaults }: { printed: boolean; defaults: { name: string; email: string; phone: string } }) {
  const t = useMessages().checkout;
  return (
    <Step id="step-contacts" n={printed ? 4 : 2} title={t.step.contacts}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={printed ? t.recipientName : t.yourName} className="sm:col-span-2">
          <input className="input" id="contactName" name="contactName" defaultValue={defaults.name} required maxLength={100} autoComplete="name" />
        </Field>
        <Field label={t.phone}>
          <input className="input" id="contactPhone" name="contactPhone" type="tel" inputMode="tel" defaultValue={defaults.phone} placeholder="+7 7__ ___ __ __" required autoComplete="tel" />
        </Field>
        <Field label={t.email}>
          <input className="input" id="contactEmail" name="contactEmail" type="email" inputMode="email" defaultValue={defaults.email} required autoComplete="email" />
        </Field>
        <Field label={t.comment} className="sm:col-span-2">
          <textarea className="input" id="comment" name="comment" rows={2} maxLength={1000} placeholder={t.commentPlaceholder} />
        </Field>
      </div>
    </Step>
  );
}

/** Итог: строки суммы, промокод или сертификат, «К оплате», согласие с офертой и кнопка. */
export function Summary({ plan, qty, price, promo, upgrade, offered, error, blocked, step }: { plan: Plan; qty: number; price: SummaryPrice; promo: PromoField; upgrade: { number: number } | null; offered: Addon[]; error?: string; blocked: boolean; /** Номер шага «Оплата» в полоске шагов. */ step: number }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  const { items, discountAmount, agreedDiscount, prepaidApplied, addons, deliveryPrice, total, gifted = [], deliveryQuoted = false } = price;
  const applied = promo.value;
  return (
  <aside id="step-pay" className="scroll-mt-24">
    <div className="sticky top-20 rounded-[14px] border border-line bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-[17px] font-semibold">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-wine text-xs font-semibold text-white tabular-nums" aria-hidden>
          {step}
        </span>
        {t.total}
      </h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">
            {c.plans[plan.id].name}
            {plan.printed && qty > 1 ? ` × ${qty}` : ""}
          </dt>
          <dd>{formatPrice(items)}</dd>
        </div>
        {discountAmount ? (
          <div className="flex justify-between gap-3 text-success">
            <dt>
              {applied?.code?.startsWith("GIFT-") ? t.certificate : t.promoCode} {applied?.code} ({applied?.label})
            </dt>
            <dd>−{formatPrice(discountAmount)}</dd>
          </div>
        ) : null}
        {agreedDiscount > 0 ? (
          <div className="flex justify-between gap-3 text-success">
            <dt>{t.agreement.agreedLine}</dt>
            <dd>−{formatPrice(agreedDiscount)}</dd>
          </div>
        ) : null}
        {prepaidApplied > 0 ? (
          <div className="flex justify-between gap-3 text-success" data-testid="prepaid-line">
            <dt>{upgrade ? t.upgrade.creditLine(upgrade.number) : t.agreement.prepaidLine}</dt>
            <dd>−{formatPrice(prepaidApplied)}</dd>
          </div>
        ) : null}
        {addons.map((id) => {
          const a = offered.find((x) => x.id === id)!;
          return (
            <div key={id} className="flex justify-between">
              <dt className="text-muted">{c.addons[a.id].name}</dt>
              <dd>{gifted.includes(a.id as AgreementGift) ? <span className="text-success">{t.agreement.giftFree}</span> : formatPrice(a.price)}</dd>
            </div>
          );
        })}
        {plan.printed ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t.delivery}</dt>
            <dd>{deliveryQuoted ? <span className="text-muted">{t.quoted.price}</span> : gifted.includes("delivery") ? <span className="text-success">{t.agreement.giftFree}</span> : deliveryPrice ? formatPrice(deliveryPrice) : c.free}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4">
        {applied?.ok ? (
          <>
            <div className="flex items-center justify-between rounded-[10px] bg-success-bg py-1 pr-1 pl-3 text-sm text-success">
              <span className="flex items-center gap-1.5">
                <Tag className="size-4" /> {t.promoApplied(applied.code ?? "")}
              </span>
              <button type="button" onClick={() => promo.remove()} aria-label={t.promoRemove} className="flex size-9 items-center justify-center rounded-lg hover:bg-white/60">
                <X className="size-4" />
              </button>
            </div>
            {applied.kind === "fixed" && applied.value && applied.value > items ? (
              <p className="mt-2 text-xs leading-snug text-warning">
                {t.promoOver(formatPrice(applied.value - items))}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex gap-2">
            <input
              className="input h-11 text-sm uppercase placeholder:normal-case"
              aria-label={t.promoPlaceholder}
              aria-invalid={promo.error ? true : undefined}
              aria-describedby={promo.error ? "promo-error" : undefined}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder={t.promoPlaceholder}
              value={promo.input}
              maxLength={40}
              onChange={(e) => promo.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (promo.input.trim()) promo.apply();
                }
              }}
            />
            <button type="button" className="btn btn-outline h-11 shrink-0 px-4 text-sm" onClick={promo.apply} disabled={!promo.input.trim() || promo.checking}>
              {promo.checking ? <LoaderCircle className="size-4 animate-spin" /> : t.apply}
            </button>
          </div>
        )}
        {promo.error ? <p id="promo-error" role="alert" className="field-error">{promo.error}</p> : null}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-medium">{t.toPay}</span>
        <span className="font-serif text-3xl font-medium tabular-nums">{formatPrice(total)}</span>
      </div>
      {deliveryQuoted ? (
        <p className="mt-1 text-right text-xs text-muted" data-testid="abroad-total">
          {t.quoted.total}
        </p>
      ) : null}
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-wine" />
        <span>
          {t.consent.start}{" "}
          <Link href="/offer" target="_blank" className="text-wine underline">
            {t.consent.offer}
          </Link>
          {t.consent.end}
        </span>
      </label>
      <SubmitButton className="btn-lg mt-5 w-full" pendingText={t.pending}>
        {t.submit}
      </SubmitButton>
      {blocked ? <p className="mt-3 text-center text-xs text-danger">{t.blocked}</p> : null}
      <TrustList compact className="mt-6 border-t border-line pt-5 text-ink-soft" />
    </div>
  </aside>
  );
}

/** На телефоне итог уезжает вниз — держим сумму и кнопку под рукой. */
export function MobileBar({ total, deliveryQuoted = false, error }: { total: number; deliveryQuoted?: boolean; /** Ошибка оформления с сервера: итог с ней — внизу страницы, а кнопка здесь. */ error?: string }) {
  const t = useMessages().checkout;
  return (
  <div data-bottom-bar className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 backdrop-blur-md lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
    {error ? (
      <p role="alert" className="mb-2 line-clamp-2 text-xs font-medium text-danger">
        {error}
      </p>
    ) : null}
    <div className="flex items-center gap-3">
    <div className="min-w-0 flex-1">
      <div className="text-xs text-muted">{t.toPay}</div>
      <div className="font-serif text-2xl leading-none tabular-nums">{formatPrice(total)}</div>
      {deliveryQuoted ? <div className="mt-0.5 truncate text-[11px] text-muted">{t.quoted.total}</div> : null}
    </div>
    <SubmitButton className="h-11" pendingText={t.pending}>
      {t.submitShort}
    </SubmitButton>
    </div>
  </div>
  );
}
