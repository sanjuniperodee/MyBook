"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import { Intro } from "@/components/admin/Intro";
import { Section, Status } from "../ui";
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
    <Section defaultOpen={false} title="Стоп-лист" badge={items.length ? <Status on={false} label={String(items.length)} /> : undefined}>
      <Intro className="mb-4">
        «Спам» — с номера не заводятся заявки и не приходят уведомления. «Не писать первым» — клиент пишет и получает ответы как обычно, но бот не напоминает о себе, а правила автоматизаций ему не пишут. Клиент сам написал «не пишите мне» — номер попадает сюда сам; отметить можно и в карточке клиента или сделки.
      </Intro>
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Номер телефона</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+7 701 234 56 78" maxLength={40} className="input h-9 w-44 text-sm" aria-label="Номер телефона" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Отметка</span>
          <select value={reason} onChange={(e) => setReason(e.target.value as Reason)} className="input h-9 text-sm" aria-label="Отметка">
            <option value="no_marketing">не писать первым</option>
            <option value="spam">спам</option>
          </select>
        </label>
        <label className="block min-w-48 flex-1">
          <span className="mb-1 block text-xs text-muted">Причина (необязательно)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Просил не писать по телефону" className="input h-9 w-full text-sm" aria-label="Причина" />
        </label>
        <button className="btn btn-outline btn-sm h-9" disabled={pending || !phone.trim()}>
          Добавить номер
        </button>
      </form>
      {items.length === 0 ? <p className="text-sm text-muted">Стоп-лист пуст. Отметить заявку как спам можно в «Неразобранном».</p> : null}
      <div className="divide-y divide-line">
        {items.map((i) => (
          <div key={i.value} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
            <span className="tabular-nums">{i.label}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs", i.reason === "spam" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900")}>{reasonLabel[i.reason]}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted" title={i.note ?? ""}>
              {i.note ?? ""}
            </span>
            <span className="text-xs text-muted">
              {i.date} · {i.by ?? "CRM"}
            </span>
            <button className="text-xs text-wine hover:underline" disabled={pending} onClick={() => start(() => unblockAction(i.value))}>
              Убрать
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}
