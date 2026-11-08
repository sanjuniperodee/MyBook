"use client";

import { Link, useMessages } from "@/i18n/client";
import type { AgreementGift } from "@/shared/domain/agreementGifts";
import { Check, ChevronDown, ChevronLeft, Gift, Globe, LoaderCircle, Minus, Plus, Tag, X } from "lucide-react";
import { Field } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { TrustList } from "@/components/TrustList";
import { Alert } from "@/components/ui/Alert";
import { formatPrice, getDeliveryOptions, getPlan, giftNoteEnabled, getVisiblePlans, isAbroadDelivery, isQuotedDelivery, site, type AddonId, type DeliveryId, type PlanId } from "@/config/site";
import { cn } from "@/lib/class-names";
import { orderByDate, startOfDay } from "@/lib/occasions";
import type { PromoPreview } from "../actions";
import type { CheckoutErrors, CheckoutValues } from "./validate";
import { Group, option, RadioDot } from "./ui";

type Plan = NonNullable<ReturnType<typeof getPlan>>;
type Addon = { id: AddonId; price: number };
export type AgreementMode = "agreed" | "advance";

/** Поля формы оформления: текст, который вводит человек, — в состоянии формы, а не в разметке. */
export type FormValues = CheckoutValues & { comment: string; surprise: boolean };
export type SetValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) => void;

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

/** Дозаказ печатной версии к оплаченной электронной: её оплата засчитается. */
export function UpgradeNote({ upgrade }: { upgrade: { number: number; credit: number } }) {
  const t = useMessages().checkout;
  return (
    <section className="rounded-[14px] border border-success/25 bg-success-bg p-4 sm:p-5" data-testid="upgrade">
      <h2 className="text-[15px] font-semibold text-ink">{t.upgrade.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t.upgrade.text(upgrade.number, upgrade.credit > 0 ? formatPrice(upgrade.credit) : "0")}</p>
    </section>
  );
}

