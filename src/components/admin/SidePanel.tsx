"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Боковая панель (на ноутбуке — справа, на телефоне — шторка снизу): приглашение и правка записи, не уводя со списка.
 * Основана на <dialog>: фокус остаётся внутри, Esc закрывает, фон затемнён. Содержимое остаётся в разметке закрытым.
 */
export function SidePanel({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[var(--r-sheet)] border border-line bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40 lg:inset-y-0 lg:right-0 lg:left-auto lg:h-dvh lg:max-h-none lg:w-[26rem] lg:rounded-none lg:rounded-l-[var(--r-sheet)]"
    >
      <div className="flex max-h-[92dvh] flex-col lg:h-dvh lg:max-h-none">
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          <button type="button" className="btn btn-ghost btn-icon btn-sm shrink-0" onClick={onClose} aria-label="Закрыть">
            <X className="size-4" strokeWidth={1.8} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{open ? children : null}</div>
      </div>
    </dialog>
  );
}
