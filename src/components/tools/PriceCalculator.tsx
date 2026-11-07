"use client";

import { useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { Link, useLocale } from "@/i18n/client";
import { toolUi } from "@/lib/content/tools/ui";
import { MAX_COPIES, calcPrice, type PriceAddon, type PricePlan } from "@/lib/tools/price";
import { cn } from "@/lib/class-names";
import { ToolField, Workbench } from "./Workbench";

const money = (v: number, sign: string) => `${new Intl.NumberFormat("ru-RU").format(v)} ${sign}`;

/** Калькулятор цены: тарифы и допы приходят с сервера вместе с ценами из админки. Итог — квитанцией справа. */
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
    <Workbench
      cta={false}
      input={
        <>
          <fieldset>
            <legend className="label">{ui.formatLabel}</legend>
            <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line-strong">
              {plans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={p.id === plan.id}
                  onClick={() => setPlanId(p.id)}
                  className={cn("flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors", p.id === plan.id ? "bg-rose/60" : "bg-white hover:bg-sunken/60")}
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", p.id === plan.id ? "border-wine bg-wine text-white" : "border-line-strong")}>
                    {p.id === plan.id ? <Check className="size-3" aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{planName(p.id)}</span>
                    <span className="block text-sm leading-snug text-muted">{ui.planNote[p.id as keyof typeof ui.planNote]}</span>
                  </span>
                  <span className="shrink-0 font-serif text-xl whitespace-nowrap tabular-nums">{money(p.price, sign)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {plan.printed ? (
            <>
              <ToolField label={ui.copiesLabel}>
                <div className="inline-flex items-center gap-1 rounded-[10px] border border-line-strong bg-white p-1">
                  <button type="button" className="btn btn-ghost btn-sm size-10 p-0" aria-label="−" disabled={res.copies <= 1} onClick={() => setCopies(Math.max(1, res.copies - 1))}>
                    <Minus className="size-4" />
                  </button>
                  <span className="w-10 text-center font-medium tabular-nums" aria-live="polite">
                    {res.copies}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm size-10 p-0" aria-label="+" disabled={res.copies >= MAX_COPIES} onClick={() => setCopies(Math.min(MAX_COPIES, res.copies + 1))}>
                    <Plus className="size-4" />
                  </button>
                </div>
              </ToolField>

              {available.length ? (
                <fieldset>
                  <legend className="label">{ui.extrasLabel}</legend>
                  <div className="divide-y divide-line overflow-hidden rounded-[10px] border border-line-strong">
                    {available.map((a) => (
                      <label key={a.id} className="flex min-h-14 cursor-pointer items-start gap-3 bg-white px-4 py-3 has-[:checked]:bg-rose/60">
                        <input type="checkbox" className="mt-1 size-4 accent-[var(--color-wine)]" checked={chosen.includes(a.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, a.id] : chosen.filter((x) => x !== a.id))} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{ui.addon[a.id as keyof typeof ui.addon] ?? a.id}</span>
                          <span className="block text-sm leading-snug text-muted">{ui.addonNote[a.id as keyof typeof ui.addonNote]}</span>
                        </span>
                        <span className="shrink-0 text-ink-soft tabular-nums">+{money(a.price, sign)}</span>
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
        </>
      }
      result={
        <div>
          {/* Квитанция: строки со сплошной линией, итог крупно под пунктиром. */}
          <dl className="space-y-2.5 text-[15px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">
                {ui.breakdown.book} · {planName(plan.id)}
              </dt>
              <dd className="tabular-nums">{money(res.book, sign)}</dd>
            </div>
            {res.copies > 1 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">{ui.breakdown.extraCopies(res.copies - 1)}</dt>
                <dd className="tabular-nums">{money(res.extraCopies, sign)}</dd>
              </div>
            ) : null}
            {res.addons > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-soft">{ui.breakdown.addons}</dt>
                <dd className="tabular-nums">{money(res.addons, sign)}</dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-5 border-t border-dashed border-line-strong pt-5">
            <div className="text-sm text-muted">{ui.total}</div>
            <div className="mt-1 font-serif text-[56px] leading-none font-medium text-wine tabular-nums sm:text-[68px]" data-testid="price-total">
              {money(res.total, sign)}
            </div>
          </div>
          <Link href={ctaHref} className="btn btn-primary btn-lg mt-7 w-full">
            {ui.cta}
          </Link>
        </div>
      }
    />
  );
}
