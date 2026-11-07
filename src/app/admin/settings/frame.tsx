import { cn } from "@/lib/class-names";
import { SheetRail, type RailItem } from "./SheetRail";

/**
 * Шаблон «Настройки» (DESIGN.md §7.2): слева липкие якоря листов с состоянием, справа стопка листов. Якоря нужны, когда
 * листов больше одного. `id="settings-stack"` — корень, за которым якоря следят (data-state листов).
 */
export function SettingsFrame({ anchors, children, className }: { anchors?: readonly RailItem[]; children: React.ReactNode; className?: string }) {
  const rail = !!anchors && anchors.length > 1;
  return (
    <div className={cn("grid items-start gap-x-8 gap-y-2", rail && "lg:grid-cols-[13.5rem_minmax(0,1fr)]", className)}>
      {rail ? <SheetRail items={anchors} /> : null}
      <div id="settings-stack" className="min-w-0 space-y-4">
        {children}
      </div>
    </div>
  );
}
