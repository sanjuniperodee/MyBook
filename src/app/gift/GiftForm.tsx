"use client";

import { Link, useMessages } from "@/i18n/client";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { useActionState, useState } from "react";
import { Mail, Printer } from "lucide-react";
import { createGiftAction, type GiftFormState } from "./actions";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatPrice, getPlans, getVisiblePlans, type PlanId } from "@/config/site";
import type { ReactNode } from "react";
import { cn } from "@/lib/class-names";
import { nowMs } from "@/lib/dates";
import { toIsoDay } from "@/lib/occasions";

export function GiftForm({ defaults, intro }: { defaults: { name: string; email: string; locale: Locale }; intro: ReactNode }) {
  const [state, action] = useActionState<GiftFormState, FormData>(createGiftAction, {});
  const m = useMessages();
  const t = m.gift.form;
  // Язык сертификата может отличаться от языка сайта: покупают по-русски для бабушки, которая читает по-казахски.
  const [giftLocale, setGiftLocale] = useState<Locale>(defaults.locale);
  const [plan, setPlan] = useState<PlanId>("hardcover");
  const [buyerName, setBuyerName] = useState(defaults.name);
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [delivery, setDelivery] = useState<"me" | "email">("me");
  const [today] = useState(() => toIsoDay(new Date(nowMs())));
  const price = formatPrice(getPlans().find((p) => p.id === plan)!.price);

  // Пример в пустых полях открытки — из подсказок формы (без «Например,»).
  const samples = { recipient: t.recipientPlaceholder.replace(/^[^,]+,\s*/, ""), buyer: t.buyerPlaceholder, message: t.messagePlaceholder };
  const preview = (
    <>
      <GiftCardVisual locale={giftLocale} plan={plan} recipientName={recipientName} buyerName={buyerName} message={message} samples={samples} />
      <p className="mt-4 text-sm leading-relaxed text-muted">{t.previewNote}</p>
    </>
  );
  return (
    <form action={action} className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="delivery" value={delivery} />
      <input type="hidden" name="locale" value={giftLocale} />

      {/* Слева: титр и открытка. Открытка липкая — меняется на глазах, пока заполняется форма справа. */}
      <div>
        {intro}
        {/* На телефоне открытка — после формы: первым экраном идут титр и выбор книги. */}
        <div className="mt-8 max-lg:hidden lg:sticky lg:top-24 lg:mt-10">{preview}</div>
      </div>

      {/* Справа: один лист с четырьмя шагами; итог и кнопка — в липкой полосе внизу листа. */}
      <div className="self-start rounded-[14px] border border-line bg-white">
        <fieldset className="min-w-0 border-b border-line p-5 sm:p-7">
          <legend className="sr-only">{t.step1}</legend>
          <StepTitle n={1}>{t.step1}</StepTitle>
          <div className="mt-4 divide-y divide-line overflow-hidden rounded-[10px] border border-line-strong" role="radiogroup" aria-label={t.step1}>
            {getVisiblePlans().map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={plan === p.id}
                onClick={() => setPlan(p.id)}
                className={cn("flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors", plan === p.id ? "bg-rose/60" : "bg-white hover:bg-sunken/60")}
              >
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", plan === p.id ? "border-wine" : "border-line-strong")}>
                  {plan === p.id ? <span className="size-2.5 rounded-full bg-wine" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.common.plans[p.id].name}</span>
                  <span className="block text-sm leading-snug text-muted">{t.hints[p.id]}</span>
                </span>
                <span className="shrink-0 font-serif text-2xl tabular-nums">{formatPrice(p.price)}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">{t.planNote}</p>
        </fieldset>

        <fieldset className="min-w-0 space-y-4 border-b border-line p-5 sm:p-7">
          <legend className="sr-only">{t.step2}</legend>
          <StepTitle n={2}>{t.step2}</StepTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="recipientName">{t.recipientName}</label>
              <input className="input" id="recipientName" name="recipientName" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} maxLength={60} required placeholder={t.recipientPlaceholder} />
            </div>
            <div>
              <label className="label" htmlFor="buyerName">{t.buyerName}</label>
              <input className="input" id="buyerName" name="buyerName" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} maxLength={60} required placeholder={t.buyerPlaceholder} />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="message">{t.message}</label>
            <textarea className="input" id="message" name="message" rows={3} maxLength={400} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={t.messagePlaceholder} />
          </div>
          <div>
            <span className="label">{t.language}</span>
            <div className="grid max-w-sm grid-cols-2 gap-1 rounded-[12px] bg-sunken p-1" role="radiogroup" aria-label={t.language}>
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={giftLocale === l}
                  lang={l}
                  onClick={() => setGiftLocale(l)}
                  className={cn("h-11 rounded-[9px] text-sm font-medium transition sm:h-10", giftLocale === l ? "bg-white text-ink shadow-soft" : "text-muted hover:text-ink")}
                >
                  {localeMeta[l].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">{t.languageHint}</p>
          </div>
        </fieldset>

        <fieldset className="min-w-0 space-y-4 border-b border-line p-5 sm:p-7">
          <legend className="sr-only">{t.step3}</legend>
          <StepTitle n={3}>{t.step3}</StepTitle>
          <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line-strong" role="radiogroup" aria-label={t.step3}>
            {(
              [
                { id: "me", icon: Printer, ...t.me },
                { id: "email", icon: Mail, ...t.email },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={delivery === o.id}
                onClick={() => setDelivery(o.id)}
                className={cn("flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors", delivery === o.id ? "bg-rose/60" : "bg-white hover:bg-sunken/60")}
              >
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", delivery === o.id ? "border-wine" : "border-line-strong")}>
                  {delivery === o.id ? <span className="size-2.5 rounded-full bg-wine" /> : null}
                </span>
                <o.icon className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{o.title}</span>
                  <span className="block text-sm leading-snug text-muted">{o.text}</span>
                </span>
              </button>
            ))}
          </div>
          {delivery === "email" ? (
            <div className="grid gap-4 sm:grid-cols-[1fr_190px]">
              <div>
                <label className="label" htmlFor="recipientEmail">{t.recipientEmail}</label>
                <input className="input" id="recipientEmail" name="recipientEmail" type="email" required maxLength={120} />
              </div>
              <div>
                <label className="label" htmlFor="sendAt">{t.sendAt}</label>
                <input className="input" id="sendAt" name="sendAt" type="date" min={today} />
                <p className="mt-1 text-xs text-muted">{t.sendAtHint}</p>
              </div>
            </div>
          ) : null}
        </fieldset>

        <fieldset className="min-w-0 space-y-4 p-5 sm:p-7">
          <legend className="sr-only">{t.step4}</legend>
          <StepTitle n={4}>{t.step4}</StepTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="buyerEmail">{t.buyerEmail}</label>
              <input className="input" id="buyerEmail" name="buyerEmail" type="email" defaultValue={defaults.email} required maxLength={120} autoComplete="email" />
            </div>
            <div>
              <label className="label" htmlFor="buyerPhone">{t.phone} <span className="font-normal text-muted">{t.optional}</span></label>
              <input className="input" id="buyerPhone" name="buyerPhone" type="tel" maxLength={30} autoComplete="tel" placeholder="+7 7__ ___ __ __" />
            </div>
          </div>
          <label className="flex min-h-11 items-start gap-3 py-1 text-sm text-ink-soft">
            <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-wine" required />
            <span>
              {t.consentStart}{" "}
              <Link href="/offer" className="underline underline-offset-2" target="_blank">
                {t.consentOffer}
              </Link>
            </span>
          </label>
          {state.error ? <Alert>{state.error}</Alert> : null}
        </fieldset>

        <div className="flex flex-col gap-3 rounded-b-[14px] border-t border-line bg-white/95 px-5 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:sticky lg:bottom-0">
          <div className="hidden sm:block">
            <div className="text-xs text-muted">{t.total}</div>
            <div className="font-serif text-3xl leading-none font-medium tabular-nums">{price}</div>
          </div>
          <SubmitButton className="btn-lg w-full sm:w-auto" pendingText={t.pending}>
            {t.submit(price)}
          </SubmitButton>
        </div>
      </div>
      <div className="lg:hidden">{preview}</div>
    </form>
  );
}

/** Шаг формы: номер винными засечками — шаги идут по порядку. */
function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-baseline gap-3 text-lg font-semibold">
      <span className="font-serif text-3xl leading-none font-medium text-wine tabular-nums">{n}</span>
      {children}
    </h2>
  );
}
