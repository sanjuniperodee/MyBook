import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function Alert({ kind = "error", children, className }: { kind?: "error" | "success" | "info"; children: React.ReactNode; className?: string }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm",
        kind === "error" && "bg-red-50 text-red-800",
        kind === "success" && "bg-emerald-50 text-emerald-800",
        kind === "info" && "bg-cream text-ink-soft",
        className,
      )}
    >
      {kind === "success" ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}
