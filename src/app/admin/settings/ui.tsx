"use client";

import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, ChevronDown, Copy, LoaderCircle, RefreshCw, XCircle } from "lucide-react";
import { Intro } from "@/components/admin/Intro";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { ask, toast, toastError } from "@/components/ui/overlays";
import { cn } from "@/lib/class-names";
import type { SettingsState } from "./state";
import { rotateTokenAction } from "./actions";

/**
 * Местный кит страниц настроек (DESIGN.md §7.2, шаблон 5): лист с состоянием и главным действием в шапке, группы полей
 * с заголовком и пояснением, подвал листа с «Сохранить». Форма — одна колонка до 640 px, всё остальное тянется на лист.
 */

/** Состояние раздела: подключено / выключено / нужно внимание / ошибка. Читает и боковая навигация (по data-state). */
export type SheetTone = "ok" | "off" | "warn" | "bad";
export const TONE_BADGE: Record<SheetTone, BadgeTone> = { ok: "success", off: "neutral", warn: "warning", bad: "danger" };
export const TONE_TEXT: Record<SheetTone, string> = { ok: "подключено", off: "выключено", warn: "нужно внимание", bad: "ошибка" };

export interface SheetStatus {
  tone: SheetTone;
  label: string;
}

/**
 * Лист настройки. Шапка — название, состояние («подключено», «выключено», «нужно внимание») и главное действие
 * («Проверить», «Подключить»); пояснение в одну строку. Лист сворачивается: закрытый показывает только шапку, поэтому
 * страницу с пятью формами видно целиком. Содержимое остаётся в разметке — набранное в свёрнутой форме не теряется.
 * Ссылка с #id и клик по боковому якорю раскрывают и показывают лист; нажатие кнопки в шапке тоже раскрывает его,
 * чтобы результат проверки было видно.
 */
export function Section({
  title,
  status,
  badge,
  children,
  id,
  defaultOpen = true,
  description,
  actions,
}: {
  title: string;
  status?: SheetStatus;
  /** Своя метка вместо `status` (счётчик, число записей). */
  badge?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  defaultOpen?: boolean;
  /** Одна строка под заголовком: что настраивает лист. */
  description?: React.ReactNode;
  /** Главное действие листа: «Проверить», «Привязать номер». */
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  const body = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => setOpen(true);
    el.addEventListener("sheet:open", show);
    if (id && window.location.hash === `#${id}`) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- хэш адреса известен только в браузере: раскрываем один раз при открытии страницы
      setOpen(true);
      el.scrollIntoView({ block: "start" });
    }
    return () => el.removeEventListener("sheet:open", show);
  }, [id]);
  const toggle = () => setOpen((v) => !v);
  return (
    <section id={id} ref={ref} data-sheet data-state={status?.tone} className="panel scroll-mt-[calc(var(--topbar-h)+1rem)]">
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1 basis-60 cursor-pointer" onClick={toggle}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 className="panel-title">{title}</h2>
            {status ? (
              <Badge tone={TONE_BADGE[status.tone]}>
                <span className="sr-only">{TONE_TEXT[status.tone]}: </span>
                {status.label}
              </Badge>
            ) : null}
            {badge}
          </div>
          {description ? <p className={cn("mt-0.5 text-xs text-muted", !open && "truncate")}>{description}</p> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {actions ? (
            <div className="flex items-center gap-1.5" onClickCapture={() => setOpen(true)}>
              {actions}
            </div>
          ) : null}
          <button type="button" onClick={toggle} aria-expanded={open} aria-controls={body} aria-label={`${open ? "Свернуть" : "Развернуть"}: ${title}`} className="btn btn-ghost btn-icon btn-sm text-muted">
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} strokeWidth={1.8} aria-hidden />
          </button>
        </div>
      </header>
      <div id={body} hidden={!open} className="border-t border-line px-4 py-4 sm:px-5 sm:py-5">
        {children}
      </div>
    </section>
  );
}

/** Подсказка: короткая — как есть, длинная (строка больше 120 знаков) сворачивается с «Подробнее». */
function Hint({ children, className }: { children: React.ReactNode; className?: string }) {
  if (typeof children === "string" && children.length > 120)
    return (
      <Intro small className={className}>
        {children}
      </Intro>
    );
  return <p className={cn("text-xs text-muted", className)}>{children}</p>;
}

