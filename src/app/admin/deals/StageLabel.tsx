import { cn } from "@/lib/class-names";

/**
 * Этап сделки значком (DESIGN.md §6 — `.badge`): цвет этапа — точкой, текст — токеном. Этапы красят в «Воронке» любым
 * цветом; заливка всей плашки этим цветом не читалась в тёмной теме и спорила со статусными цветами.
 */
export function StageLabel({ name, color, className, title }: { name: string; color: string; className?: string; title?: string }) {
  return (
    <span className={cn("badge max-w-full", className)} title={title}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}
