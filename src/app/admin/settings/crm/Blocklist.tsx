"use client";

import { useState, useTransition } from "react";
import { Ban } from "lucide-react";
import { toast } from "@/components/ui/overlays";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Group, Note, Section } from "../ui";
import { addBlocklistAction, unblockAction } from "../../deals/actions";

type Reason = "spam" | "no_marketing";

const reasonLabel: Record<Reason, string> = { spam: "спам", no_marketing: "не писать первым" };

/**
 * Стоп-лист номеров: спам (заявок и уведомлений нет) и «не писать первым» (клиент пишет и получает ответы, но бот не
 * напоминает о себе и правила автоматизаций ему не пишут). Номер можно добавить вручную или убрать.
 */
export function Blocklist({ items }: { items: { value: string; label: string; date: string; reason: Reason; note: string | null; by: string | null }[] }) {
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState<Reason>("no_marketing");
  const [note, setNote] = useState("");
  const add = () =>
    start(async () => {
      const r = await addBlocklistAction({ phone, reason, note });
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        setPhone("");
        setNote("");
      }
    });
  return (
    <Section
      id="blocklist"
      defaultOpen={false}
      title="Стоп-лист"
      description="Номера, которым CRM не пишет первой, и спам"
      status={{ tone: "off", label: items.length ? `${items.length} в списке` : "пуст" }}
    >
      <div className="space-y-5">
        <Note>
          «Спам» — с номера не заводятся заявки и не приходят уведомления. «Не писать первым» — клиент пишет и получает ответы как обычно, но бот не напоминает о себе, а правила автоматизаций ему не пишут. Клиент сам написал «не пишите мне» — номер попадает сюда сам; отметить можно и в карточке клиента или сделки.
        </Note>
        <form
          className="max-w-[40rem] space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Group title="Добавить номер" hint="Спам или «не писать первым» — можно с причиной.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Номер телефона">
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+7 701 234 56 78" maxLength={40} className="input" />
              </Field>
              <Field label="Отметка">
                <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} className="input">
                  <option value="no_marketing">не писать первым</option>
                  <option value="spam">спам</option>
                </select>
              </Field>
            </div>
            <Field label="Причина" optional>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Просил не писать по телефону" className="input" />
            </Field>
            <div>
              <button className="btn btn-dark" disabled={pending || !phone.trim()}>
                Добавить номер
              </button>
            </div>
          </Group>
        </form>
        {items.length === 0 ? (
          <EmptyState compact icon={Ban} title="Стоп-лист пуст">
            Отметить заявку как спам можно в «Неразобранном».
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--r-ctl)] border border-line">
            {items.map((i) => (
              <li key={i.value} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="font-medium tabular-nums">{i.label}</span>
                <Badge tone={i.reason === "spam" ? "danger" : "warning"}>{reasonLabel[i.reason]}</Badge>
                <span className="min-w-0 flex-1 truncate text-xs text-muted" title={i.note ?? ""}>
                  {i.note ?? ""}
                </span>
                <span className="text-xs text-muted">
                  {i.date}, {i.by ?? "CRM"}
                </span>
                <button className="btn btn-ghost btn-sm text-wine" disabled={pending} onClick={() => start(() => unblockAction(i.value))}>
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  );
}
