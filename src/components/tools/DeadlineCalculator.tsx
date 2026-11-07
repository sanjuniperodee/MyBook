"use client";

import { useMemo, useState } from "react";
import { CalendarHeart, Clock, PackageCheck, Zap } from "lucide-react";
import type { DeliveryId } from "@/config/site";
import { useLocale } from "@/i18n/client";
import { dateFor } from "@/i18n/messages/partial";
import { toolUi } from "@/lib/content/tools/ui";
import { deadlineView } from "@/lib/tools/deadline";
import { parseDay } from "@/lib/tools/together";
import { Choice, Figure, ResultEmpty, ToolField, Verdict, Workbench } from "./Workbench";

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
  let icon = <CalendarHeart className="size-5" aria-hidden />;
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
        icon = <PackageCheck className="size-5" aria-hidden />;
        break;
      case "soon":
        text = ui.soon(by, view.daysToOrder);
        tone = "warm";
        icon = <Clock className="size-5" aria-hidden />;
        break;
      case "urgent":
        text = ui.urgent(by, view.daysToOrder);
        tone = "hot";
        icon = <Clock className="size-5" aria-hidden />;
        break;
      case "express":
        text = ui.express(fmt(view.orderByExpress ?? view.orderBy, true), expressPrice);
        tone = "hot";
        icon = <Zap className="size-5" aria-hidden />;
        break;
      case "digital":
        text = ui.digital;
        tone = "hot";
        break;
    }
  }
  const showFigure = !!view && (view.verdict === "relaxed" || view.verdict === "soon" || view.verdict === "urgent");

  return (
    <Workbench
      input={
        <>
          <ToolField label={ui.dateLabel} htmlFor="deadline-date">
            <input
              id="deadline-date"
              type="date"
              className="input"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setNow(new Date());
              }}
            />
          </ToolField>
          <ToolField label={ui.deliveryLabel}>
            <Choice label={ui.deliveryLabel} value={delivery} onChange={setDelivery} options={deliveries.map((d) => ({ id: d, label: ui.delivery[d] }))} />
          </ToolField>
          <p className="text-xs leading-relaxed text-muted">{ui.note}</p>
        </>
      }
      result={
        !value ? (
          <ResultEmpty>{ui.empty}</ResultEmpty>
        ) : (
          <div className="space-y-5">
            {showFigure && view ? <Figure value={fmt(view.orderBy, true)} caption={ui.orderBy} sub={ui.daysLeft(view.daysToOrder)} size="md" /> : null}
            <Verdict tone={tone} icon={icon}>
              <p>{text}</p>
              {view && view.verdict !== "past" ? <p className="mt-2 text-sm text-muted">{ui.detail(view.daysToTarget)}</p> : null}
            </Verdict>
          </div>
        )
      }
    />
  );
}
