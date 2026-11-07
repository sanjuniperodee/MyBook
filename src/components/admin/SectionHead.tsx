import { cn } from "@/lib/class-names";

/**
 * Заголовок блока на холсте (вне листа): название слева, пояснение или действие справа. Для блоков без рамки —
 * например, «Продажи за 30 дней» над строкой показателей.
 */
export function SectionHead({ title, meta, actions, id, className }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1", className)}>
      <h2 id={id} className="text-[15px] font-semibold tracking-[-0.005em]">
        {title}
      </h2>
      {meta || actions ? (
        <div className="flex items-center gap-3 text-xs text-muted">
          {meta}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
