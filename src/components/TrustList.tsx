"use client";

import { BadgeCheck, Eye, LockKeyhole, RefreshCcw } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/** Обещания сервиса — одинаковые на лендинге, в заказе и у сертификата. Тексты — common.trust. */
const icons = [Eye, RefreshCcw, BadgeCheck, LockKeyhole];

/**
 * Полный вид — четыре графы под одной линией, разделённые тонкими вертикальными чертами (как гарантии в договоре);
 * compact — столбик коротких строк рядом с ценой.
 */
export function TrustList({ className, compact, dark }: { className?: string; compact?: boolean; dark?: boolean }) {
  const items = useMessages().common.trust;
  return (
    <ul className={cn(compact ? "space-y-2.5" : "grid border-t border-line sm:grid-cols-2 lg:grid-cols-4", dark && !compact && "border-white/15", className)}>
      {items.map((g, i) => {
        const Icon = icons[i];
        return (
          <li key={g.title} className={cn(compact ? "flex gap-3" : "py-6 sm:px-6 sm:first:pl-0 lg:border-l lg:border-line lg:first:border-l-0 lg:last:pr-0", dark && !compact && "lg:border-white/15")}>
            {compact ? (
              <>
                <Icon className={cn("mt-0.5 size-4 shrink-0 text-wine", dark && "text-[#e3a6ae]")} strokeWidth={1.8} />
                <div className="text-xs font-medium">{g.title}</div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5 text-[15px] font-medium">
                  <Icon className={cn("size-4 shrink-0 text-wine", dark && "text-[#e3a6ae]")} strokeWidth={1.8} aria-hidden />
                  {g.title}
                </div>
                <p className={cn("mt-2 text-sm leading-relaxed", dark ? "text-white/65" : "text-muted")}>{g.text}</p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
