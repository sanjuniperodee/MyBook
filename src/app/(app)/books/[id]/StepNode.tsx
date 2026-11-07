import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { StepStatus } from "./book-nav";

/**
 * Узел пути книги: галочка — готово, кольцо с долей — в работе, «!» — нужно поправить, номер — не начато.
 * Цвет не единственный признак: у каждого состояния свой знак (и подпись для диктора — в разметке рядом).
 * current — шаг, на который смотрит автор (номер в винной рамке).
 */
export function StepNode({ status, fraction, n, size = "md", current, surface = "bg-paper" }: { status: StepStatus; fraction: number; n: number; size?: "md" | "lg"; current?: boolean; /** Фон под узлом: внутренний круг кольца закрашивается им. */ surface?: string }) {
  const box = size === "lg" ? "size-8 text-[13px]" : "size-5 text-[10px]";
  const icon = size === "lg" ? "size-4" : "size-3";
  if (status === "done") {
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-success-bg text-success", box)}>
        <Check className={icon} strokeWidth={2.4} />
      </span>
    );
  }
  if (status === "attention") {
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-warning-bg text-warning", box)}>
        <TriangleAlert className={icon} strokeWidth={2.2} />
      </span>
    );
  }
  if (status === "partial") {
    const deg = Math.max(18, Math.round(fraction * 360));
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full", box)} style={{ background: `conic-gradient(var(--color-wine) ${deg}deg, var(--color-line-strong) 0)` }}>
        <span className={cn("grid place-items-center rounded-full font-semibold text-ink-soft tabular-nums", size === "lg" ? "size-[26px]" : "size-[15px]", surface)}>{n}</span>
      </span>
    );
  }
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full border font-semibold tabular-nums", box, current ? "border-wine text-wine" : "border-line-strong text-muted")}>
      {n}
    </span>
  );
}
