"use client";

import { Link, useMessages } from "@/i18n/client";
import { Check, LoaderCircle, Minus, Plus, Tag, X } from "lucide-react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TrustList } from "@/components/TrustList";
import { Alert } from "@/components/ui/Alert";
import { formatPrice, getDeliveryOptions, getPlan, getVisiblePlans, site, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
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

/** Дозаказ печатной версии к оплаченной электронной: её оплата засчитается. */
export function UpgradeNote({ upgrade }: { upgrade: { number: number; credit: number } }) {
  const t = useMessages().checkout;
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5" data-testid="upgrade">
      <h2 className="text-lg font-semibold text-emerald-950">{t.upgrade.title}</h2>
      <p className="mt-1 text-sm text-emerald-900">{t.upgrade.text(upgrade.number, upgrade.credit > 0 ? formatPrice(upgrade.credit) : "0")}</p>
    </section>
  );
}

/** Договорённость менеджера: продолжить по ней или оформить заказ «с нуля» (внесённое — аванс). */
export function AgreementChoice({ agreement, mode, onMode }: { agreement: { dealNumber: number; agreedTotal: number; prepaid: number; batch?: { index: number; size: number } | null }; mode: AgreementMode; onMode: (mode: AgreementMode) => void }) {
  const t = useMessages().checkout;
  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5" data-testid="agreement">
      <input type="hidden" name="agreementMode" value={mode} />
      <h2 className="text-lg font-semibold text-emerald-950">{t.agreement.title}</h2>
      <p className="mt-1 text-sm text-emerald-900">{t.agreement.summary(agreement.dealNumber, formatPrice(agreement.agreedTotal), formatPrice(agreement.prepaid))}</p>
      {agreement.batch && agreement.batch.size > 1 ? <p className="mt-1 text-sm font-medium text-emerald-950">{t.agreement.batch(agreement.batch.index + 1, agreement.batch.size)}</p> : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup">
        {(["agreed", "advance"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            onClick={() => onMode(id)}
            className={cn("rounded-xl border bg-white p-4 text-left transition", mode === id ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
          >
            <div className="text-sm font-semibold">{id === "agreed" ? t.agreement.continueTitle : t.agreement.newTitle}</div>
            <div className="mt-1 text-xs leading-snug text-muted">{id === "agreed" ? t.agreement.continueHint : t.agreement.newHint(formatPrice(agreement.prepaid))}</div>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-emerald-900">
        {t.agreement.refund}{" "}
        <a href={site.contacts.whatsapp} target="_blank" rel="noopener noreferrer" className="font-medium underline">
          {t.agreement.refundLink}
        </a>
      </p>
    </section>
  );
}

/** 1. Тариф, количество экземпляров и допы. */
export function PlanSection({ plans, planId, lockedPlan, onPlan, qty, onQty, offered, applied, onToggleAddon }: { plans: readonly Plan[]; planId: PlanId; lockedPlan: PlanId | null; onPlan: (id: PlanId) => void; qty: number; onQty: (update: (q: number) => number) => void; offered: Addon[]; applied: readonly AddonId[]; onToggleAddon: (id: AddonId) => void }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  const plan = plans.find((p) => p.id === planId) ?? getPlan(planId)!;
  return (
    <section>
      <h2 className="text-xl font-semibold">1. {t.step.plan}</h2>
      {lockedPlan ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="plan-locked">{t.agreement.planLocked(c.plans[lockedPlan].name)}</p> : null}
      <div className={`mt-4 grid gap-3 ${plans.length === 1 ? "sm:grid-cols-1" : plans.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
        {plans.map((p) => (
          <button
            type="button"
            key={p.id}
            disabled={!!lockedPlan}
            onClick={() => onPlan(p.id)}
            className={cn("relative rounded-2xl border bg-white p-5 text-left transition", planId === p.id ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
          >
            {planId === p.id ? (
              <span className="absolute top-3 right-3 flex size-6 items-center justify-center rounded-full bg-wine text-white">
                <Check className="size-3.5" />
              </span>
            ) : null}
            <div className="font-semibold">{c.plans[p.id].name}</div>
            <div className="mt-1 font-serif text-2xl">{formatPrice(p.price)}</div>
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {c.plans[p.id].features.slice(0, 3).map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {plan.printed ? (
        <div className="mt-5 flex items-center gap-4">
          <span className="text-sm text-ink-soft">{t.copies}</span>
          <div className="flex items-center rounded-full border border-line bg-white">
            <button
              type="button"
              className="flex size-10 items-center justify-center disabled:opacity-40"
              onClick={() => onQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label={t.fewer}
            >
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center font-medium tabular-nums">{qty}</span>
            <button
              type="button"
              className="flex size-10 items-center justify-center disabled:opacity-40"
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
                className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition", on ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
              >
                <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={on} onChange={() => onToggleAddon(a.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2 font-medium">
                    {c.addons[a.id].name} <span className="shrink-0 font-normal text-ink-soft">+{formatPrice(a.price)}</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{c.addons[a.id].description}</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

/** 2. Доставка и адрес (для печатных тарифов). */
export function DeliverySection({ delivery, onDelivery }: { delivery: DeliveryId; onDelivery: (id: DeliveryId) => void }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  return (
    <section>
      <h2 className="text-xl font-semibold">2. {t.step.delivery}</h2>
      <div className="mt-4 grid gap-3">
        {getDeliveryOptions().map((d) => (
          <label
            key={d.id}
            className={cn("flex cursor-pointer items-center gap-4 rounded-2xl border bg-white p-4 transition", delivery === d.id ? "border-wine ring-4 ring-wine/10" : "border-line")}
          >
            <input type="radio" name="_delivery" className="size-4 accent-wine" checked={delivery === d.id} onChange={() => onDelivery(d.id)} />
            <div className="flex-1">
              <div className="font-medium">{c.delivery[d.id].name}</div>
              <div className="text-sm text-muted">{c.delivery[d.id].description}</div>
            </div>
            <div className="text-sm font-medium">{d.price ? formatPrice(d.price) : c.free}</div>
          </label>
        ))}
      </div>
      {delivery !== "pickup" ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_2fr]">
          <div>
            <label className="label" htmlFor="city">
              {t.city}
            </label>
            <input className="input" id="city" name="city" required maxLength={100} autoComplete="address-level2" />
          </div>
          <div>
            <label className="label" htmlFor="address">
              {t.address}
            </label>
            <input className="input" id="address" name="address" required maxLength={300} placeholder={t.addressPlaceholder} autoComplete="street-address" />
          </div>
          <div>
            <label className="label" htmlFor="postalCode">
              {t.postalCode}
            </label>
            <input className="input" id="postalCode" name="postalCode" maxLength={20} autoComplete="postal-code" />
          </div>
        </div>
      ) : null}
    </section>
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
    <section>
      <h2 className="text-xl font-semibold">3. {t.step.gift}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_220px]">
        <div>
          <label className="label" htmlFor="giftNote">
            {t.giftNote}
          </label>
          <textarea className="input" id="giftNote" name="giftNote" rows={3} maxLength={500} placeholder={t.giftNotePlaceholder} />
          <p className="mt-1.5 text-xs text-muted">{t.giftNoteHint}</p>
        </div>
        <div>
          <label className="label" htmlFor="desiredDate">
            {t.desiredDate}
          </label>
          <input className="input" id="desiredDate" name="desiredDate" type="date" min={today} value={desiredDate} onChange={(e) => onDesiredDate(e.target.value)} />
          {fit ? (
            fit.ok ? (
              <p className="mt-1.5 text-xs text-emerald-700" data-testid="date-fit">
                <Check className="mr-0.5 inline size-3" /> {t.fitOk}
                {occasionLabel ? t.fitOccasion(occasionLabel) : ""}
              </p>
            ) : fit.premiumOk && !express ? (
              <p className="mt-1.5 text-xs text-amber-700" data-testid="date-fit">
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
              <p className="mt-1.5 text-xs text-amber-700" data-testid="date-fit">
                {delivery === "post" ? t.fitPost : t.fitNo}
              </p>
            )
          ) : (
            <p className="mt-1.5 text-xs text-muted">{t.fitHint}</p>
          )}
        </div>
      </div>
      <label className="mt-4 flex items-start gap-2.5 text-sm text-ink-soft">
        <input type="checkbox" name="surprise" className="mt-0.5 size-4 accent-wine" />
        <span>{t.surprise}</span>
      </label>
    </section>
  );
}

/** Контакты получателя (или покупателя электронной версии) и комментарий. */
export function ContactsSection({ printed, defaults }: { printed: boolean; defaults: { name: string; email: string; phone: string } }) {
  const t = useMessages().checkout;
  return (
    <section>
      <h2 className="text-xl font-semibold">{printed ? "4" : "2"}. {t.step.contacts}</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="contactName">
            {printed ? t.recipientName : t.yourName}
          </label>
          <input className="input" id="contactName" name="contactName" defaultValue={defaults.name} required maxLength={100} autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="contactPhone">
            {t.phone}
          </label>
          <input className="input" id="contactPhone" name="contactPhone" type="tel" defaultValue={defaults.phone} placeholder="+7 7__ ___ __ __" required autoComplete="tel" />
        </div>
        <div>
          <label className="label" htmlFor="contactEmail">
            {t.email}
          </label>
          <input className="input" id="contactEmail" name="contactEmail" type="email" defaultValue={defaults.email} required autoComplete="email" />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="comment">
            {t.comment}
          </label>
          <textarea className="input" id="comment" name="comment" rows={2} maxLength={1000} placeholder={t.commentPlaceholder} />
        </div>
      </div>
    </section>
  );
}

/** Итог: строки суммы, промокод или сертификат, «К оплате», согласие с офертой и кнопка. */
export function Summary({ plan, qty, price, promo, upgrade, offered, error, blocked }: { plan: Plan; qty: number; price: SummaryPrice; promo: PromoField; upgrade: { number: number } | null; offered: Addon[]; error?: string; blocked: boolean }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  const { items, discountAmount, agreedDiscount, prepaidApplied, addons, deliveryPrice, total } = price;
  const applied = promo.value;
  return (
  <aside>
    <div className="card sticky top-24 p-6">
      <h2 className="text-lg font-semibold">{t.total}</h2>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">
            {c.plans[plan.id].name}
            {plan.printed && qty > 1 ? ` × ${qty}` : ""}
          </dt>
          <dd>{formatPrice(items)}</dd>
        </div>
        {discountAmount ? (
          <div className="flex justify-between text-emerald-700">
            <dt>
              {applied?.code?.startsWith("GIFT-") ? t.certificate : t.promoCode} {applied?.code} ({applied?.label})
            </dt>
            <dd>−{formatPrice(discountAmount)}</dd>
          </div>
        ) : null}
        {agreedDiscount > 0 ? (
          <div className="flex justify-between text-emerald-700">
            <dt>{t.agreement.agreedLine}</dt>
            <dd>−{formatPrice(agreedDiscount)}</dd>
          </div>
        ) : null}
        {prepaidApplied > 0 ? (
          <div className="flex justify-between text-emerald-700" data-testid="prepaid-line">
            <dt>{upgrade ? t.upgrade.creditLine(upgrade.number) : t.agreement.prepaidLine}</dt>
            <dd>−{formatPrice(prepaidApplied)}</dd>
          </div>
        ) : null}
        {addons.map((id) => {
          const a = offered.find((x) => x.id === id)!;
          return (
            <div key={id} className="flex justify-between">
              <dt className="text-muted">{c.addons[a.id].name}</dt>
              <dd>{formatPrice(a.price)}</dd>
            </div>
          );
        })}
        {plan.printed ? (
          <div className="flex justify-between">
            <dt className="text-muted">{t.delivery}</dt>
            <dd>{deliveryPrice ? formatPrice(deliveryPrice) : c.free}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4">
        {applied?.ok ? (
          <>
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span className="flex items-center gap-1.5">
                <Tag className="size-4" /> {t.promoApplied(applied.code ?? "")}
              </span>
              <button type="button" onClick={() => promo.remove()} aria-label={t.promoRemove} className="p-1">
                <X className="size-4" />
              </button>
            </div>
            {applied.kind === "fixed" && applied.value && applied.value > items ? (
              <p className="mt-2 text-xs leading-snug text-amber-800">
                {t.promoOver(formatPrice(applied.value - items))}
              </p>
            ) : null}
          </>
        ) : (
          <div className="flex gap-2">
            <input
              className="input h-10 text-sm uppercase placeholder:normal-case"
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
            <button type="button" className="btn btn-outline btn-sm h-10 shrink-0" onClick={promo.apply} disabled={!promo.input.trim() || promo.checking}>
              {promo.checking ? <LoaderCircle className="size-4 animate-spin" /> : t.apply}
            </button>
          </div>
        )}
        {promo.error ? <p className="mt-1.5 text-xs text-red-700">{promo.error}</p> : null}
      </div>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-medium">{t.toPay}</span>
        <span className="font-serif text-3xl font-medium">{formatPrice(total)}</span>
      </div>
      {error ? <Alert className="mt-4">{error}</Alert> : null}
      <label className="mt-5 flex items-start gap-2.5 text-xs text-muted">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 accent-wine" />
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
      {blocked ? <p className="mt-3 text-center text-xs text-red-700">{t.blocked}</p> : null}
      <TrustList compact className="mt-6 border-t border-line pt-5 text-ink-soft" />
    </div>
  </aside>
  );
}

/** На телефоне итог уезжает вниз — держим сумму и кнопку под рукой. */
export function MobileBar({ total }: { total: number }) {
  const t = useMessages().checkout;
  return (
  <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-white/95 px-4 py-3 backdrop-blur-md lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
    <div className="min-w-0 flex-1">
      <div className="text-xs text-muted">{t.toPay}</div>
      <div className="font-serif text-2xl leading-none tabular-nums">{formatPrice(total)}</div>
    </div>
    <SubmitButton className="h-11" pendingText={t.pending}>
      {t.submitShort}
    </SubmitButton>
  </div>
  );
}
