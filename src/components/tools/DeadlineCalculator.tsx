"use client";

import { useMemo, useState } from "react";
import { CalendarHeart, Clock, PackageCheck, Zap } from "lucide-react";
import type { DeliveryId } from "@/config/site";
import { useLocale } from "@/i18n/client";
import { dateFor } from "@/i18n/messages/partial";
import { toolUi } from "@/lib/content/tools/ui";
import { deadlineView } from "@/lib/tools/deadline";
import { parseDay } from "@/lib/tools/together";
import { cn } from "@/lib/class-names";
import { Choice } from "./Choice";

const deliveries: DeliveryId[] = ["courier", "post", "pickup", "abroad"];

/** «Успею ли к дате»: вердикт по дате вручения и способу получения. Доставка по умолчанию — курьер, как в оформлении заказа. */
export function DeadlineCalculator({ expressPrice }: { expressPrice: string | null }) {
  const locale = useLocale();
  const ui = toolUi[locale].deadline;
  const [value, setValue] = useState("");
  const [delivery, setDelivery] = useState<DeliveryId>("courier");
  const [now, setNow] = useState<Date | null>(null);

  const fmt = dateFor(locale);
  const view = useMemo(() => (value && now ? deadlineView(value, now, delivery, expressPrice !== null) : null), [value, now, delivery, expressPrice]);
  const typed = !!value && !!parseDay(value);

  let tone: "calm" | "warm" | "hot" = "calm";
  let text = ui.empty;
  let Icon = CalendarHeart;
  if (value && !typed) {
    text = ui.invalid;
  } else if (view) {
    const by = fmt(view.orderBy, true);
    switch (view.verdict) {
      case "past":
        text = ui.past;
        break;
      case "relaxed":
        text = ui.relaxed(by, view.daysToOrder);
        Icon = PackageCheck;
        break;
      case "soon":
        text = ui.soon(by, view.daysToOrder);
        tone = "warm";
        Icon = Clock;
        break;
      case "urgent":
        text = ui.urgent(by, view.daysToOrder);
        tone = "hot";
        Icon = Clock;
        break;
      case "express":
        text = ui.express(fmt(view.orderByExpress ?? view.orderBy, true), expressPrice);
        tone = "hot";
        Icon = Zap;
        break;
      case "digital":
        text = ui.digital;
        tone = "hot";
        break;
    }
  }

  return (
    <div className="card p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,260px)_1fr]">
        <div>
          <label className="label" htmlFor="deadline-date">
            {ui.dateLabel}
          </label>
          <input id="deadline-date" type="date" className="input" value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setNow(new Date());
            }} />
        </div>
        <div>
          <span className="label">{ui.deliveryLabel}</span>
          <Choice label={ui.deliveryLabel} value={delivery} onChange={setDelivery} options={deliveries.map((d) => ({ id: d, label: ui.delivery[d] }))} />
        </div>
      </div>
      <div
        aria-live="polite"
        className={cn(
          "mt-6 flex items-start gap-4 rounded-2xl border p-5",
          tone === "calm" && "border-line bg-cream/50",
          tone === "warm" && "border-amber-200 bg-amber-50/70",
          tone === "hot" && "border-wine/30 bg-rose/40",
        )}
      >
        <Icon className={cn("mt-0.5 size-6 shrink-0", tone === "hot" ? "text-wine" : "text-ink-soft")} aria-hidden />
        <div>
          <p className="leading-relaxed text-ink">{text}</p>
          {view && view.verdict !== "past" ? <p className="mt-2 text-sm text-muted">{ui.detail(view.daysToTarget)}</p> : null}
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-muted">{ui.note}</p>
    </div>
  );
}
