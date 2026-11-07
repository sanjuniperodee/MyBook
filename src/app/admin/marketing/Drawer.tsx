"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Кнопка и боковая панель с формой (на телефоне — шторка снизу): форма «создать» не занимает место на странице, пока её
 * не позвали, а ведомость остаётся на виду. Нативный <dialog>: фокус и Esc работают сами, клик по затемнению закрывает.
 * Содержимое остаётся в разметке и в закрытой панели — набранное не теряется. Предложение в общий кит (Sheet).
 */
export function DrawerButton({
  label,
  icon,
  variant = "outline",
  title,
  description,
  children,
  testId,
  className,
  wide,
  lazy,
}: {
  label: string;
  icon?: React.ReactNode;
  variant?: "primary" | "dark" | "outline" | "ghost";
  title: string;
  description?: string;
  /** Функция получает «закрыть» — для кнопок «Сохранить» и «Отмена» внутри формы. */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  testId?: string;
  className?: string;
  /** Шире обычного (редактор правила автоматизации). */
  wide?: boolean;
  /** Содержимое существует, только пока панель открыта: при закрытии форма сбрасывается, а не копит правки. */
  lazy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opened, setOpened] = useState(false);
  // Открытие и закрытие — через состояние: «закрыть» из формы не трогает ссылку на dialog во время отрисовки.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (opened && !el.open) el.showModal();
    if (!opened && el.open) el.close();
  }, [opened]);
  const close = () => setOpened(false);
  const titleId = `drawer-${title.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <>
      <button type="button" className={cn("btn btn-sm", `btn-${variant}`, className)} onClick={() => setOpened(true)}
        data-testid={testId}
      >
        {icon}
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className={cn(
          "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-none border-l border-line bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40 sm:w-[30rem]",
          wide && "sm:w-[44rem]",
          "max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:h-auto max-sm:max-h-[92dvh] max-sm:rounded-t-[var(--r-sheet)] max-sm:border-t max-sm:border-l-0",
        )}
        onClick={(e) => e.target === e.currentTarget && setOpened(false)}
        onClose={() => setOpened(false)}
        onCancel={() => setOpened(false)}
      >
        <div className="flex max-h-[inherit] flex-col sm:h-dvh">
          <header className="flex items-start gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[15px] font-semibold">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
            </div>
            <button type="button" className="btn btn-ghost btn-icon btn-sm -mr-2" aria-label="Закрыть" onClick={close}>
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">{lazy && !opened ? null : typeof children === "function" ? children(close) : children}</div>
        </div>
      </dialog>
    </>
  );
}
