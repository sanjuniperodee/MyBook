import { Check } from "lucide-react";
import { Link } from "@/i18n/client";
import { formatPrice, getVisiblePlans } from "@/config/site";
import { getMessages } from "@/i18n/server";
import { cn } from "@/lib/class-names";

/**
 * Ведомость тарифов: по строке на тариф — название и «кому подойдёт», что входит, цена и кнопка. Популярный идёт первым,
 * отмечен винной чертой и единственный с главной кнопкой (одна на экран); остальные — контуром. На телефоне строка
 * превращается в столбик: название и цена в одной линии, состав ниже, кнопка на всю ширину.
 */
export async function PriceSheet({ cta, ctaLabel, className }: { cta: string; ctaLabel: string; className?: string }) {
  const m = await getMessages();
  const t = m.landing.pricing;
  const plans = [...getVisiblePlans()].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).map((p) => ({ ...p, ...m.common.plans[p.id] }));
  const cols = "md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_minmax(0,15rem)] lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_minmax(0,17rem)]";
  return (
    <div className={cn("overflow-hidden rounded-(--r-panel) border border-line bg-white", className)}>
      <div className={cn("hidden gap-x-8 border-b border-line bg-sunken/70 px-8 py-2.5 text-xs font-medium text-muted md:grid", cols)} aria-hidden>
        <span>{t.head.plan}</span>
        <span>{t.head.includes}</span>
        <span className="text-right">{t.head.price}</span>
      </div>
      <ul className="divide-y divide-line">
        {plans.map((p) => (
          <li key={p.id} className={cn("relative grid gap-x-8 gap-y-5 px-5 py-7 sm:px-8", cols, p.featured && "bg-rose/40")}>
            {p.featured ? <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-wine" /> : null}
            <div className="flex items-baseline justify-between gap-4 md:block">
              <div>
                <h3 className="font-serif text-[28px] leading-none font-medium">{p.name}</h3>
                {"badge" in p && p.badge ? <div className="mt-2 text-sm font-medium text-wine">{p.badge}</div> : null}
                <p className="mt-2 hidden max-w-[16rem] text-sm leading-snug text-muted md:block">{t.pick[p.id]}</p>
              </div>
              <div className="font-serif text-4xl leading-none font-medium tabular-nums md:hidden">{formatPrice(p.price)}</div>
            </div>
            <div>
              <p className="text-sm leading-snug text-muted md:hidden">{t.pick[p.id]}</p>
              <ul className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2 md:mt-0">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-[15px] leading-snug text-ink-soft">
                    <Check className="mt-0.5 size-4 shrink-0 text-wine" strokeWidth={1.8} aria-hidden /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3 md:items-end md:text-right">
              <div>
                <div className="hidden font-serif text-5xl leading-none font-medium tabular-nums md:block">{formatPrice(p.price)}</div>
                <div className="text-sm text-muted md:mt-2">{p.extraCopyPrice ? t.extraCopy(formatPrice(p.extraCopyPrice)) : t.instant}</div>
              </div>
              <Link href={cta} data-main-cta={p.featured ? "" : undefined} className={cn("btn w-full md:w-auto", p.featured ? "btn-primary btn-lg" : "btn-outline btn-lg")}>
                {ctaLabel}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
