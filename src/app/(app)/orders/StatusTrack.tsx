import { Check } from "lucide-react";
import { cn } from "@/lib/class-names";
import type { OrderStatus } from "@/shared/domain/orders";

export interface TrackStep {
  status: OrderStatus;
  label: string;
}

/** Подписи этапов — orders.order.steps из словаря. */
export interface TrackLabels {
  placed: string;
  paid: string;
  printing: string;
  shipping: string;
  delivered: string;
  ready: string;
}

/**
 * Этапы заказа по порядку. Печатная книга: оформлен, оплачен, печатается, в пути, доставлен. Электронная: оформлен,
 * готов к скачиванию (оплата сразу даёт файлы).
 */
export function orderSteps(printed: boolean, s: TrackLabels): TrackStep[] {
  return printed
    ? [
        { status: "pending_payment", label: s.placed },
        { status: "paid", label: s.paid },
        { status: "in_production", label: s.printing },
        { status: "shipped", label: s.shipping },
        { status: "delivered", label: s.delivered },
      ]
    : [
        { status: "pending_payment", label: s.placed },
        { status: "paid", label: s.ready },
      ];
}

/** Ключ для текста «что сейчас» (orders.order.now): у оплаченной электронной книги — «ready», а не «paid». */
export const nowKey = (status: OrderStatus, printed: boolean) => (status === "paid" && !printed ? "ready" : status);

/**
 * Линейка статуса заказа: этапы — точки на одной линии. Пройденные — винные с галочкой, текущий — с кольцом, будущие —
 * пустые. Дошедший до последнего этапа заказ (доставлен, электронная книга готова) показан пройденным целиком.
 * На узком экране подписан только текущий этап — остальные видны точками, а «что сейчас» страница показывает строкой (nowKey).
 */
export function StatusTrack({ steps, status, label, size = "lg", className }: { steps: TrackStep[]; status: OrderStatus; label: string; size?: "lg" | "sm"; className?: string }) {
  const current = steps.findIndex((s) => s.status === status);
  const finished = current === steps.length - 1;
  const dot = size === "lg" ? "size-6" : "size-4";
  return (
    <ol aria-label={label} className={cn("grid", className)} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((s, i) => {
        const done = i < current || (finished && i === current);
        const here = i === current && !finished;
        return (
          <li key={s.status} aria-current={here ? "step" : undefined} className="relative flex min-w-0 flex-col items-center">
            {/* Участок линии от предыдущей точки до этой: окрашен, если этап достигнут. */}
            {i > 0 ? <span aria-hidden className={cn("absolute right-1/2 h-0.5 w-full", size === "lg" ? "top-[11px]" : "top-[7px]", i <= current ? "bg-wine" : "bg-line-strong")} /> : null}
            <span
              aria-hidden
              className={cn(
                "relative z-10 flex items-center justify-center rounded-full",
                dot,
                done ? "bg-wine text-white" : here ? "border-2 border-wine bg-white" : "border-2 border-line-strong bg-white",
              )}
            >
              {done ? <Check className={size === "lg" ? "size-3.5" : "size-2.5"} strokeWidth={3} /> : here ? <span className={cn("rounded-full bg-wine", size === "lg" ? "size-2" : "size-1.5")} /> : null}
            </span>
            <span className={cn("mt-2 px-0.5 text-center leading-tight text-balance", here ? "block max-sm:whitespace-nowrap" : "hidden sm:block", size === "lg" ? "text-[13px]" : "text-xs", here ? "font-semibold text-ink" : done ? "text-ink-soft" : "text-muted")}>{s.label}</span>
            {here ? null : <span className="sr-only sm:hidden">{s.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}
