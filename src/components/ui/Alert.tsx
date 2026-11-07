import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/class-names";

/** Сообщение в потоке страницы: ошибка, успех, предупреждение или справка (DESIGN.md §3 — пары статусных токенов). */
export function Alert({ kind = "error", children, className }: { kind?: "error" | "success" | "warning" | "info"; children: React.ReactNode; className?: string }) {
  const Icon = kind === "success" ? CircleCheck : kind === "info" ? Info : TriangleAlert;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--r-ctl)] px-3.5 py-3 text-sm",
        kind === "error" && "bg-danger-bg text-danger",
        kind === "success" && "bg-success-bg text-success",
        kind === "warning" && "bg-warning-bg text-warning",
        kind === "info" && "bg-sunken text-ink-soft",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
