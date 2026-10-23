"use client";

import { useActionState, useRef } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Section, Result, Group, Field } from "../ui";
import type { SettingsState } from "../state";
import { saveCrmSettingsAction } from "./actions";
import { MERGE_CLOSED_DAYS_MAX } from "@/modules/sales/domain/merge";
import { kzHolidays, parseOffDates } from "@/shared/domain/schedule";

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** «2026-12-16» → «16.12.2026»: так даты видит и набирает сотрудник. */
const ruDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export function CrmSettingsForm({
  slaMinutes,
  reassignMinutes,
  workHours,
  autoDealFrom,
  unsorted,
  maxDiscount,
  mergeClosedDays,
  widget,
  digest,
  chatReward,
}: {
  slaMinutes: number;
  reassignMinutes: number;
  workHours: { days: number[]; from: string; to: string; off?: string[] };
  autoDealFrom: string;
  unsorted: boolean;
  maxDiscount: number;
  mergeClosedDays: number;
  widget: { enabled: boolean; chat: boolean };
  /** Утренняя сводка сотрудникам (bots-11). */
  digest: boolean;
  chatReward: boolean;
}) {
  const [state, action] = useActionState<SettingsState, FormData>(saveCrmSettingsAction, {});
  const offRef = useRef<HTMLTextAreaElement>(null);
  const year = new Date().getFullYear();
  /** Дописывает в список праздники РК года, которых там ещё нет; прошедшие даты не добавляет. */
  const addHolidays = (y: number) => {
    const el = offRef.current;
    if (!el) return;
    const today = new Date().toISOString().slice(0, 10);
    const { dates } = parseOffDates(`${el.value} ${kzHolidays(y).filter((d) => d >= today).join(" ")}`);
    el.value = dates.map(ruDate).join("\n");
  };
  return (
    <Section title="Отдел продаж">
      <form action={action} className="space-y-6">
        <Group title="Рабочее время" hint="Новые заявки сразу получает менеджер на смене, у которого меньше всего заявок за сегодня. Вне рабочего времени заявки ждут и утром раздаются по кругу; норматив ответа не идёт, можно включить автоответ в «Автоматизациях». Часовой пояс — Алматы.">
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
          <div className="mt-4 max-w-sm">
            <Field
              label="Праздничные выходные"
              hint="Даты, в которые отдел не работает, хотя день недели рабочий: по одной в строке, «16.12.2026». В эти дни заявки ждут утра, норматив ответа и сроки задач не идут, бот в режиме «вне рабочего времени» отвечает сам. Курбан айт и переносы выходных добавьте руками."
            >
              <textarea ref={offRef} name="off" rows={4} defaultValue={(workHours.off ?? []).map(ruDate).join("\n")} className="input text-sm" placeholder="16.12.2026" />
            </Field>
            <div className="mt-2 flex flex-wrap gap-2">
              {[year, year + 1].map((y) => (
                <button key={y} type="button" onClick={() => addHolidays(y)} className="btn btn-ghost btn-sm h-8 border border-line">
                  + Праздники РК {y}
                </button>
              ))}
            </div>
          </div>
        </Group>

        <Group title="Заявки">
          <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <Field label="Норматив ответа, рабочих минут">
              <input name="slaMinutes" type="number" min={1} max={1440} defaultValue={slaMinutes} className="input h-10 text-sm" />
            </Field>
            <Field label="Не взял заявку — следующему через, мин" hint="0 — не передавать.">
              <input name="reassignMinutes" type="number" min={0} max={1440} defaultValue={reassignMinutes} className="input h-10 text-sm" />
            </Field>
            <Field label="Сделка с сайта заводится, когда клиент…">
              <select name="autoDealFrom" defaultValue={autoDealFrom} className="input h-10 text-sm">
                <option value="off">не заводить (только заказы)</option>
                <option value="registered">зарегистрировался</option>
                <option value="book_started">начал книгу</option>
                <option value="book_half">написал половину книги</option>
                <option value="book_ready">почти закончил книгу</option>
              </select>
            </Field>
            <Field
              label="Влить заявку в закрытую сделку, дней"
              hint="0 — нельзя. Только в успешную сделку с заказом и только заявку, пришедшую до или после её закрытия не дальше этого срока, — та же покупка (например, переписка в WhatsApp о заказе с сайта). Остальные заявки — новые продажи: их не вливают в закрытые."
            >
              <input name="mergeClosedDays" type="number" min={0} max={MERGE_CLOSED_DAYS_MAX} defaultValue={mergeClosedDays} className="input h-10 text-sm" />
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="digest" defaultChecked={digest} className="mt-0.5 size-4 accent-wine" />
            <span>Утренняя сводка в начале смены (с 09:00, в рабочий день): чаты без ответа, «я оплатил», даты событий на 3 дня, ночь бота — в колокольчик и push всем, кто ведёт сделки</span>
          </label>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="chatReward" defaultChecked={chatReward} className="mt-0.5 size-4 accent-wine" />
            <span>
              Награда за друга и за покупку из чата: клиент пришёл по ссылке-приглашению и оплатил счёт — владельцу кода промокод и письмо, как за заказ на сайте (одна награда на сделку, только первая покупка друга)
            </span>
          </label>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="unsorted" defaultChecked={unsorted} className="mt-0.5 size-4 accent-wine" />
            <span>
              «Неразобранное»: заявка с нового номера (чат, звонок) считается не взятой, пока ответственный не ответит клиенту или не примет её; не взял вовремя — она уходит следующему
            </span>
          </label>
        </Group>

        <Group title="Скидки">
          <div className="max-w-xs">
            <Field
              label="Лимит скидки от прайса, %"
              hint="Один для счёта из чата, бюджета и тарифа договорённости, новых клиентов и промокода из чата. Счёт и договорённость ниже — только роли с правом «Продавать ниже прайса без лимита»; промокод из чата не больше лимита ни у кого."
            >
              <input name="maxDiscount" type="number" min={0} max={50} defaultValue={maxDiscount} className="input h-10 text-sm" />
            </Field>
          </div>
        </Group>

        <Group title="Виджет на сайте">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="widgetEnabled" defaultChecked={widget.enabled} className="mt-0.5 size-4 accent-wine" />
            <span>Кнопки «Написать в WhatsApp» и «Перезвоните мне» (заявка с задачей позвонить за 15 минут)</span>
          </label>
          <label className="mt-2 flex items-start gap-2 pl-6 text-sm">
            <input type="checkbox" name="widgetChat" defaultChecked={widget.chat} className="mt-0.5 size-4 accent-wine" />
            <span>Онлайн-чат в виджете — сообщения приходят в «Чаты», отвечать оттуда же</span>
          </label>
        </Group>

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <SubmitButton className="btn-sm">Сохранить</SubmitButton>
          <Result state={state} />
        </div>
      </form>
    </Section>
  );
}
