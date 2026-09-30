import { Heart } from "lucide-react";
import { formatPrice, getPlan, site, type PlanId } from "@/config/site";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { cn } from "@/lib/utils";

/** HTML-копия PDF-сертификата: живое превью при покупке и на странице сертификата. Язык — язык сертификата. */
export function GiftCardVisual({
  plan,
  recipientName,
  buyerName,
  message,
  code,
  className,
  locale,
}: {
  locale: Locale;
  plan: string;
  recipientName: string;
  buyerName: string;
  message: string;
  code?: string | null;
  className?: string;
}) {
  const p = getPlan(plan);
  const m = messagesFor(locale);
  const t = m.gift.card;
  return (
    <div className={cn("@container aspect-[210/148] w-full bg-[#fbf7f1] p-[4.3%] shadow-[0_30px_60px_-30px_rgba(60,20,20,.45),0_2px_6px_rgba(0,0,0,.06)]", className)}>
      <div className="h-full border border-wine p-[1.5%]" lang={locale}>
        <div className="flex h-full border border-[#d9c9bc] px-[6%] py-[4.5%]">
          <div className="flex min-w-0 flex-1 flex-col pr-[4%]">
            <div className="text-[2.3cqw] font-medium tracking-[0.25em] text-wine uppercase">{t.brandLine(site.name)}</div>
            <div className="mt-[2.5cqw] font-serif text-[6.6cqw] leading-[1.02] font-medium text-ink">{t.title}</div>
            <div className="mt-[2.2cqw] text-[1.6cqw] font-medium tracking-[0.2em] text-muted uppercase">{t.recipient}</div>
            <div className="truncate font-serif text-[3.8cqw] leading-tight text-ink italic">{recipientName || "…"}</div>
            {message ? <p className="mt-[2.6cqw] line-clamp-4 font-serif text-[2.6cqw] leading-snug text-ink-soft italic">«{message}»</p> : null}
            <div className="mt-[1.8cqw] truncate font-hand text-[3.8cqw] text-wine">— {buyerName || "…"}</div>
          </div>
          <div className="flex w-[30%] shrink-0 flex-col items-center justify-center border-l border-[#d9c9bc] pl-[4%] text-center">
            <Heart className="size-[7cqw] fill-wine text-wine" />
            <div className="mt-[2cqw] text-[2.3cqw] text-muted">{t.book}</div>
            <div className="font-serif text-[3.8cqw] leading-tight font-semibold">«{p ? m.common.plans[p.id as PlanId].name : plan}»</div>
            <div className="text-[2.2cqw] text-muted">{p ? t.amount(formatPrice(p.price)) : ""}</div>
            <div className="mt-[2.8cqw] w-full rounded-[0.8cqw] border border-dashed border-wine bg-white px-[1cqw] py-[1.4cqw]">
              <div className="text-[1.7cqw] tracking-widest text-muted">{t.code}</div>
              <div className="text-[3cqw] font-semibold tracking-wider whitespace-nowrap text-ink">{code ?? "GIFT-••••-••••"}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
