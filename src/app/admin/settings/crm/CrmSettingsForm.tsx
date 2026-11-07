"use client";

import { useActionState, useRef } from "react";
import { Actions, Field, Group, Note, Result, SaveButton, Section, Toggle } from "../ui";
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
  widget: { enabled: boolean; chat: boolean; help: boolean; helpStats: { total: number; answered: number; costUsd: number } | null };
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
    <Section id="crm-sales" title="Отдел продаж" description="Рабочее время, заявки, скидки и виджет на сайте">
      <form action={action} className="space-y-5">
        <Group title="Рабочее время" hint="Новые заявки получает менеджер на смене, у которого меньше всего заявок за сегодня. Часовой пояс — Алматы.">
          <div className="flex flex-wrap items-center gap-2">
            {weekdays.map((d, i) => (
              <label key={d} className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[var(--r-ctl)] border border-line bg-white px-2.5 text-sm has-checked:border-wine/50 has-checked:bg-rose">
                <input type="checkbox" name="days" value={i + 1} defaultChecked={workHours.days.includes(i + 1)} className="accent-wine" />
                {d}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input name="from" type="time" defaultValue={workHours.from} className="input w-32" aria-label="С" />
            <span className="text-muted">до</span>
            <input name="to" type="time" defaultValue={workHours.to} className="input w-32" aria-label="До" />
          </div>
          <Note>Вне рабочего времени заявки ждут и утром раздаются по кругу; норматив ответа не идёт, можно включить автоответ в «Автоматизациях».</Note>
          <Field
            label="Праздничные выходные"
            hint="Даты, в которые отдел не работает, хотя день недели рабочий: по одной в строке, «16.12.2026». В эти дни заявки ждут утра, норматив ответа и сроки задач не идут, бот в режиме «вне рабочего времени» отвечает сам. Курбан айт и переносы выходных добавьте руками."
          >
            <textarea ref={offRef} name="off" rows={4} defaultValue={(workHours.off ?? []).map(ruDate).join("\n")} className="input" placeholder="16.12.2026" />
          </Field>
          <div className="flex flex-wrap gap-2">
            {[year, year + 1].map((y) => (
              <button key={y} type="button" onClick={() => addHolidays(y)} className="btn btn-outline btn-sm">
                Добавить праздники РК {y}
              </button>
            ))}
          </div>
        </Group>

        <Group title="Заявки" hint="Как заявки попадают к менеджерам и когда считаются не взятыми.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Норматив ответа, рабочих минут">
              <input name="slaMinutes" type="number" min={1} max={1440} defaultValue={slaMinutes} className="input" />
            </Field>
            <Field label="Не взял заявку: следующему через, мин" hint="0 — не передавать.">
              <input name="reassignMinutes" type="number" min={0} max={1440} defaultValue={reassignMinutes} className="input" />
            </Field>
          </div>
          <Field label="Сделка с сайта заводится, когда клиент…">
            <select name="autoDealFrom" defaultValue={autoDealFrom} className="input">
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
            className="max-w-xs"
          >
            <input name="mergeClosedDays" type="number" min={0} max={MERGE_CLOSED_DAYS_MAX} defaultValue={mergeClosedDays} className="input" />
          </Field>
          <Toggle name="unsorted" defaultChecked={unsorted} label="«Неразобранное»" hint="Заявка с нового номера (чат, звонок) считается не взятой, пока ответственный не ответит клиенту или не примет её; не взял вовремя — она уходит следующему." />
          <Toggle name="digest" defaultChecked={digest} label="Утренняя сводка в начале смены" hint="С 09:00, в рабочий день: чаты без ответа, «я оплатил», даты событий на 3 дня, ночь бота — в колокольчик и push всем, кто ведёт сделки." />
          <Toggle
            name="chatReward"
            defaultChecked={chatReward}
            label="Награда за друга и за покупку из чата"
            hint="Клиент пришёл по ссылке-приглашению и оплатил счёт — владельцу кода промокод и письмо, как за заказ на сайте (одна награда на сделку, только первая покупка друга)."
          />
        </Group>

        <Group title="Скидки" hint="Один лимит для счёта из чата, бюджета и тарифа договорённости, новых клиентов и промокода из чата.">
          <Field label="Лимит скидки от прайса, %" hint="Счёт и договорённость ниже — только роли с правом «Продавать ниже прайса без лимита»; промокод из чата не больше лимита ни у кого." className="max-w-xs">
            <input name="maxDiscount" type="number" min={0} max={50} defaultValue={maxDiscount} className="input" />
          </Field>
        </Group>

        <Group title="Виджет на сайте" hint="Кнопки связи для посетителей сайта и помощник в кабинете книги.">
          <Toggle name="widgetEnabled" defaultChecked={widget.enabled} label="Кнопки «Написать в WhatsApp» и «Перезвоните мне»" hint="Заявка с задачей позвонить за 15 минут." />
          <Toggle name="widgetChat" defaultChecked={widget.chat} label="Онлайн-чат в виджете" hint="Сообщения приходят в «Чаты», отвечать оттуда же." className="pl-7" />
          <Toggle
            name="widgetHelp"
            defaultChecked={widget.help}
            label="Помощник в кабинете книги"
            hint={
              <>
                Кнопка «Помощь» у клиента: AI отвечает по справочнику кабинета и данным его книги (модель — как у AI-продажника); не знает или вопрос о цене, оплате, сроках, правке — передаёт менеджеру в «Чаты» и заметкой в WhatsApp-чат клиента.
                {widget.helpStats?.total ? (
                  <span className="mt-1 block">
                    За 30 дней: вопросов {widget.helpStats.total}, ответил сам {widget.helpStats.answered}, менеджеру {widget.helpStats.total - widget.helpStats.answered}
                    {widget.helpStats.costUsd ? `, расход на модель $${widget.helpStats.costUsd}` : ""}
                  </span>
                ) : null}
              </>
            }
          />
        </Group>

        <Actions>
          <SaveButton />
          <Result state={state} />
        </Actions>
      </form>
    </Section>
  );
}
