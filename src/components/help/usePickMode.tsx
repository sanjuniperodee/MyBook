"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Crosshair } from "lucide-react";
import { labelOf, pickTarget } from "./pick";

type Rect = { top: number; left: number; width: number; height: number; label: string };

/**
 * Режим «указать на экране»: пока он включён, нажатие на странице не срабатывает, а выбирает место для вопроса.
 * Слушатели в фазе перехвата на document — раньше React и dnd-kit: кнопка не нажмётся, фото не потащится, поле
 * не получит фокус. Прокрутка работает (касание без нажатия не выбирает). Мышь — подсветка под курсором; клавиатура —
 * Tab по элементам, Enter выбирает элемент в фокусе, Esc — отмена.
 */
export function usePickMode({ onPick, onCancel }: { onPick: (target: EventTarget | null) => boolean; onCancel: () => void }) {
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const hovered = useRef<Element | null>(null);
  const handlers = useRef({ onPick, onCancel });
  useEffect(() => {
    handlers.current = { onPick, onCancel };
  });

  const stop = useCallback(() => {
    setActive(false);
    setRect(null);
    hovered.current = null;
  }, []);

  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    html.classList.add("help-picking");
    const outline = (el: Element | null) => {
      hovered.current = el;
      if (!el) return setRect(null);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height, label: labelOf(el).slice(0, 60) });
    };
    const inWidget = (e: Event) => e.target instanceof Element && !!e.target.closest("[data-help-widget]");
    const block = (e: Event) => {
      if (inWidget(e)) return;
      e.stopPropagation();
      if (e instanceof MouseEvent && !(e instanceof PointerEvent && e.pointerType === "touch")) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (inWidget(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (handlers.current.onPick(e.target)) stop();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || inWidget(e)) return;
      const el = pickTarget(e.target);
      if (el !== hovered.current) outline(el);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        stop();
        handlers.current.onCancel();
      } else if ((e.key === "Enter" || e.key === " ") && document.activeElement && !inWidget(e)) {
        e.preventDefault();
        e.stopPropagation();
        if (handlers.current.onPick(document.activeElement)) stop();
      }
    };
    const focus = (e: FocusEvent) => !inWidget(e) && outline(pickTarget(e.target));
    const reflow = () => hovered.current && outline(hovered.current);
    const opts = { capture: true } as const;
    document.addEventListener("pointerdown", block, opts);
    document.addEventListener("mousedown", block, opts);
    document.addEventListener("mouseup", block, opts);
    document.addEventListener("click", click, opts);
    document.addEventListener("dblclick", block, opts);
    document.addEventListener("contextmenu", block, opts);
    document.addEventListener("pointermove", move, opts);
    document.addEventListener("keydown", key, opts);
    document.addEventListener("focusin", focus, opts);
    window.addEventListener("scroll", reflow, { capture: true, passive: true });
    return () => {
      html.classList.remove("help-picking");
      document.removeEventListener("pointerdown", block, opts);
      document.removeEventListener("mousedown", block, opts);
      document.removeEventListener("mouseup", block, opts);
      document.removeEventListener("click", click, opts);
      document.removeEventListener("dblclick", block, opts);
      document.removeEventListener("contextmenu", block, opts);
      document.removeEventListener("pointermove", move, opts);
      document.removeEventListener("keydown", key, opts);
      document.removeEventListener("focusin", focus, opts);
      window.removeEventListener("scroll", reflow, { capture: true });
    };
  }, [active, stop]);

  const start = useCallback(() => {
    // Фокус уходит с кнопки помощника: иначе первый же Enter «выбрал» бы её.
    (document.activeElement as HTMLElement | null)?.blur?.();
    setActive(true);
  }, []);

  const overlay = (title: string, keys: string, cancel: string, lift: number) =>
    createPortal(
      <div data-help-widget>
        {rect ? (
          <div
            aria-hidden
            className="pointer-events-none fixed z-[57] rounded-[var(--r-ctl)] bg-wine/10 ring-2 ring-wine ring-offset-2 ring-offset-white/80 transition-all duration-100"
            style={{ top: rect.top - 2, left: rect.left - 2, width: rect.width + 4, height: rect.height + 4 }}
          />
        ) : null}
        <div
          role="status"
          aria-live="assertive"
          className="fixed inset-x-3 z-[58] mx-auto flex max-w-md items-center gap-3 rounded-[var(--r-panel)] border border-line-strong bg-white px-3.5 py-2.5 text-ink shadow-lift motion-safe:animate-[sheet-up_200ms_ease-out]"
          style={{ bottom: `calc(${lift}px + max(0.75rem, env(safe-area-inset-bottom)))` }}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--r-ctl)] bg-rose text-wine">
            <Crosshair className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-tight font-medium">{title}</div>
            <div className="mt-0.5 truncate text-xs text-muted max-sm:hidden">{rect?.label || keys}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              stop();
              handlers.current.onCancel();
            }}
            className="btn btn-outline shrink-0"
          >
            {cancel}
          </button>
        </div>
      </div>,
      document.body,
    );

  return { active, start, stop, overlay };
}
