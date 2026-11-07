import { ChevronDown } from "lucide-react";

/**
 * Раскрывающаяся строка в конце листа (редкая форма: сменить тариф, изменить контакты): закрытая занимает одну строку —
 * название и подсказка, форма остаётся в разметке. Без JS: нативный <details>.
 */
export function Disclosure({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <details id={id} className="group scroll-mt-[calc(var(--topbar-h)+1rem)] border-t border-line">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-ink-soft hover:bg-sunken/60 hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
        {title}
        {hint ? <span className="text-xs font-normal text-muted max-sm:hidden">{hint}</span> : null}
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-line p-4 sm:p-5">{children}</div>
    </details>
  );
}
