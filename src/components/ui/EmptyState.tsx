import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Пустое состояние (DESIGN.md §7): что здесь появится и что сделать сейчас — а не «нет данных». compact — внутри листа.
 */
export function EmptyState({ icon: Icon, title, children, action, compact, className }: { icon?: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center text-center", compact ? "gap-1.5 px-4 py-8" : "gap-2 px-6 py-16", className)}>
      {Icon ? (
        <span className={cn("mb-1 flex items-center justify-center rounded-xl bg-sunken text-ink-soft", compact ? "size-9" : "size-11")}>
          <Icon className={compact ? "size-4" : "size-5"} strokeWidth={1.8} aria-hidden />
        </span>
      ) : null}
      <p className={cn("font-medium", compact ? "text-sm" : "text-[15px]")}>{title}</p>
      {children ? <p className="max-w-sm text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
