"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/overlays";
import { Intro } from "@/components/admin/Intro";
import type { LifecycleChatKind } from "@/modules/notifications";
import { Section } from "../ui";
import { saveLifecycleChatAction } from "./actions";

const labels: Record<LifecycleChatKind, string> = {
  deadline: "Дедлайн к празднику: успеть заказать к дате",
  almost: "Книга почти готова: посмотреть макет и заказать",
  unpaid: "Заказ с сайта ждёт оплаты",
  review: "Просьба об отзыве после доставки (электронной — через неделю после оплаты)",
};

/**
 * Автописьма клиентам без почты (automation-16): у клиентов из WhatsApp вместо почты заглушка, и письма до них не доходят.
 * Включённые уходят сообщением в их переписку WhatsApp — как сообщения правил: в окне, в пределах суточного лимита, мимо
 * стоп-листа и активного бота, и не раньше чем через сутки после бота или правила и двое суток после менеджера.
 */
export function LifecycleChatForm(props: { kinds: LifecycleChatKind[] }) {
  const [pending, start] = useTransition();
  const [kinds, setKinds] = useState(new Set(props.kinds));
  const toggle = (k: LifecycleChatKind, on: boolean) => setKinds((s) => (on ? new Set([...s, k]) : new Set([...s].filter((x) => x !== k))));
  const save = () =>
    start(async () => {
      const r = await saveLifecycleChatAction([...kinds]);
      toast(r.ok ? "Сохранено" : r.error, r.ok ? "success" : "error");
    });
  return (
    <Section defaultOpen={false} title="Автописьма клиентам без почты — в WhatsApp">
      <Intro className="mb-4">
        У клиентов, пришедших из WhatsApp, вместо почты заглушка — автописьма до них не доходят. Отмеченные уходят сообщением в их переписку WhatsApp (первым на новый номер CRM не пишет): по-русски или по-казахски, в окне и в пределах лимита сообщений от правил, не тем, кто просил не писать первым, и не в диалог, который ведёт бот. Если за сутки клиенту писали бот или правило, а за двое суток — менеджер (и с телефона магазина), сообщение подождёт.
      </Intro>
      <div className="space-y-2">
        {(Object.keys(labels) as LifecycleChatKind[]).map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-wine" checked={kinds.has(k)} onChange={(e) => toggle(k, e.target.checked)} />
            <span>{labels[k]}</span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary btn-sm mt-4 h-10" disabled={pending} onClick={save}>
        Сохранить
      </button>
    </Section>
  );
}
