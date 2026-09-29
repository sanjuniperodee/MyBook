"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Тосты и диалог подтверждения вместо alert/confirm.
 * Вызываются откуда угодно в клиентском коде: toast("Сохранено"), await confirmDialog({...}).
 * Отрисовывает их один компонент <Overlays /> в корневом layout.
 */

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  text: string;
  kind: ToastKind;
  leaving?: boolean;
}
interface ConfirmRequest {
  title: string;
  text?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

let toasts: Toast[] = [];
let confirmReq: ConfirmRequest | null = null;
let snapshot: { toasts: Toast[]; confirmReq: ConfirmRequest | null } = { toasts, confirmReq };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { toasts, confirmReq };
  listeners.forEach((l) => l());
};
let seq = 0;

export function toast(text: string, kind: ToastKind = "success") {
  const id = ++seq;
  toasts = [...toasts.slice(-3), { id, text, kind }];
  emit();
  setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3200);
}

/** Сообщение об ошибке из исключения (или запасной текст). */
export function toastError(e: unknown, fallback = "Не получилось. Попробуйте ещё раз.") {
  toast(e instanceof Error && e.message ? e.message : fallback, "error");
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

export function confirmDialog(opts: Omit<ConfirmRequest, "resolve">): Promise<boolean> {
  confirmReq?.resolve(false);
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve };
    emit();
  });
}

/** Короткая форма для однострочных подтверждений: await ask("Удалить задачу?"). */
export function ask(title: string, danger = false) {
  return confirmDialog({ title, danger, confirmLabel: danger ? "Да, удалить" : "Да" });
}

function answer(ok: boolean) {
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

  useEffect(() => {
    if (!req) return;
    const prev = document.activeElement as HTMLElement | null;
    okButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") answer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [req]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6" role="status" aria-live="polite">
        {list.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl py-3 pr-2 pl-4 text-sm shadow-lift transition duration-150",
                t.kind === "error" ? "bg-[#3b1a1e] text-white" : "bg-ink text-white",
                t.leaving ? "translate-y-2 opacity-0" : "animate-[toast-in_220ms_var(--ease-out-soft)_both]",
              )}
            >
              <Icon className={cn("size-4 shrink-0", t.kind === "success" ? "text-emerald-300" : t.kind === "error" ? "text-[#f3a7b0]" : "text-white/70")} />
              <span className="leading-snug">{t.text}</span>
              <button onClick={() => dismiss(t.id)} className="rounded-full p-1.5 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Закрыть">
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {req ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="absolute inset-0 animate-[vt-fade_180ms_ease-out_both] bg-ink/40 backdrop-blur-[2px]" onClick={() => answer(false)} />
          <div className="relative w-full max-w-sm animate-[toast-in_220ms_var(--ease-out-soft)_both] rounded-3xl bg-white p-6 shadow-lift">
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
                {req.cancelLabel ?? "Отмена"}
              </button>
              <button ref={okButton} className={cn("btn", req.danger ? "bg-red-700 text-white hover:bg-red-800" : "btn-primary")} onClick={() => answer(true)}>
                {req.confirmLabel ?? "Подтвердить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
