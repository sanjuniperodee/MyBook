import { cn } from "@/lib/class-names";
import { storeTimeZone } from "@/shared/domain/time";

/**
 * Мелкие общие части экранов сделок и клиентов (воронка, ведомость, карточки): номер «Д12», короткая дата, точка статуса,
 * инициалы ответственного. Без состояния — годится и для серверных, и для клиентских файлов.
 */

/** Номер сделки в заголовках, на доске и в ведомости: «Д12». В текстах-предложениях остаётся «№12». */
export const dealNo = (n: number) => `Д${n}`;

/** «6 ноя» — срок на карточке доски и в ведомости; с годом, если он не текущий. */
export function shortDate(d: Date | string, now: Date | number = Date.now()) {
  const date = typeof d === "string" ? new Date(d) : d;
  const timeZone = storeTimeZone();
  const year = new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone }).format(date);
  const thisYear = new Intl.DateTimeFormat("ru-RU", { year: "numeric", timeZone }).format(now);
  const text = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone }).format(date).replace(/\.$/, "");
  return year === thisYear ? text : `${text} ${year}`;
}

/** Точка статуса: цвет — токеном (bg-danger…) или inline-цветом этапа. */
export function Dot({ className, color }: { className?: string; color?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} style={color ? { background: color } : undefined} aria-hidden />;
}

/** Ответственный: инициалы в кружке (полное имя — в подсказке); без ответственного — пунктирный «?». */
export function Initials({ label, size = 24, className }: { label: string | null; size?: 20 | 24 | 32 | 40; className?: string }) {
  const box = { 20: "size-5 text-[9px]", 24: "size-6 text-[10px]", 32: "size-8 text-xs", 40: "size-10 text-sm" }[size];
  return label ? (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border border-line bg-sunken font-semibold text-ink-soft uppercase", box, className)} title={`Ответственный: ${label}`}>
      {label
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")}
    </span>
  ) : (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full border border-dashed border-line-strong text-muted", box, className)} title="Ответственный не назначен">
      ?
    </span>
  );
}
