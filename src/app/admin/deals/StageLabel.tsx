import { cn } from "@/lib/class-names";

/**
 * Этап сделки: цвет этапа — точкой, текст — токеном (DESIGN.md §6: статус в CRM — точка и подпись). Этапы красят в «Воронке»
 * любым цветом; заливка всей плашки этим цветом не читалась в тёмной теме и спорила со статусными цветами. Свою точку рисуем
 * сами, без .badge: у него в CRM уже есть точка, и их получалось две.
 */
export function StageLabel({ name, color, className, title }: { name: string; color: string; className?: string; title?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 text-[13px] whitespace-nowrap text-ink-soft", className)} title={title ?? name}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
