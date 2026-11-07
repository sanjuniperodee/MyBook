"use client";

import { useId } from "react";
import { CheckCircle2, Copy, RefreshCw, XCircle } from "lucide-react";
import { Intro } from "@/components/admin/Intro";
import { Badge } from "@/components/ui/Badge";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import type { SettingsState } from "./state";
import { rotateTokenAction } from "./actions";

export { Section } from "@/components/admin/Section";

/** Блок формы с подзаголовком: связанные поля вместе, пояснение — две строки и «Подробнее». */
export function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 border-t border-line pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="float-left mb-1 w-full text-sm font-semibold">{title}</legend>
      {hint ? <Intro small className="clear-both mb-3">{hint}</Intro> : <div className="clear-both mb-2" />}
      {children}
    </fieldset>
  );
}

/** Поле с подписью сверху (как `.label`) и необязательной подсказкой снизу (длинная сворачивается). */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block">
        <span className="label">{label}</span>
        {children}
      </label>
      {hint ? <Intro small className="mt-1">{hint}</Intro> : null}
    </div>
  );
}

/** Состояние интеграции в заголовке листа: «подключено» — зелёным с точкой, остальное — нейтрально. */
export const Status = ({ on, label }: { on: boolean; label: string }) => (
  <Badge tone={on ? "success" : "neutral"} dot>
    {label}
  </Badge>
);

/** Итог сохранения рядом с кнопкой: ошибка — красным, «Сохранено» — зелёным, с иконкой (цвет — не единственный признак). */
export function Result({ state }: { state: SettingsState }) {
  if (state.error)
    return (
      <span role="alert" className="inline-flex items-start gap-1.5 text-sm text-danger">
        <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.error}
      </span>
    );
  if (state.ok)
    return (
      <span role="status" className="inline-flex flex-col gap-1 text-sm">
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {state.ok}
        </span>
        {state.warning ? <span className="text-xs text-warning">{state.warning}</span> : null}
      </span>
    );
  return null;
}

/** Поле только для чтения с кнопкой «Скопировать» (и «Новый токен», если передан onRotate). */
export function CopyField({ label, value, onRotate }: { label: string; value: string; onRotate?: () => void }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <input id={id} readOnly value={value} className="input h-10 min-w-0 flex-1 bg-sunken/50 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-outline btn-icon h-10 w-10" onClick={() => navigator.clipboard.writeText(value).then(() => toast("Скопировано"))} aria-label={`Скопировать: ${label}`} title="Скопировать">
          <Copy className="size-4" strokeWidth={1.8} />
        </button>
        {onRotate ? (
          <button type="button" className="btn btn-ghost btn-icon h-10 w-10" onClick={onRotate} title="Выпустить новый токен (старый адрес перестанет работать)" aria-label="Новый токен">
            <RefreshCw className="size-4" strokeWidth={1.8} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Поле секрета: сохранённое значение не показывается; пустое — «не менять», галочка — удалить. Галочка — со своей
 * подписью рядом с полем, а не внутри подписи пароля (иначе клик по подписи ставил фокус не туда).
 */
export function SecretInput({ name, label, saved, fromEnv, placeholder }: { name: string; label: string; saved: string; fromEnv: boolean; placeholder?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete="off"
        disabled={fromEnv}
        aria-describedby={saved || fromEnv ? hintId : undefined}
        placeholder={fromEnv ? "задан в переменных окружения" : saved ? "оставьте пустым, чтобы не менять" : (placeholder ?? "")}
        className="input h-10 text-sm"
      />
      {fromEnv ? (
        <span id={hintId} className="hint">
          Задан на сервере — здесь не меняется.
        </span>
      ) : saved ? (
        <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted">
          <span id={hintId}>
            Сохранён: <span className="font-mono">{saved}</span>
          </span>
          <label className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 hover:text-danger">
            <input type="checkbox" name={`${name}Clear`} className="size-3.5 accent-wine" /> Удалить сохранённый
          </label>
        </span>
      ) : null}
    </div>
  );
}

/** Результат «Проверить»: зелёный или красный, с иконкой. wrap — для длинных текстов (иконка сверху). */
export function CheckMessage({ check, wrap }: { check: { ok: boolean; message: string } | null; wrap?: boolean }) {
  if (!check) return null;
  const Icon = check.ok ? CheckCircle2 : XCircle;
  return (
    <p role={check.ok ? "status" : "alert"} className={cn("flex gap-2 rounded-[10px] px-3 py-2 text-sm", wrap ? "items-start" : "items-center", check.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
      <Icon className={cn("size-4 shrink-0", wrap && "mt-0.5")} aria-hidden /> <span className="min-w-0">{check.message}</span>
    </p>
  );
}

/** Вариант выбора (провайдер, АТС): радиокнопка в рамке, выбранный подсвечен. */
export function Choice({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-sm transition-colors", active ? "border-wine/50 bg-rose/50 text-ink" : "border-line bg-white text-ink-soft hover:border-line-strong hover:text-ink")}>
      {children}
    </label>
  );
}

/** Строка действий формы: главная кнопка, второстепенные и итог — одной строкой под полями. */
export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">{children}</div>;
}

/** Новый токен вебхука — после подтверждения. */
export async function rotateToken(key: "wazzup.webhookToken" | "pbx.token" | "email.webhookToken") {
  if (!(await ask("Выпустить новый токен? Старый адрес вебхука перестанет работать — его нужно будет заменить у провайдера.", true))) return;
  try {
    await rotateTokenAction(key);
    toast("Новый токен выпущен");
  } catch (e) {
    toastError(e);
  }
}
