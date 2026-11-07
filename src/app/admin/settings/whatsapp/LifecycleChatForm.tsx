"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import type { LifecycleChatKind } from "@/modules/notifications";
import { Actions, Group, Note, Section, Toggle } from "../ui";
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
  const on = props.kinds.length;
  return (
    <Section
      id="lifecycle-chat"
      defaultOpen={false}
      title="Автописьма клиентам без почты: в WhatsApp"
      description="Клиентам из WhatsApp, у которых нет почты, письма уходят сообщением в переписку"
      status={on ? { tone: "ok", label: `включено ${on} из ${Object.keys(labels).length}` } : { tone: "off", label: "выключено" }}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Note>
          У клиентов, пришедших из WhatsApp, вместо почты заглушка — автописьма до них не доходят. Отмеченные уходят сообщением в их переписку WhatsApp (первым на новый номер CRM не пишет): по-русски или по-казахски, в окне и в пределах лимита сообщений от правил, не тем, кто просил не писать первым, и не в диалог, который ведёт бот. Если за сутки клиенту писали бот или правило, а за двое суток — менеджер (и с телефона магазина), сообщение подождёт.
        </Note>
        <Group title="Какие письма отправлять в WhatsApp" hint="Отметьте письма, которые должны дойти до клиентов без почты.">
          {(Object.keys(labels) as LifecycleChatKind[]).map((k) => (
            <Toggle key={k} label={labels[k]} checked={kinds.has(k)} onChange={(on) => toggle(k, on)} />
          ))}
        </Group>
        <Actions>
          <button type="submit" className="btn btn-dark" disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Сохранить
          </button>
        </Actions>
      </form>
    </Section>
  );
}
