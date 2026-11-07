import { Plus } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Вопросы и ответы — спокойный аккордеон: линии вместо карточек, вопрос засечками, справа тонкий «плюс», который при
 * раскрытии поворачивается. Нативный <details>: работает без JavaScript и читается поисковиком. Общий для главной,
 * сертификата, посадочных страниц и инструментов.
 */
export function Faq({ items, className, size = "lg" }: { items: [string, string][]; className?: string; size?: "lg" | "md" }) {
  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map(([q, a]) => (
        <details key={q} className="faq group">
          <summary
            className={cn(
              "flex min-h-14 cursor-pointer list-none items-start justify-between gap-6 py-5 font-serif leading-snug font-medium text-balance transition-colors hover:text-wine group-open:text-wine [&::-webkit-details-marker]:hidden",
              size === "lg" ? "text-[22px] sm:text-[26px]" : "text-xl sm:text-[22px]",
            )}
          >
            {q}
            <Plus className="mt-1 size-5 shrink-0 text-muted transition-transform duration-300 group-open:rotate-45 group-open:text-wine" strokeWidth={1.6} aria-hidden />
          </summary>
          <p className="max-w-[62ch] pr-10 pb-6 leading-relaxed text-ink-soft">{a}</p>
        </details>
      ))}
    </div>
  );
}
