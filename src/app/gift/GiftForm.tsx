"use client";

import { Link, useMessages } from "@/i18n/client";
import { localeMeta, locales, type Locale } from "@/i18n/config";
import { useActionState, useState } from "react";
import { Check, Mail, Printer } from "lucide-react";
import { createGiftAction, type GiftFormState } from "./actions";
import { GiftCardVisual } from "@/components/GiftCardVisual";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Alert } from "@/components/ui/Alert";
import { formatPrice, plans, type PlanId } from "@/config/site";
import { cn, nowMs } from "@/lib/utils";
import { toIsoDay } from "@/lib/occasions";

export function GiftForm({ defaults }: { defaults: { name: string; email: string; locale: Locale } }) {
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

  return (
    <form action={action} className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
      <input type="hidden" name="plan" value={plan} />
      <input type="hidden" name="delivery" value={delivery} />
      <input type="hidden" name="locale" value={giftLocale} />
      <div className="order-2 space-y-8 lg:order-1">
        <section>
          <h2 className="text-lg font-semibold">1. {t.step1}</h2>
          <div className="mt-3 grid gap-2.5">
            {plans.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlan(p.id)}
                aria-pressed={plan === p.id}
                className={cn("flex items-center gap-4 rounded-2xl border bg-white px-4 py-3.5 text-left transition", plan === p.id ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", plan === p.id ? "border-wine bg-wine text-white" : "border-line")}>
                  {plan === p.id ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{m.common.plans[p.id].name}</span>
                  <span className="block text-xs text-muted">{t.hints[p.id]}</span>
                </span>
                <span className="font-serif text-xl">{formatPrice(p.price)}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{t.planNote}</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">2. {t.step2}</h2>
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
            <div className="grid max-w-sm grid-cols-2 gap-2 rounded-2xl bg-cream/70 p-1" role="radiogroup" aria-label={t.language}>
              {locales.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={giftLocale === l}
                  lang={l}
                  onClick={() => setGiftLocale(l)}
                  className={cn("h-10 rounded-xl text-sm font-medium transition", giftLocale === l ? "bg-white shadow-soft" : "text-muted hover:text-ink")}
                >
                  {localeMeta[l].label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">{t.languageHint}</p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">3. {t.step3}</h2>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {(
              [
                { id: "me", icon: Printer, ...t.me },
                { id: "email", icon: Mail, ...t.email },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setDelivery(o.id)}
                aria-pressed={delivery === o.id}
                className={cn("flex gap-3 rounded-2xl border bg-white p-4 text-left transition", delivery === o.id ? "border-wine ring-4 ring-wine/10" : "border-line hover:border-ink/30")}
              >
                <o.icon className="mt-0.5 size-5 shrink-0 text-wine" />
                <span>
                  <span className="block font-medium">{o.title}</span>
                  <span className="block text-xs leading-snug text-muted">{o.text}</span>
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
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">4. {t.step4}</h2>
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
          <label className="flex items-start gap-2.5 text-sm text-ink-soft">
            <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-wine" required />
            <span>
              {t.consentStart}{" "}
              <Link href="/offer" className="underline underline-offset-2" target="_blank">
                {t.consentOffer}
              </Link>
            </span>
          </label>
          {state.error ? <Alert>{state.error}</Alert> : null}
          <SubmitButton className="btn-lg w-full sm:w-auto" pendingText={t.pending}>
            {t.submit(formatPrice(plans.find((p) => p.id === plan)!.price))}
          </SubmitButton>
        </section>
      </div>

      <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-28">
          <GiftCardVisual locale={giftLocale} plan={plan} recipientName={recipientName} buyerName={buyerName} message={message} className="rotate-[-1.5deg]" />
          <p className="mt-5 text-center text-sm text-muted">{t.previewNote}</p>
        </div>
      </div>
    </form>
  );
}
