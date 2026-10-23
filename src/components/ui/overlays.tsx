"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/class-names";
import { useMessages } from "@/i18n/client";

/**
 * Тосты и диалог подтверждения вместо alert/confirm.
 * Вызываются откуда угодно в клиентском коде: toast("Сохранено"), await confirmDialog({...}).
 * Отрисовывает их один компонент <Overlays /> в корневом layout — поверх листов и диалогов страниц.
 */

type ToastKind = "success" | "error" | "info";
/** Кнопка в тосте: «Отменить» после правки и т. п. Нажали — тост закрывается и выполняется run. */
export interface ToastAction {
  label: string;
  run: () => unknown;
}
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  action?: ToastAction;
  /** Второе действие — рядом, потише (например, «Не печатать его» рядом с «Отменить»). */
  alt?: ToastAction;
  leaving?: boolean;
}
interface ConfirmRequest {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Третья кнопка — другой ответ на вопрос (например, «Не печатать» рядом с «Разложить после глав»): промис вернёт "alt". */
  altLabel?: string;
  danger?: boolean;
  /** Короткий вопрос: кнопки «Да» / «Да, удалить». */
  short?: boolean;
  resolve: (ok: boolean | "alt") => void;
}

/** Сколько живёт тост с действием: успеть прочитать и нажать «Отменить». */
export const ACTION_TOAST_MS = 7000;

let toasts: Toast[] = [];
let confirmReq: ConfirmRequest | null = null;
let snapshot: { toasts: Toast[]; confirmReq: ConfirmRequest | null } = { toasts, confirmReq };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { toasts, confirmReq };
  listeners.forEach((l) => l());
};
let seq = 0;

export function toast(text: string, kind: ToastKind = "success", opts: { action?: ToastAction; alt?: ToastAction } = {}) {
  const id = ++seq;
  toasts = [...toasts.slice(-3), { id, text, kind, ...(opts.action ? { action: opts.action } : {}), ...(opts.alt ? { alt: opts.alt } : {}) }];
  emit();
  setTimeout(() => dismiss(id), opts.action || opts.alt ? ACTION_TOAST_MS : kind === "error" ? 6000 : 3200);
}

/** Нажали кнопку в тосте: тост уходит, действие выполняется; ошибка действия — тостом. */
function runAction(id: number, action: ToastAction) {
  dismiss(id);
  Promise.resolve()
    .then(action.run)
    .catch((e) => toastError(e));
}

/** Сообщение об ошибке из исключения (или запасной текст). */
export function toastError(e: unknown, fallback?: string) {
  // Пустой текст — Overlays покажет общее «Не получилось» на языке страницы.
  toast(e instanceof Error && e.message ? e.message : (fallback ?? ""), "error");
}

function dismiss(id: number) {
  if (!toasts.some((t) => t.id === id)) return;
  toasts = toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t));
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 180);
}

export function confirmDialog(opts: Omit<ConfirmRequest, "resolve" | "altLabel">): Promise<boolean>;
export function confirmDialog(opts: Omit<ConfirmRequest, "resolve"> & { altLabel: string }): Promise<boolean | "alt">;
export function confirmDialog(opts: Omit<ConfirmRequest, "resolve">): Promise<boolean | "alt"> {
  confirmReq?.resolve(false);
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve };
    emit();
  });
}

/** Короткая форма для однострочных подтверждений: await ask("Удалить задачу?"). */
export function ask(title: string, danger = false) {
  return confirmDialog({ title, danger, short: true });
}

function answer(ok: boolean | "alt") {
  const req = confirmReq;
  confirmReq = null;
  emit();
  req?.resolve(ok);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const serverSnapshot = { toasts: [] as Toast[], confirmReq: null as ConfirmRequest | null };

const icons = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function Overlays() {
  const { toasts: list, confirmReq: req } = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);
  const okButton = useRef<HTMLButtonElement>(null);
  const m = useMessages().common;

  useEffect(() => {
    if (!req) return;
    const prev = document.activeElement as HTMLElement | null;
    okButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape закрывает только вопрос: лист под ним (closesOnKey) видит, что событие уже обработано.
      e.preventDefault();
      answer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [req]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h,0px)+1rem)] z-[110] flex flex-col items-center gap-2 px-4 sm:bottom-[calc(var(--tabbar-h,0px)+1.5rem)] lg:bottom-6" role="status" aria-live="polite">
        {list.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex max-w-md min-w-0 items-center gap-3 rounded-2xl py-3 pr-2 pl-4 text-sm shadow-lift transition duration-150",
                // Два действия — второй строкой под текстом: в одну строку на телефоне текст сжимался до слога в строке.
                t.alt && "flex-wrap gap-y-1",
                t.kind === "error" ? "bg-[#3b1a1e] text-white" : "bg-ink text-white",
                t.leaving ? "translate-y-2 opacity-0" : "animate-[toast-in_220ms_var(--ease-out-soft)_both]",
              )}
            >
              <Icon className={cn("size-4 shrink-0", t.kind === "success" ? "text-emerald-300" : t.kind === "error" ? "text-[#f3a7b0]" : "text-white/70")} />
              <span className={cn("min-w-0 leading-snug [overflow-wrap:anywhere]", t.alt && "flex-1")}>{t.text || m.errors.generic}</span>
              {t.alt || t.action ? (
                <span className={cn("-my-2 flex shrink-0 items-center", t.alt && "order-last my-0 basis-full justify-end")}>
                  {t.alt ? (
                    <button onClick={() => runAction(t.id, t.alt!)} className="min-h-11 rounded-full px-2.5 text-[13px] text-white/75 hover:bg-white/10 hover:text-white">
                      {t.alt.label}
                    </button>
                  ) : null}
                  {t.action ? (
                    <button onClick={() => runAction(t.id, t.action!)} className="min-h-11 rounded-full px-3 font-semibold text-white underline decoration-white/40 underline-offset-4 hover:bg-white/10">
                      {t.action.label}
                    </button>
                  ) : null}
                </span>
              ) : null}
              <button onClick={() => dismiss(t.id)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label={m.actions.close}>
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {req ? (
        <div className="fixed inset-0 z-[105] flex items-end justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="absolute inset-0 animate-[vt-fade_180ms_ease-out_both] bg-ink/40 backdrop-blur-[2px]" onClick={() => answer(false)} />
          <div className="relative w-full max-w-sm animate-[toast-in_220ms_var(--ease-out-soft)_both] rounded-3xl bg-white p-6 shadow-lift">
            <span className="mx-auto -mt-3 mb-3 block h-1 w-9 rounded-full bg-line sm:hidden" aria-hidden />
            {req.danger ? (
              <span className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-red-50 text-red-700">
                <AlertTriangle className="size-5" />
              </span>
            ) : null}
            <h2 id="confirm-title" className="text-lg font-semibold">
              {req.title}
            </h2>
            {req.text ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{req.text}</p> : null}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="btn btn-outline" onClick={() => answer(false)}>
                {req.cancelLabel ?? m.actions.cancel}
              </button>
              {req.altLabel ? (
                <button className="btn btn-outline" onClick={() => answer("alt")}>
                  {req.altLabel}
                </button>
              ) : null}
              <button ref={okButton} className={cn("btn", req.danger ? "bg-red-700 text-white hover:bg-red-800" : "btn-primary")} onClick={() => answer(true)}>
                {req.confirmLabel ?? (req.short ? (req.danger ? m.actions.yesDelete : m.actions.yes) : m.actions.confirm)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
