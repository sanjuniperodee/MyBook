import { Check } from "lucide-react";
import { Link } from "@/i18n/client";
import { formatPrice, getVisiblePlans } from "@/config/site";
import { getMessages } from "@/i18n/server";
import { cn } from "@/lib/class-names";

/**
 * Тарифы одним листом: колонки разделены линией, популярный — с винной чертой сверху и главной кнопкой.
 * Популярный идёт первым — его чаще всего и покупают.
 */
export async function PriceSheet({ cta, ctaLabel, className }: { cta: string; ctaLabel: string; className?: string }) {
  const m = await getMessages();
  const t = m.landing.pricing;
  const plans = [...getVisiblePlans()].sort((a, b) => Number(!!b.featured) - Number(!!a.featured)).map((p) => ({ ...p, ...m.common.plans[p.id] }));
  return (
    <div
      className={cn(
        "grid divide-y divide-line overflow-hidden rounded-[14px] border border-line bg-white md:divide-x md:divide-y-0",
        plans.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3",
        className,
      )}
    >
      {plans.map((p) => (
        <div
          key={p.id}
          className="relative flex flex-col p-7 sm:p-9"
        >
          {p.featured ? <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-wine" /> : null}
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-lg font-semibold">{p.name}</h3>
            {"badge" in p && p.badge ? <span className="text-sm text-wine">{p.badge}</span> : null}
          </div>
          <div className="mt-4 font-serif text-5xl font-medium tabular-nums">{formatPrice(p.price)}</div>
          <div className="mt-1.5 text-sm text-muted">{p.extraCopyPrice ? t.extraCopy(formatPrice(p.extraCopyPrice)) : t.instant}</div>
          <ul className="mt-7 flex-1 space-y-3">
            {p.features.map((f) => (
              <li key={f} className="flex gap-2.5 text-[15px] text-ink-soft">
                <Check className="mt-0.5 size-4 shrink-0 text-wine" aria-hidden /> {f}
              </li>
            ))}
          </ul>
          <Link href={cta} className={cn("btn mt-8", p.featured ? "btn-primary btn-lg" : "btn-outline btn-lg")}>
            {ctaLabel}
          </Link>
        </div>
      ))}
    </div>
  );
}
