"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Result } from "../ui";
import type { SettingsState } from "../state";
import { saveCrmSettingsAction } from "./actions";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function CrmSettingsForm({
  slaMinutes,
  reassignMinutes,
  workHours,
  autoDealFrom,
  unsorted,
  maxDiscount,
  widget,
}: {
  slaMinutes: number;
  reassignMinutes: number;
  workHours: { days: number[]; from: string; to: string };
  autoDealFrom: string;
  unsorted: boolean;
  maxDiscount: number;
  widget: { enabled: boolean; chat: boolean };
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveCrmSettingsAction, {});
  return (
    <Section title="Отдел продаж">
      <form action={action} className="space-y-5">
        <div>
          <span className="mb-1.5 block text-xs text-muted">Рабочее время (Алматы)</span>
          <div className="flex flex-wrap items-center gap-2">
            {weekdays.map((d, i) => (
              <label key={d} className="flex cursor-pointer items-center gap-1 rounded-lg border border-line px-2 py-1.5 text-sm has-checked:border-wine/40 has-checked:bg-rose/40">
                <input type="checkbox" name="days" value={i + 1} defaultChecked={workHours.days.includes(i + 1)} className="accent-wine" />
                {d}
              </label>
            ))}
            <input name="from" type="time" defaultValue={workHours.from} className="input h-9 w-28 text-sm" aria-label="С" />
            <span className="text-muted">—</span>
            <input name="to" type="time" defaultValue={workHours.to} className="input h-9 w-28 text-sm" aria-label="До" />
          </div>
          <p className="mt-1 text-xs text-muted">Новые заявки сразу получает менеджер на смене, у которого меньше всего заявок за сегодня. Вне рабочего времени заявки ждут и утром раздаются по кругу; норматив ответа не идёт, можно включить автоответ в «Автоматизациях».</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Норматив ответа, рабочих минут</span>
            <input name="slaMinutes" type="number" min={1} max={1440} defaultValue={slaMinutes} className="input h-10 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Не взял заявку — следующему через, мин (0 — нет)</span>
            <input name="reassignMinutes" type="number" min={0} max={1440} defaultValue={reassignMinutes} className="input h-10 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Сделка с сайта заводится, когда клиент…</span>
            <select name="autoDealFrom" defaultValue={autoDealFrom} className="input h-10 text-sm">
              <option value="off">не заводить (только заказы)</option>
              <option value="registered">зарегистрировался</option>
              <option value="book_started">начал книгу</option>
              <option value="book_half">написал половину книги</option>
              <option value="book_ready">почти закончил книгу</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted">Макс. скидка менеджера из чата, %</span>
            <input name="maxDiscount" type="number" min={0} max={50} defaultValue={maxDiscount} className="input h-10 text-sm" />
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="unsorted" defaultChecked={unsorted} className="mt-0.5 size-4 accent-wine" />
          <span>
            «Неразобранное»: заявка с нового номера (чат, звонок) считается не взятой, пока ответственный не ответит клиенту или не примет её; не взял вовремя — она уходит следующему
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="widgetEnabled" defaultChecked={widget.enabled} className="mt-0.5 size-4 accent-wine" />
          <span>Виджет на сайте: кнопки «Написать в WhatsApp» и «Перезвоните мне» (заявка с задачей позвонить за 15 минут)</span>
        </label>
        <label className="flex items-start gap-2 pl-6 text-sm">
          <input type="checkbox" name="widgetChat" defaultChecked={widget.chat} className="mt-0.5 size-4 accent-wine" />
          <span>Онлайн-чат в виджете — сообщения приходят в «Чаты», отвечать оттуда же</span>
        </label>
        <div className="flex items-center gap-3">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <Result state={state} />
        </div>
      </form>
    </Section>
  );
}
