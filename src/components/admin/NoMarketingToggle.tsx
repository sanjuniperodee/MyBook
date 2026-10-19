"use client";

import { useState, useTransition } from "react";
import { ask, toast } from "@/components/ui/overlays";
import { setClientNoMarketingAction, setDealNoMarketingAction } from "@/app/admin/crm-actions";

/**
 * «Писать первым» в карточке клиента или сделки: можно или «не писать первым» (стоп-лист). Клиент с отметкой пишет и
 * получает ответы как обычно, но бот не напоминает о себе, а правила автоматизаций ему не пишут.
 */
export function NoMarketingToggle({ target, on, disabled }: { target: { clientId: string } | { dealId: string }; on: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [current, setCurrent] = useState(on);
  const toggle = () =>
    start(async () => {
      const next = !current;
      if (next && !(await ask("Не писать клиенту первым? Бот не будет напоминать о себе, правила автоматизаций — писать ему. На его сообщения отвечать можно."))) return;
      const r = "dealId" in target ? await setDealNoMarketingAction(target.dealId, next) : await setClientNoMarketingAction(target.clientId, next);
      if (r.ok) {
        setCurrent(next);
        toast(r.message ?? "Сохранено", "success");
      } else toast(r.message, "error");
    });
  return (
    <span className="inline-flex items-center gap-2" data-testid="no-marketing">
      <span className={current ? "font-medium text-red-700" : "text-ink"}>{current ? "не писать первым" : "можно"}</span>
      {disabled ? null : (
        <button type="button" className="text-xs text-wine hover:underline disabled:opacity-50" disabled={pending} onClick={toggle}>
          {current ? "снять" : "не писать первым"}
        </button>
      )}
    </span>
  );
}
