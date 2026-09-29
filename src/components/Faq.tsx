import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Вопросы-ответы с плавным раскрытием — одинаковые на лендинге, сертификате и посадочных страницах. */
export function Faq({ items, className, size = "lg" }: { items: [string, string][]; className?: string; size?: "lg" | "md" }) {
  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map(([q, a]) => (
        <details key={q} className="faq group py-5">
          <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-6 font-medium [&::-webkit-details-marker]:hidden", size === "lg" ? "text-lg" : "text-base")}>
            {q}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line transition-colors duration-300 group-open:border-wine/30 group-open:bg-wine/5">
              <ChevronDown className="size-4 text-muted transition-transform duration-300 group-open:rotate-180 group-open:text-wine" />
            </span>
          </summary>
          <p className="mt-3 pr-10 leading-relaxed text-muted">{a}</p>
        </details>
      ))}
    </div>
  );
}
