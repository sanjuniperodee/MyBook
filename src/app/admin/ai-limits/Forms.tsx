"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { hoursLabel, minutesLabel } from "./labels";
import {
  clearUserLimitsAction,
  resetUsageAction,
  saveGlobalLimitsAction,
  saveUserLimitsAction,
  type AiLimitsState,
} from "./actions";

type Tool = "writer" | "proofread" | "help";

export interface ToolRow {
  tool: Tool;
  title: string;
  note: string;
  short: number;
  shortMin: number;
  long: number;
  longHours: number;
}

function Status({ state }: { state: AiLimitsState }) {
  if (state.error)
    return (
      <p className="text-sm text-danger" role="alert">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="text-sm text-success" role="status">
        {state.ok}
      </p>
    );
  return null;
}

const numInput = "input w-24 tabular-nums";

/** Общие лимиты: по строке на помощника — короткое окно и запросов в нём, длинное окно и запросов в нём. */
export function GlobalLimitsForm({ rows }: { rows: ToolRow[] }) {
  const [state, action] = useActionState<AiLimitsState, FormData>(
    saveGlobalLimitsAction,
    {},
  );
  return (
    <form action={action} className="space-y-4" data-testid="ai-limits-global">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Помощник</th>
              <th>Короткое окно, минут</th>
              <th>Запросов за окно</th>
              <th>Длинное окно, часов</th>
              <th>Запросов за окно</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tool}>
                <td className="min-w-48">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted">{r.note}</div>
                </td>
                <td>
                  <input
                    name={`${r.tool}.shortMin`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1440}
                    defaultValue={r.shortMin}
                    className={numInput}
                    aria-label={`${r.title}: короткое окно, минут`}
                  />
                </td>
                <td>
                  <input
                    name={`${r.tool}.short`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    defaultValue={r.short}
                    className={numInput}
                    aria-label={`${r.title}: запросов за короткое окно`}
                  />
                </td>
                <td>
                  <input
                    name={`${r.tool}.longHours`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={720}
                    defaultValue={r.longHours}
                    className={numInput}
                    aria-label={`${r.title}: длинное окно, часов`}
                  />
                </td>
                <td>
                  <input
                    name={`${r.tool}.long`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    defaultValue={r.long}
                    className={numInput}
                    aria-label={`${r.title}: запросов за длинное окно`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint max-w-3xl">
        Окна считаются на каждого клиента отдельно: первый запрос открывает
        окно, по его концу счёт обнуляется. 60 минут — окно в час, 24 часа —
        сутки, 168 — неделя. Клиенту можно выдать свои числа ниже — они заменяют
        общие только у него.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Сохранить</SubmitButton>
        <Status state={state} />
      </div>
    </form>
  );
}

export interface UserToolRow extends ToolRow {
  /** Свои числа клиента; undefined — общий. */
  ownShort?: number;
  ownLong?: number;
  usedShort: number;
  usedLong: number;
  /** «обнулится 21.11 14:20» или "". */
  shortReset: string;
  longReset: string;
  /** Действующие у клиента лимиты. */
  effShort: number;
  effLong: number;
}

/** Свои лимиты клиента и потраченное в текущих окнах. */
export function UserLimitsForm({
  userId,
  rows,
  note,
  hasOwn,
}: {
  userId: string;
  rows: UserToolRow[];
  note: string;
  hasOwn: boolean;
}) {
  const [state, action] = useActionState<AiLimitsState, FormData>(
    saveUserLimitsAction,
    {},
  );
  const [clearState, clearAction] = useActionState<AiLimitsState, FormData>(
    clearUserLimitsAction,
    {},
  );
  const [resetState, resetAction] = useActionState<AiLimitsState, FormData>(
    resetUsageAction,
    {},
  );
  return (
    <div className="space-y-4" data-testid="ai-limits-user">
      <form action={action} className="space-y-4">
        <input type="hidden" name="userId" value={userId} />
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Помощник</th>
                <th>Короткое окно</th>
                <th>Длинное окно</th>
                <th>Потрачено сейчас</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.tool}>
                  <td className="min-w-40 font-medium">{r.title}</td>
                  <td>
                    <label className="flex items-center gap-2 whitespace-nowrap">
                      <input
                        name={`${r.tool}.short`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={10000}
                        defaultValue={r.ownShort ?? ""}
                        placeholder={String(r.short)}
                        className={numInput}
                        aria-label={`${r.title}: своих запросов за ${minutesLabel(r.shortMin)}`}
                      />
                      <span className="text-xs text-muted">
                        за {minutesLabel(r.shortMin)}
                      </span>
                    </label>
                  </td>
                  <td>
                    <label className="flex items-center gap-2 whitespace-nowrap">
                      <input
                        name={`${r.tool}.long`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={10000}
                        defaultValue={r.ownLong ?? ""}
                        placeholder={String(r.long)}
                        className={numInput}
                        aria-label={`${r.title}: своих запросов за ${hoursLabel(r.longHours)}`}
                      />
                      <span className="text-xs text-muted">
                        за {hoursLabel(r.longHours)}
                      </span>
                    </label>
                  </td>
                  <td className="text-sm whitespace-nowrap tabular-nums">
                    <div>
                      {r.usedShort} из {r.effShort}{" "}
                      <span className="text-xs text-muted">{r.shortReset}</span>
                    </div>
                    <div>
                      {r.usedLong} из {r.effLong}{" "}
                      <span className="text-xs text-muted">{r.longReset}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="max-w-xl">
          <label className="label" htmlFor="ai-limit-note">
            Заметка{" "}
            <span className="font-normal text-muted">
              — зачем выдали, видно в списке
            </span>
          </label>
          <input
            id="ai-limit-note"
            name="note"
            defaultValue={note}
            maxLength={200}
            className="input"
            placeholder="Например: пишет большую книгу, попросила больше"
          />
        </div>
        <p className="hint max-w-3xl">
          Пустое поле — общий лимит (серым). Больше общего — выдали больше,
          меньше — урезали, 0 — помощник клиенту закрыт.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton>Сохранить лимиты клиента</SubmitButton>
          <Status state={state} />
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <SubmitButton className="btn-outline btn-sm">
            Обнулить потраченное
          </SubmitButton>
        </form>
        {hasOwn ? (
          <form action={clearAction}>
            <input type="hidden" name="userId" value={userId} />
            <SubmitButton className="btn-outline btn-sm">
              Вернуть общие лимиты
            </SubmitButton>
          </form>
        ) : null}
        <Status state={resetState} />
        <Status state={clearState} />
      </div>
      <p className="hint">
        «Обнулить потраченное» — клиент сразу может снова пользоваться всеми
        помощниками, лимиты не меняются.
      </p>
    </div>
  );
}
