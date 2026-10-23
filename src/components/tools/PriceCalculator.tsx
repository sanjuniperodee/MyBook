"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Link, useLocale } from "@/i18n/client";
import { toolUi } from "@/lib/content/tools/ui";
import { MAX_COPIES, calcPrice, type PriceAddon, type PricePlan } from "@/lib/tools/price";
import { cn } from "@/lib/class-names";

const money = (v: number, sign: string) => `${new Intl.NumberFormat("ru-RU").format(v)} ${sign}`;

/** Калькулятор цены: тарифы и допы приходят с сервера вместе с ценами из админки. */
export function PriceCalculator({ plans, addons, sign, ctaHref }: { plans: PricePlan[]; addons: PriceAddon[]; sign: string; ctaHref: string }) {
  const ui = toolUi[useLocale()].price;
  const [planId, setPlanId] = useState(plans.find((p) => p.printed)?.id ?? plans[0].id);
  const [copies, setCopies] = useState(1);
  const [chosen, setChosen] = useState<string[]>([]);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const res = calcPrice(plan, copies, addons, chosen);
  const available = addons.filter((a) => !a.hiddenFor.includes(plan.id));
  const planName = (id: string) => ui.plan[id as keyof typeof ui.plan] ?? id;

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-7">
          <fieldset>
            <legend className="label">{ui.formatLabel}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === plan.id}
                  onClick={() => setPlanId(p.id)}
                  className={cn("rounded-2xl border p-4 text-left transition", p.id === plan.id ? "border-wine bg-rose/30 ring-4 ring-wine/10" : "border-line bg-white hover:border-ink/30")}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{planName(p.id)}</span>
                    <span className="shrink-0 font-serif text-xl whitespace-nowrap">{money(p.price, sign)}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted">{ui.planNote[p.id as keyof typeof ui.planNote]}</div>
                </button>
              ))}
            </div>
          </fieldset>

          {plan.printed ? (
            <>
              <div>
                <span className="label">{ui.copiesLabel}</span>
                <div className="inline-flex items-center gap-1 rounded-full border border-line bg-white p-1">
                  <button type="button" className="btn btn-ghost btn-sm size-9 p-0" aria-label="−" disabled={res.copies <= 1} onClick={() => setCopies(Math.max(1, res.copies - 1))}>
                    <Minus className="size-4" />
                  </button>
                  <span className="w-10 text-center font-medium tabular-nums" aria-live="polite">
                    {res.copies}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm size-9 p-0" aria-label="+" disabled={res.copies >= MAX_COPIES} onClick={() => setCopies(Math.min(MAX_COPIES, res.copies + 1))}>
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>

              {available.length ? (
                <fieldset>
                  <legend className="label">{ui.extrasLabel}</legend>
                  <div className="space-y-2">
                    {available.map((a) => (
                      <label key={a.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white p-4 has-[:checked]:border-wine has-[:checked]:bg-rose/30">
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--color-wine)]" checked={chosen.includes(a.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, a.id] : chosen.filter((x) => x !== a.id))} />
                        <span className="flex-1">
                          <span className="block font-medium">{ui.addon[a.id as keyof typeof ui.addon] ?? a.id}</span>
                          <span className="block text-sm text-muted">{ui.addonNote[a.id as keyof typeof ui.addonNote]}</span>
                        </span>
                        <span className="shrink-0 text-ink-soft">+{money(a.price, sign)}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              <p className="text-sm leading-relaxed text-muted">
                <span className="font-medium text-ink-soft">{ui.deliveryLabel}.</span> {ui.deliveryNote}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">{ui.printedOnly}</p>
          )}
        </div>

        <aside className="self-start rounded-3xl bg-cream/70 p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{ui.breakdown.book}</dt>
              <dd className="tabular-nums">{money(res.book, sign)}</dd>
            </div>
            {res.copies > 1 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{ui.breakdown.extraCopies(res.copies - 1)}</dt>
                <dd className="tabular-nums">{money(res.extraCopies, sign)}</dd>
              </div>
            ) : null}
            {res.addons > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">{ui.breakdown.addons}</dt>
                <dd className="tabular-nums">{money(res.addons, sign)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4 border-t border-line pt-4">
            <div className="text-sm text-muted">{ui.total}</div>
            <div className="font-serif text-5xl font-medium text-wine tabular-nums" data-testid="price-total">
              {money(res.total, sign)}
            </div>
          </div>
          <Link href={ctaHref} className="btn btn-primary btn-lg mt-6 w-full">
            {ui.cta}
          </Link>
        </aside>
      </div>
    </div>
  );
}