/** Блок формы: заголовок группы, пояснение одной строкой и поля. Группы разделены линией. Ширина — до 640 px. */
export function Group({ title, hint, children, className }: { title: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <fieldset className={cn("min-w-0 max-w-[40rem] border-t border-line pt-5 first-of-type:border-t-0 first-of-type:pt-0", className)}>
      <legend className="float-left w-full text-sm font-semibold">{title}</legend>
      {hint ? (
        <Hint className="clear-both mt-0.5 mb-3">{hint}</Hint>
      ) : (
        <div className="clear-both mb-3" />
      )}
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

/** Пояснение внутри листа: короткое видно, длинное сворачивается. Ширина — до 640 px. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Intro small className={cn("max-w-[40rem]", className)}>
      {children}
    </Intro>
  );
}

/** «Как подключить»: шаги и справка — свёрнуты, пока интеграция работает; раскрыты, пока её не подключили. */
export function Help({ title = "Как подключить", open, children }: { title?: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group/help max-w-[40rem] rounded-[var(--r-ctl)] border border-line bg-sunken/40">
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-sm font-medium text-ink-soft select-none [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open/help:rotate-180" strokeWidth={1.8} aria-hidden />
        {title}
      </summary>
      <div className="space-y-2 border-t border-line px-3 py-3 text-[13px] leading-relaxed text-ink-soft">{children}</div>
    </details>
  );
}

/** Поле: подпись над полем, подсказка (длинная сворачивается) и ошибка под ним; связи для экранного диктора проставляются сами. */
export function Field({ label, hint, error, optional, after, children, className }: { label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; optional?: boolean; /** Кнопка справа от поля («Сохранить адрес»). */ after?: React.ReactNode; children: React.ReactElement<Record<string, unknown>>; className?: string }) {
  const auto = useId();
  const id = (isValidElement(children) && typeof children.props.id === "string" ? children.props.id : null) ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined, ...(after && !/(^|\s)w-/.test(String(children.props.className ?? "")) ? { className: cn(children.props.className as string | undefined, "min-w-0 flex-1") } : {}) })
    : children;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="label">
        {label}
        {optional ? <span className="font-normal text-muted"> (необязательно)</span> : null}
      </label>
      {after ? (
        <div className="flex gap-2">
          {control}
          {after}
        </div>
      ) : (
        control
      )}
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <div id={hintId} className="mt-1">
          <Hint>{hint}</Hint>
        </div>
      ) : null}
    </div>
  );
}

/** Флажок с подписью и пояснением под ней. Работает и в форме (name), и с состоянием (checked/onChange). */
export function Toggle({
  label,
  hint,
  name,
  value,
  checked,
  defaultChecked,
  onChange,
  disabled,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  name?: string;
  value?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("flex items-start gap-3 text-sm", disabled ? "cursor-default text-muted" : "cursor-pointer", className)}>
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        className="mt-[3px] size-4 shrink-0 accent-wine"
      />
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Состояние интеграции: «подключено» — зелёным с точкой, остальное — нейтрально (для листов без `status`). */
export const Status = ({ on, tone, label }: { on?: boolean; tone?: SheetTone; label: string }) => (
  <Badge tone={TONE_BADGE[tone ?? (on ? "ok" : "off")]}>{label}</Badge>
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

/** Кнопка «Сохранить» подвала листа: тушью, с крутилкой, пока идёт сохранение. */
export function SaveButton({ children = "Сохранить", pendingText }: { children?: React.ReactNode; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-dark">
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/**
 * Подвал листа: «Сохранить», второстепенные действия и итог. Лежит на подложке во всю ширину листа и прилипает к низу
 * экрана, пока форма длиннее экрана, — кнопка всегда под рукой.
 */
export function Actions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("sticky bottom-[var(--tabbar-h,0px)] z-[5] -mx-4 mt-6 -mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-b-[var(--r-panel)] border-t border-line bg-sunken/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:px-5", className)}>
      {children}
    </div>
  );
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
        <input id={id} readOnly value={value} className="input min-w-0 flex-1 bg-sunken/50 font-mono text-xs" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn btn-outline btn-icon" onClick={() => navigator.clipboard.writeText(value).then(() => toast("Скопировано"))} aria-label={`Скопировать: ${label}`} title="Скопировать">
          <Copy className="size-4" strokeWidth={1.8} />
        </button>
        {onRotate ? (
          <button type="button" className="btn btn-ghost btn-icon" onClick={onRotate} title="Выпустить новый токен (старый адрес перестанет работать)" aria-label="Новый токен">
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
        className="input"
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
    <p role={check.ok ? "status" : "alert"} className={cn("mb-4 flex max-w-[40rem] gap-2 rounded-[var(--r-ctl)] px-3 py-2 text-sm", wrap ? "items-start" : "items-center", check.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger")}>
      <Icon className={cn("size-4 shrink-0", wrap && "mt-0.5")} aria-hidden /> <span className="min-w-0">{check.message}</span>
    </p>
  );
}

/** Вариант выбора (провайдер, АТС): радиокнопка в рамке, выбранный подсвечен. */
export function Choice({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex min-h-9 cursor-pointer items-center gap-2 rounded-[var(--r-ctl)] border px-3 py-1.5 text-sm transition-colors", active ? "border-wine/50 bg-rose text-ink" : "border-line bg-white text-ink-soft hover:border-line-strong hover:text-ink")}>
      {children}
    </label>
  );
}

/** Строка действия внутри листа (например, «Добавить»): без подвала, с отступом сверху. */
export function InlineActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2", className)}>{children}</div>;
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
