"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { closesOnKey } from "@/components/editor/questions/Drawer";
import { cn } from "@/lib/class-names";

// Открытые листы по порядку: Escape закрывает только верхний (лист места поверх листа главы, кадр поверх листа места).
const open: number[] = [];
let seq = 0;

/**
 * Нижний лист для телефона (на широком экране — окно по центру): заголовок и низ с кнопками стоят на месте,
 * середина прокручивается. full — на телефоне на весь экран. Экранная клавиатура поднимает лист (useKeyboardInset),
 * Escape и нажатие мимо закрывают, страница под листом не прокручивается. Без document (тесты) — рисуется на месте.
 */
export function Sheet({
  title,
  onClose,
  onBack,
  backLabel,
  closeLabel,
  footer,
  full,
  layer = "z-[90]",
  children,
}: {
  title: string;
  onClose: () => void;
  /** Кнопка «Назад» слева от заголовка (второй шаг листа). */
  onBack?: () => void;
  backLabel?: string;
  closeLabel: string;
  footer?: ReactNode;
  full?: boolean;
  /** Слой: лист поверх листа — выше. */
  layer?: string;
  children: ReactNode;
}) {
  const inset = useKeyboardInset();
  const panel = useRef<HTMLDivElement>(null);
  const [id] = useState(() => ++seq);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    open.push(id);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (open[open.length - 1] !== id || !closesOnKey(e)) return;
      e.preventDefault();
      close.current();
    };
    window.addEventListener("keydown", onKey);
    panel.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      open.splice(open.indexOf(id), 1);
      document.body.style.overflow = prevOverflow;
    };
  }, [id]);

  const sheet = (
    <div className={cn("fixed inset-x-0 top-0 flex items-end justify-center sm:items-center sm:p-4", layer)} style={{ bottom: inset }}>
      <div className="absolute inset-0 animate-[vt-fade_180ms_ease-out_both] bg-ink/40 backdrop-blur-[2px]" onClick={() => onClose()} />
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-white shadow-2xl outline-none sm:max-w-2xl sm:rounded-3xl",
          full ? "h-full sm:h-auto sm:max-h-[min(94dvh,100%)]" : "max-h-[min(94dvh,100%)] rounded-t-3xl",
        )}
      >
        <div className={cn("flex shrink-0 items-center gap-1 border-b border-line/70 py-1.5 pr-1.5 pl-4", onBack && "pl-1.5", full && "pt-[max(0.375rem,env(safe-area-inset-top))] sm:pt-1.5")}>
          {onBack ? (
            <button type="button" onClick={onBack} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink" aria-label={backLabel}>
              <ChevronLeft className="size-5" />
            </button>
          ) : null}
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold sm:text-lg">{title}</h2>
          <button type="button" onClick={() => onClose()} className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-cream hover:text-ink" aria-label={closeLabel}>
            <X className="size-5" />
          </button>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"
          onFocusCapture={(e) => {
            const el = e.target;
            if (el instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(el.tagName) && (el as HTMLInputElement).type !== "range") setTimeout(() => el.scrollIntoView({ block: "center" }), 250);
          }}
        >
          {children}
        </div>
        {footer ? <div className={cn("shrink-0 border-t border-line/70 px-4 pt-3 sm:px-5", inset ? "pb-3" : "pb-[max(0.75rem,env(safe-area-inset-bottom))]")}>{footer}</div> : null}
      </div>
    </div>
  );
  return typeof document === "undefined" ? sheet : createPortal(sheet, document.body);
}