/** Договорённость менеджера: продолжить по ней или оформить заказ «с нуля» (внесённое — аванс). */
export function AgreementChoice({ agreement, mode, onMode }: { agreement: { dealNumber: number; agreedTotal: number; prepaid: number; batch?: { index: number; size: number } | null; gifts?: AgreementGift[] }; mode: AgreementMode; onMode: (mode: AgreementMode) => void }) {
  const m = useMessages();
  const t = m.checkout;
  return (
    <section className="rounded-[14px] border border-success/25 bg-success-bg p-4 sm:p-5" data-testid="agreement">
      <input type="hidden" name="agreementMode" value={mode} />
      <h2 className="text-[15px] font-semibold text-ink">{t.agreement.title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{t.agreement.summary(agreement.dealNumber, formatPrice(agreement.agreedTotal), formatPrice(agreement.prepaid))}</p>
      {agreement.batch && agreement.batch.size > 1 ? <p className="mt-1 text-sm font-medium text-ink">{t.agreement.batch(agreement.batch.index + 1, agreement.batch.size)}</p> : null}
      {agreement.gifts?.length ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink" data-testid="agreement-gifts">
          <Gift className="size-4 shrink-0 text-success" aria-hidden /> {t.agreement.gifts(agreement.gifts.map((g) => m.common.agreementGifts[g]).join(", "))}
        </p>
      ) : null}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2" role="radiogroup">
        {(["agreed", "advance"] as const).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={mode === id} onClick={() => onMode(id)} className={cn(option(mode === id), "flex gap-3 p-3.5 text-left")}>
            <RadioDot on={mode === id} />
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{id === "agreed" ? t.agreement.continueTitle : t.agreement.newTitle}</span>
              <span className="mt-1 block text-xs leading-snug text-muted">{id === "agreed" ? t.agreement.continueHint : t.agreement.newHint(formatPrice(agreement.prepaid))}</span>
            </span>
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

/** Шаг 1. Тариф (строки выбора с ценой справа), число экземпляров и допы. */
export function PlanStep({ plans, planId, lockedPlan, onPlan, qty, onQty, offered, applied, onToggleAddon, gifts = [] }: { plans: readonly Plan[]; planId: PlanId; lockedPlan: PlanId | null; onPlan: (id: PlanId) => void; qty: number; onQty: (update: (q: number) => number) => void; offered: Addon[]; applied: readonly AddonId[]; onToggleAddon: (id: AddonId) => void; gifts?: readonly AgreementGift[] }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  const plan = plans.find((p) => p.id === planId) ?? getPlan(planId)!;
  return (
    <div className="space-y-7">
      <Group title={t.step.plan}>
        {lockedPlan ? (
          <p className="mb-3 rounded-[10px] bg-success-bg px-3 py-2 text-sm text-success" data-testid="plan-locked">
            {t.agreement.planLocked(c.plans[lockedPlan].name)}
          </p>
        ) : null}
        <div role="radiogroup" aria-label={t.step.plan} className="grid gap-2.5">
          {plans.map((p) => (
            <button
              type="button"
              key={p.id}
              disabled={!!lockedPlan}
              role="radio"
              aria-checked={planId === p.id}
              onClick={() => onPlan(p.id)}
              className={cn(option(planId === p.id), "flex w-full items-start gap-3.5 p-4 text-left disabled:cursor-default")}
            >
              <RadioDot on={planId === p.id} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.plans[p.id].name}</span>
                <span className="mt-1.5 grid gap-x-5 gap-y-1 text-[13px] leading-snug text-muted sm:grid-cols-2">
                  {c.plans[p.id].features.slice(0, 4).map((f) => (
                    <span key={f} className="flex gap-1.5">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                      {f}
                    </span>
                  ))}
                </span>
              </span>
              <span className="shrink-0 font-serif text-2xl leading-none tabular-nums">{formatPrice(p.price)}</span>
            </button>
          ))}
        </div>
      </Group>

      {plan.printed ? (
        <Group title={t.copies} hint={plan.extraCopyPrice ? t.nextCopy(formatPrice(plan.extraCopyPrice)) : undefined}>
          <div className="inline-flex items-center rounded-[10px] border border-line-strong bg-white">
            <button type="button" className="flex size-11 items-center justify-center rounded-l-[10px] hover:bg-sunken disabled:opacity-40" onClick={() => onQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label={t.fewer}>
              <Minus className="size-4" />
            </button>
            <span className="w-10 text-center font-medium tabular-nums" aria-live="polite">
              {qty}
            </span>
            <button type="button" className="flex size-11 items-center justify-center rounded-r-[10px] hover:bg-sunken disabled:opacity-40" onClick={() => onQty((q) => Math.min(20, q + 1))} disabled={qty >= 20} aria-label={t.more}>
              <Plus className="size-4" />
            </button>
          </div>
        </Group>
      ) : null}

      {offered.length ? (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {offered.map((a) => {
            const on = applied.includes(a.id);
            return (
              <label key={a.id} className={cn(option(on), "flex cursor-pointer items-start gap-3 p-4")}>
                <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={on} onChange={() => onToggleAddon(a.id)} />
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2 font-medium">
                    {c.addons[a.id].name}{" "}
                    {a.id === "giftwrap" && gifts.includes("giftwrap") ? <span className="shrink-0 font-normal text-success">{t.agreement.giftFree}</span> : <span className="shrink-0 font-normal text-ink-soft">+{formatPrice(a.price)}</span>}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">{c.addons[a.id].description}</span>
                </span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Шаг 2, доставка (печатные тарифы): способ и адрес. */
export function DeliveryBlock({ delivery, onDelivery, gifts = [], v, set, errors }: { delivery: DeliveryId; onDelivery: (id: DeliveryId) => void; gifts?: readonly AgreementGift[]; v: FormValues; set: SetValue; errors: CheckoutErrors }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  return (
    <Group title={t.step.delivery}>
      <div className="grid gap-2.5" role="radiogroup" aria-label={t.step.delivery}>
        {getDeliveryOptions().map((d) => (
          <label key={d.id} className={cn(option(delivery === d.id), "flex cursor-pointer flex-wrap items-start gap-x-3 gap-y-1 p-4 sm:flex-nowrap sm:gap-4")}>
            <input type="radio" name="_delivery" className="mt-0.5 size-[18px] shrink-0 accent-wine" checked={delivery === d.id} onChange={() => onDelivery(d.id)} />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{c.delivery[d.id].name}</div>
              <div className="text-sm text-muted">{c.delivery[d.id].description}</div>
            </div>
            <div className="text-sm font-medium max-sm:basis-full max-sm:pl-8 sm:max-w-[38%] sm:shrink-0 sm:text-right">
              {isQuotedDelivery(d.id, gifts) ? <span className="text-xs font-normal text-muted">{t.quoted.price}</span> : !d.price ? c.free : gifts.includes("delivery") ? <span className="text-success">{t.agreement.giftFree}</span> : formatPrice(d.price)}
            </div>
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
            <Field label={t.country} error={errors.country} className="sm:col-span-2 sm:max-w-sm">
              <input className="input" id="country" name="country" required minLength={2} maxLength={60} placeholder={t.countryPlaceholder} autoComplete="country-name" value={v.country} onChange={(e) => set("country", e.target.value)} />
            </Field>
          ) : null}
          <Field label={t.city} error={errors.city}>
            <input className="input" id="city" name="city" required maxLength={100} autoComplete="address-level2" value={v.city} onChange={(e) => set("city", e.target.value)} />
          </Field>
          <Field label={t.address} error={errors.address}>
            <input className="input" id="address" name="address" required maxLength={300} placeholder={t.addressPlaceholder} autoComplete="street-address" value={v.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label={t.postalCode} error={errors.postalCode}>
            <input className="input" id="postalCode" name="postalCode" required={isAbroadDelivery(delivery)} maxLength={20} inputMode={isAbroadDelivery(delivery) ? undefined : "numeric"} autoComplete="postal-code" value={v.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
          </Field>
        </div>
      ) : null}
    </Group>
  );
}

/** Шаг 2, контакты: получатель (или покупатель электронной версии) и комментарий. */
export function ContactsBlock({ printed, v, set, errors }: { printed: boolean; v: FormValues; set: SetValue; errors: CheckoutErrors }) {
  const t = useMessages().checkout;
  return (
    <Group title={printed ? t.wizard.recipient : t.step.contacts}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={printed ? t.recipientName : t.yourName} error={errors.contactName} className="sm:col-span-2">
          <input className="input" id="contactName" name="contactName" required maxLength={100} autoComplete="name" value={v.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label={t.phone} error={errors.contactPhone}>
          <input className="input" id="contactPhone" name="contactPhone" type="tel" inputMode="tel" placeholder="+7 7__ ___ __ __" required autoComplete="tel" value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
        </Field>
        <Field label={t.email} error={errors.contactEmail}>
          <input className="input" id="contactEmail" name="contactEmail" type="email" inputMode="email" required autoComplete="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
        </Field>
        <Field label={t.comment} className="sm:col-span-2">
          <textarea className="input" id="comment" name="comment" rows={2} maxLength={1000} placeholder={t.commentPlaceholder} value={v.comment} onChange={(e) => set("comment", e.target.value)} />
        </Field>
      </div>
    </Group>
  );
}

/** Шаг 2, подарок: записка, к какой дате нужна книга (успеваем ли с этим тарифом и доставкой), сюрприз. */
export function GiftBlock({ now, today, desiredDate, onDesiredDate, occasionLabel, planId, delivery, offered, applied, onToggleAddon, onPlan, v, set, errors, open }: { now: Date; today: string; desiredDate: string; onDesiredDate: (day: string) => void; occasionLabel?: string | null; planId: PlanId; delivery: DeliveryId; offered: Addon[]; applied: readonly AddonId[]; onToggleAddon: (id: AddonId) => void; onPlan: (id: PlanId) => void; v: FormValues; set: SetValue; errors: CheckoutErrors; open: boolean }) {
  const t = useMessages().checkout;
  const express = planId === "premium" || applied.includes("express");
  // Успеваем ли к дате с выбранным тарифом и доставкой.
  const fit = desiredDate
    ? (() => {
        const by = orderByDate(desiredDate, express ? "premium" : planId, delivery);
        const byPremium = orderByDate(desiredDate, "premium", delivery);
        return { ok: by >= startOfDay(now), premiumOk: byPremium >= startOfDay(now), by };
      })()
    : null;
  // Открытку можно выключить в CRM («Сайт» → «Открытка к заказу»): тогда на шаге остаются дата и «сюрприз».
  const card = giftNoteEnabled();
  return (
    <details className="group/gift rounded-[10px] border border-line-strong bg-white" open={open}>
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-[15px] font-semibold">{t.step.gift}</span>
          <span className="block text-sm text-muted">
            {card ? t.wizard.giftGroup : t.wizard.giftGroupNoCard} · {t.wizard.optional}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted transition group-open/gift:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line p-4">
        <div className={card ? "grid gap-4 sm:grid-cols-[1fr_220px]" : "grid gap-4 sm:max-w-[220px]"}>
          {card ? (
            <Field label={t.giftNote} hint={t.giftNoteHint} error={errors.giftNote}>
              <textarea className="input" id="giftNote" name="giftNote" rows={3} maxLength={500} placeholder={t.giftNotePlaceholder} value={v.giftNote} onChange={(e) => set("giftNote", e.target.value)} />
            </Field>
          ) : null}
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
        <label className="mt-3 flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm text-ink-soft">
          <input type="checkbox" name="surprise" className="mt-0.5 size-4 shrink-0 accent-wine" checked={v.surprise} onChange={(e) => set("surprise", e.target.checked)} />
          <span>{t.surprise}</span>
        </label>
      </div>
    </details>
  );
}

/** Строка проверки: что выбрано, и кнопка «Изменить» ведёт на нужный шаг. */
function ReviewRow({ label, children, onEdit }: { label: string; children: React.ReactNode; onEdit: () => void }) {
  const t = useMessages().checkout;
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-start gap-x-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-sm break-words">{children}</dd>
      <button type="button" onClick={onEdit} className="-my-2 min-h-11 px-1 text-sm font-medium text-wine hover:underline">
        {t.wizard.edit}
      </button>
    </div>
  );
}

/** Шаг 3, проверка: выбранное одним списком — ничего не пропустить перед оплатой. */
export function ReviewBlock({ plan, qty, applied, delivery, v, desiredDate, onEdit }: { plan: Plan; qty: number; applied: readonly AddonId[]; delivery: DeliveryId; v: FormValues; desiredDate: string; onEdit: (step: 0 | 1) => void }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  const place = [isAbroadDelivery(delivery) ? v.country.trim() : "", v.city.trim(), v.address.trim()].filter(Boolean).join(", ");
  const gift = [giftNoteEnabled() ? v.giftNote.trim() : "", desiredDate ? t.wizard.giftDate(c.date(new Date(`${desiredDate}T12:00:00`), true)) : "", v.surprise ? t.wizard.giftSurprise : ""].filter(Boolean);
  return (
    <Group title={t.wizard.reviewTitle}>
      <dl className="divide-y divide-line rounded-[10px] border border-line bg-white p-4">
        <ReviewRow label={t.wizard.reviewPlan} onEdit={() => onEdit(0)}>
          <span className="font-medium">
            {c.plans[plan.id].name}
            {plan.printed && qty > 1 ? ` × ${qty}` : ""}
          </span>
          {applied.length ? <span className="block text-muted">{applied.map((id) => c.addons[id].name).join(", ")}</span> : null}
        </ReviewRow>
        {plan.printed ? (
          <ReviewRow label={t.wizard.reviewDelivery} onEdit={() => onEdit(1)}>
            <span className="font-medium">{c.delivery[delivery].name}</span>
            {place ? <span className="block text-muted">{place}</span> : null}
          </ReviewRow>
        ) : null}
        <ReviewRow label={t.wizard.reviewContacts} onEdit={() => onEdit(1)}>
          <span className="font-medium">{v.contactName.trim()}</span>
          <span className="block text-muted">{[v.contactPhone.trim(), v.contactEmail.trim()].filter(Boolean).join(" · ")}</span>
        </ReviewRow>
        {plan.printed && gift.length ? (
          <ReviewRow label={t.wizard.reviewGift} onEdit={() => onEdit(1)}>
            {gift.map((g) => (
              <span key={g} className="block text-muted first:text-ink">
                {g}
              </span>
            ))}
          </ReviewRow>
        ) : null}
      </dl>
    </Group>
  );
}

/** Промокод или сертификат: ввод, проверка на сервере, применённый и ошибка. */
export function PromoBox({ promo, items }: { promo: PromoField; items: number }) {
  const t = useMessages().checkout;
  const applied = promo.value;
  return (
    <Group title={t.wizard.promoTitle}>
      {applied?.ok ? (
        <>
          <div className="flex items-center justify-between rounded-[10px] bg-success-bg py-1 pr-1 pl-3 text-sm text-success">
            <span className="flex items-center gap-1.5">
              <Tag className="size-4" /> {t.promoApplied(applied.code ?? "")}
            </span>
            <button type="button" onClick={() => promo.remove()} aria-label={t.promoRemove} className="flex size-10 items-center justify-center rounded-lg hover:bg-white/60">
              <X className="size-4" />
            </button>
          </div>
          {applied.kind === "fixed" && applied.value && applied.value > items ? <p className="mt-2 text-xs leading-snug text-warning">{t.promoOver(formatPrice(applied.value - items))}</p> : null}
        </>
      ) : (
        <div className="flex gap-2">
          <input
            className="input text-sm uppercase placeholder:normal-case"
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
          <button type="button" className="btn btn-outline shrink-0" onClick={promo.apply} disabled={!promo.input.trim() || promo.checking}>
            {promo.checking ? <LoaderCircle className="size-4 animate-spin" /> : t.apply}
          </button>
        </div>
      )}
      {promo.error ? (
        <p id="promo-error" role="alert" className="field-error">
          {promo.error}
        </p>
      ) : null}
    </Group>
  );
}

/** Согласие с офертой: без него заказ не оформить. */
export function ConsentField({ checked, onChange, error }: { checked: boolean; onChange: (on: boolean) => void; error?: string }) {
  const t = useMessages().checkout;
  return (
    <div>
      <label className="flex min-h-11 cursor-pointer items-start gap-2.5 py-1 text-sm leading-relaxed text-ink-soft">
        <input type="checkbox" id="consent" name="consent" required className="mt-1 size-4 shrink-0 accent-wine" checked={checked} aria-invalid={error ? true : undefined} aria-describedby={error ? "consent-error" : undefined} onChange={(e) => onChange(e.target.checked)} />
        <span>
          {t.consent.start}{" "}
          <Link href="/offer" target="_blank" className="text-wine underline">
            {t.consent.offer}
          </Link>
          {t.consent.end}
        </span>
      </label>
      {error ? (
        <p id="consent-error" role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Строки итога: тариф, скидки, допы, доставка и «К оплате» — общие для боковой панели и свёрнутого итога на телефоне. */
function SummaryBody({ plan, qty, price, promo, upgrade, offered }: { plan: Plan; qty: number; price: SummaryPrice; promo: PromoField; upgrade: { number: number } | null; offered: Addon[] }) {
  const m = useMessages();
  const t = m.checkout;
  const c = m.common;
  const { items, discountAmount, agreedDiscount, prepaidApplied, addons, deliveryPrice, total, gifted = [], deliveryQuoted = false } = price;
  const applied = promo.value;
  return (
    <>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">
            {c.plans[plan.id].name}
            {plan.printed && qty > 1 ? ` × ${qty}` : ""}
          </dt>
          <dd className="tabular-nums">{formatPrice(items)}</dd>
        </div>
        {discountAmount ? (
          <div className="flex justify-between gap-3 text-success">
            <dt>
              {applied?.code?.startsWith("GIFT-") ? t.certificate : t.promoCode} {applied?.code} ({applied?.label})
            </dt>
            <dd className="tabular-nums">−{formatPrice(discountAmount)}</dd>
          </div>
        ) : null}
        {agreedDiscount > 0 ? (
          <div className="flex justify-between gap-3 text-success">
            <dt>{t.agreement.agreedLine}</dt>
            <dd className="tabular-nums">−{formatPrice(agreedDiscount)}</dd>
          </div>
        ) : null}
        {prepaidApplied > 0 ? (
          <div className="flex justify-between gap-3 text-success" data-testid="prepaid-line">
            <dt>{upgrade ? t.upgrade.creditLine(upgrade.number) : t.agreement.prepaidLine}</dt>
            <dd className="tabular-nums">−{formatPrice(prepaidApplied)}</dd>
          </div>
        ) : null}
        {addons.map((id) => {
          const a = offered.find((x) => x.id === id)!;
          return (
            <div key={id} className="flex justify-between gap-3">
              <dt className="text-muted">{c.addons[a.id].name}</dt>
              <dd className="tabular-nums">{gifted.includes(a.id as AgreementGift) ? <span className="text-success">{t.agreement.giftFree}</span> : formatPrice(a.price)}</dd>
            </div>
          );
        })}
        {plan.printed ? (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">{t.delivery}</dt>
            <dd className="text-right tabular-nums">{deliveryQuoted ? <span className="text-muted">{t.quoted.price}</span> : gifted.includes("delivery") ? <span className="text-success">{t.agreement.giftFree}</span> : deliveryPrice ? formatPrice(deliveryPrice) : c.free}</dd>
          </div>
        ) : null}
      </dl>
      <div className="mt-4 flex items-baseline justify-between border-t border-line pt-4">
        <span className="font-medium">{t.toPay}</span>
        <span className="font-serif text-3xl font-medium tabular-nums">{formatPrice(total)}</span>
      </div>
      {deliveryQuoted ? (
        <p className="mt-1 text-right text-xs text-muted" data-testid="abroad-total">
          {t.quoted.total}
        </p>
      ) : null}
    </>
  );
}

/** Итог на компьютере: справа, закреплён, виден на всех шагах. */
export function Summary(props: { plan: Plan; qty: number; price: SummaryPrice; promo: PromoField; upgrade: { number: number } | null; offered: Addon[] }) {
  const t = useMessages().checkout;
  return (
    <aside className="hidden lg:block">
      <div className="panel sticky top-[8.5rem] p-5">
        <h2 className="mb-4 text-[15px] font-semibold">{t.wizard.orderTitle}</h2>
        <SummaryBody {...props} />
        <TrustList compact className="mt-6 border-t border-line pt-5 text-ink-soft" />
      </div>
    </aside>
  );
}

/** Итог на телефоне: свёрнутая полоса сверху (сумма всегда на виду), по нажатию раскрывает состав. */
export function MobileSummary(props: { plan: Plan; qty: number; price: SummaryPrice; promo: PromoField; upgrade: { number: number } | null; offered: Addon[] }) {
  const t = useMessages().checkout;
  return (
    <details className="group/sum sticky top-[57px] z-30 -mx-4 border-y border-line bg-paper/95 backdrop-blur-md sm:-mx-6 lg:hidden">
      <summary className="mx-auto flex min-h-12 max-w-6xl cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {t.wizard.orderToggle} <ChevronDown className="size-4 text-muted transition group-open/sum:rotate-180" aria-hidden />
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-muted">{t.toPay}</span>
          <span className="font-serif text-2xl leading-none font-medium tabular-nums">{formatPrice(props.price.total)}</span>
        </span>
      </summary>
      <div className="mx-auto max-h-[60dvh] max-w-6xl overflow-y-auto border-t border-line px-4 py-4 sm:px-6">
        <SummaryBody {...props} />
      </div>
    </details>
  );
}

/** Кнопки шага на компьютере: внизу листа; на телефоне те же кнопки — в нижней панели (MobileBar). */
export function StepActions({ step, last, onBack, onNext, blocked, error, mobile }: { step: number; last: boolean; onBack: () => void; onNext: () => void; blocked: boolean; error?: string; mobile?: boolean }) {
  const t = useMessages().checkout;
  const submit = (
    <SubmitButton className={cn(mobile ? "h-11 flex-1" : "btn-lg")} pendingText={t.pending}>
      {mobile ? t.submitShort : t.submit}
    </SubmitButton>
  );
  const body = (
    <div className={cn("flex items-center gap-3", mobile ? "" : "justify-between")}>
      {step > 0 ? (
        <button type="button" className={cn("btn", mobile ? "btn-outline btn-icon" : "btn-ghost")} onClick={onBack} aria-label={t.wizard.back}>
          <ChevronLeft className="size-4" aria-hidden />
          <span className={mobile ? "sr-only" : undefined}>{t.wizard.back}</span>
        </button>
      ) : (
        <span />
      )}
      {last ? (
        submit
      ) : (
        <button type="button" className={cn("btn btn-primary", mobile ? "h-11 flex-1" : "btn-lg")} onClick={onNext}>
          {t.wizard.next}
        </button>
      )}
    </div>
  );
  if (!mobile) {
    return (
      <div className="mt-8 border-t border-line pt-5">
        {error ? <Alert className="mb-4">{error}</Alert> : null}
        {body}
        {last && blocked ? <p className="mt-3 text-sm text-danger">{t.blocked}</p> : null}
      </div>
    );
  }
  return (
    <div data-bottom-bar className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 backdrop-blur-md lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      {error ? (
        <p role="alert" className="mb-2 line-clamp-2 text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      {body}
    </div>
  );
}
