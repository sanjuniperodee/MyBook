"use client";

import { BadgeCheck, Eye, LockKeyhole, RefreshCcw } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Обещания сервиса — одинаковые на лендинге, в заказе и у сертификата. Тексты — common.trust. */
const icons = [Eye, RefreshCcw, BadgeCheck, LockKeyhole];

export function TrustList({ className, compact, dark }: { className?: string; compact?: boolean; dark?: boolean }) {
  const items = useMessages().common.trust;
  return (
    <ul className={cn(compact ? "space-y-2.5" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {items.map((g, i) => {
        const Icon = icons[i];
        return (
          <li key={g.title} className="flex gap-3">
            <Icon className={cn("mt-0.5 shrink-0 text-wine", compact ? "size-4" : "size-5", dark && "text-[#e3a6ae]")} strokeWidth={1.8} />
            <div>
              <div className={cn("font-medium", compact ? "text-xs" : "text-[15px]")}>{g.title}</div>
              {compact ? null : <p className={cn("mt-1 text-sm leading-relaxed", dark ? "text-paper/60" : "text-muted")}>{g.text}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
