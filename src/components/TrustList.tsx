import { BadgeCheck, Eye, LockKeyhole, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

/** Обещания сервиса — одинаковые на лендинге, в заказе и у сертификата. */
export const guarantees = [
  { icon: Eye, title: "Точный макет до оплаты", text: "Вы листаете PDF всех страниц — книга будет напечатана ровно так." },
  { icon: RefreshCcw, title: "Перепечатаем бесплатно", text: "Если в книге брак печати или переплёта — сделаем новую за наш счёт." },
  { icon: BadgeCheck, title: "Проверяем каждый экземпляр", text: "Перед отправкой смотрим цвет, обрез и переплёт." },
  { icon: LockKeyhole, title: "Ваши тексты — только ваши", text: "Книгу видите только вы. Типография получает файлы лишь для печати." },
];

export function TrustList({ className, compact, dark }: { className?: string; compact?: boolean; dark?: boolean }) {
  return (
    <ul className={cn(compact ? "space-y-2.5" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {guarantees.map((g) => (
        <li key={g.title} className="flex gap-3">
          <g.icon className={cn("mt-0.5 shrink-0 text-wine", compact ? "size-4" : "size-5", dark && "text-[#e3a6ae]")} strokeWidth={1.8} />
          <div>
            <div className={cn("font-medium", compact ? "text-xs" : "text-[15px]")}>{g.title}</div>
            {compact ? null : <p className={cn("mt-1 text-sm leading-relaxed", dark ? "text-paper/60" : "text-muted")}>{g.text}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
