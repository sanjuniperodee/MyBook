import { storeTimeZone } from "@/shared/domain/time";
import { cn } from "@/lib/class-names";
import type { OrderStatus } from "@/shared/domain/orders";

interface Step {
  key: string;
  label: string;
}

/** Этапы печатного заказа: «принят» — это ожидание оплаты (заказ создан), дальше — по статусам. */
const PRINTED: (Step & { status: OrderStatus })[] = [
  { key: "accepted", label: "Принят", status: "pending_payment" },
  { key: "paid", label: "Оплачен", status: "paid" },
  { key: "production", label: "В производстве", status: "in_production" },
  { key: "shipped", label: "Отправлен", status: "shipped" },
  { key: "delivered", label: "Доставлен", status: "delivered" },
];
/** У электронной версии печати и доставки нет: принят → выполнен. */
const DIGITAL: (Step & { status: OrderStatus })[] = [
  { key: "accepted", label: "Принят", status: "pending_payment" },
  { key: "paid", label: "Выполнен", status: "paid" },
];

const day = (d: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: storeTimeZone() }).format(d).replace(/\.$/, "");

/**
 * Линейка производства в шапке заказа: этапы от «принят» до «доставлен», пройденные — залиты, текущий — винным кольцом,
 * под каждым — дата, когда заказ до него дошёл (по журналу). На телефоне — «шаг N из M» и полоска из этапов. У отменённого
 * заказа линейка останавливается там, где он был, и заканчивается красным «Отменён».
 */
export function ProductionRuler({ status, printed, createdAt, events }: { status: OrderStatus; printed: boolean; createdAt: Date; events: { status: string | null; createdAt: Date }[] }) {
  const steps = printed ? PRINTED : DIGITAL;
  const cancelled = status === "cancelled";
  const order = steps.map((s) => s.status);
  // Где остановился: у отменённого — на последнем достигнутом этапе (по журналу), иначе — на текущем статусе.
  const reached = cancelled ? Math.max(0, ...events.map((e) => order.indexOf(e.status as OrderStatus))) : Math.max(0, order.indexOf(status));
  // Электронная версия: «оплачен» — это уже конец, этап закрыт, а не «в работе».
  const finished = !cancelled && (status === "delivered" || (!printed && status === "paid"));
  const at = (i: number) => (i === 0 ? createdAt : (events.find((e) => e.status === steps[i].status)?.createdAt ?? null));
  const current = steps[reached];

  return (
    <div data-testid="order-ruler">
      {/* Телефон: шаг N из M и полоска. */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">{cancelled ? "Отменён" : current.label}</span>
          <span className="text-xs text-muted tabular-nums">{cancelled ? `дошёл до этапа «${current.label}»` : `этап ${reached + 1} из ${steps.length}`}</span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.key} className={cn("h-1.5 flex-1 rounded-full", cancelled ? (i <= reached ? "bg-ink" : "bg-sunken") : i < reached || finished ? "bg-ink" : i === reached ? "bg-wine" : "bg-sunken")} />
          ))}
        </div>
      </div>

      {/* Ноутбук и планшет: линейка этапов с датами. */}
      <ol className="grid max-sm:hidden" style={{ gridTemplateColumns: `repeat(${steps.length + (cancelled ? 1 : 0)}, minmax(0, 1fr))` }} aria-label="Этапы заказа">
        {steps.map((s, i) => {
          const done = i < reached || (i === reached && (finished || cancelled));
          const now = i === reached && !finished && !cancelled;
          const when = at(i);
          const last = i === steps.length - 1 && !cancelled;
          return (
            <li key={s.key} className="relative pr-3" aria-current={now ? "step" : undefined}>
              <span
                className={cn("relative z-10 block size-3.5 rounded-full", done ? "bg-ink" : now ? "bg-wine ring-4 ring-wine/20" : "border-2 border-line-strong bg-white")}
                aria-hidden
              />
              {!last ? <span className={cn("absolute top-[6px] right-0 left-4 h-0.5 rounded-full", i < reached ? "bg-ink" : cancelled && i === reached ? "bg-danger/50" : "bg-line")} aria-hidden /> : null}
              <div className={cn("mt-2 text-[13px] leading-tight", now ? "font-semibold text-ink" : done ? "font-medium text-ink-soft" : "text-muted")}>
                {s.label}
                <span className="sr-only">{done ? ", пройден" : now ? ", текущий этап" : ", впереди"}</span>
              </div>
              <div className="mt-0.5 text-xs text-muted tabular-nums">
                {when && (done || now) ? (now && i === 0 ? `с ${day(when)}, ждёт оплаты` : now ? `с ${day(when)}` : day(when)) : "—"}
              </div>
            </li>
          );
        })}
        {cancelled ? (
          <li className="relative pr-3 text-danger" aria-current="step">
            <span className="relative z-10 block size-3.5 rounded-full bg-danger ring-4 ring-danger/20" aria-hidden />
            <div className="mt-2 text-[13px] leading-tight font-semibold">Отменён</div>
            <div className="mt-0.5 text-xs tabular-nums">{events.find((e) => e.status === "cancelled") ? day(events.find((e) => e.status === "cancelled")!.createdAt) : "—"}</div>
          </li>
        ) : null}
      </ol>
    </div>
  );
}
