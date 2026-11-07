"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/**
 * Escape закрывает панель, только если его никто не обработал: поле, где Escape отменяет ввод (переименование главы),
 * само гасит событие (preventDefault), и оглавление остаётся открытым. События из полей ввода панель не закрывают.
 */
export function closesOnKey(e: Pick<KeyboardEvent, "key" | "defaultPrevented" | "target">) {
  if (e.key !== "Escape" || e.defaultPrevented) return false;
  const tag = (e.target as { tagName?: string } | null)?.tagName ?? "";
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}

/**
 * Панель поверх редактора (оглавление): на компьютере — слева, на телефоне — нижняя шторка с ручкой до 88% высоты
 * (variant="sheet"); Escape и щелчок мимо закрывают.
 */
export function Drawer({ children, onClose, title, variant = "side" }: { children: React.ReactNode; onClose: () => void; title?: string; variant?: "side" | "sheet" }) {
  const t = useMessages().editor;
  const inset = useKeyboardInset();
  const sheet = variant === "sheet";
  const heading = title ?? t.drawerTitle;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Фокус — в окно: экранный диктор читает его название, а Tab идёт по оглавлению, а не по странице под ним.
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => closesOnKey(e) && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div className={cn("fixed inset-0 z-[60] flex", sheet && "max-lg:items-end")}>
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      {/* Экранная клавиатура отнимает низ панели: поле переименования внизу списка не должно оказаться под ней. */}
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col bg-paper shadow-lift outline-none",
          sheet ? "max-h-[88dvh] rounded-t-[20px] lg:h-full lg:max-h-none lg:max-w-sm lg:rounded-none" : "h-full max-w-sm",
        )}
        style={{ paddingBottom: inset }}
      >
        {sheet ? <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong lg:hidden" aria-hidden /> : null}
        <div className="flex items-center justify-between border-b border-line px-5 py-3 lg:py-4">
          <h2 className="text-lg font-semibold">{heading}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t.close}>
            <X className="size-5" />
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          onFocusCapture={(e) => {
            const el = e.target;
            if (el instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) setTimeout(() => el.scrollIntoView({ block: "center" }), 250);
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
