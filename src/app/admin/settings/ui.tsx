"use client";

import { CheckCircle2, Copy, RefreshCw, XCircle } from "lucide-react";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import type { SettingsState } from "./state";
import { rotateTokenAction } from "./actions";

/** Карточка интеграции: заголовок, значок состояния, содержимое. */
export function Section({ title, badge, children }: { title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="font-semibold">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

export const Status = ({ on, label }: { on: boolean; label: string }) => (
  <span className={cn("rounded-full px-2.5 py-0.5 text-xs", on ? "bg-emerald-100 text-emerald-800" : "bg-cream text-muted")}>{label}</span>
);

export function Result({ state }: { state: SettingsState }) {
  if (state.error) return <span className="text-xs text-red-700">{state.error}</span>;
  if (state.ok)
    return (
      <span className="text-xs text-emerald-700">
        {state.ok}
        {state.warning ? <span className="mt-1 block text-amber-800">{state.warning}</span> : null}
      </span>
    );
  return null;
}

/** Поле только для чтения с кнопкой «Скопировать» (и «Новый токен», если передан onRotate). */
export function CopyField({ label, value, onRotate }: { label: string; value: string; onRotate?: () => void }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="flex gap-2">
        <input readOnly value={value} className="input h-9 min-w-0 flex-1 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-outline btn-sm h-9" onClick={() => navigator.clipboard.writeText(value).then(() => toast("Скопировано"))} aria-label="Скопировать">
          <Copy className="size-4" />
        </button>
        {onRotate ? (
          <button type="button" className="btn btn-ghost btn-sm h-9" onClick={onRotate} title="Выпустить новый токен (старый адрес перестанет работать)" aria-label="Новый токен">
            <RefreshCw className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Поле секрета: сохранённое значение не показывается; пустое — «не менять», галочка — удалить. */
export function SecretInput({ name, label, saved, fromEnv, placeholder }: { name: string; label: string; saved: string; fromEnv: boolean; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input name={name} type="password" autoComplete="off" disabled={fromEnv} placeholder={fromEnv ? "задан в переменных окружения" : saved ? `сохранён ${saved} — оставьте пустым, чтобы не менять` : (placeholder ?? "")} className="input h-10 text-sm" />
      {saved && !fromEnv ? (
        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" name={`${name}Clear`} className="accent-wine" /> удалить сохранённый
        </span>
      ) : null}
    </label>
  );
}

/** Результат «Проверить»: зелёный или красный, с иконкой. wrap — для длинных текстов (иконка сверху). */
export function CheckMessage({ check, wrap }: { check: { ok: boolean; message: string } | null; wrap?: boolean }) {
  if (!check) return null;
  if (wrap)
    return (
      <p className={cn("flex items-start gap-1.5 text-sm", check.ok ? "text-emerald-700" : "text-red-700")}>
        {check.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />} {check.message}
      </p>
    );
  return (
    <p className={cn("flex items-center gap-1.5 text-sm", check.ok ? "text-emerald-700" : "text-red-700")}>
      {check.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {check.message}
    </p>
  );
}

/** Вариант выбора (провайдер, АТС): радиокнопка в рамке, выбранный подсвечен. */
export function Choice({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <label className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2", active ? "border-wine/40 bg-rose/30" : "border-line")}>{children}</label>;
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
