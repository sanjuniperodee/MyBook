"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Карточка настройки со сворачиванием. Закрытая показывает только заголовок и состояние («подключён», «выключен»), поэтому
 * страницу с пятью формами видно целиком, а нужную раскрывают кликом. Содержимое остаётся в разметке — набранное в
 * свёрнутой форме не теряется. Ссылка с #id раскрывает и показывает нужную карточку.
 */
export function Section({ title, badge, children, id, defaultOpen = true }: { title: string; badge?: React.ReactNode; children: React.ReactNode; id?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (id && window.location.hash === `#${id}`) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- хэш адреса известен только в браузере: раскрываем один раз при открытии страницы
      setOpen(true);
      ref.current?.scrollIntoView({ block: "start" });
    }
  }, [id]);
  const body = useId();
  return (
    <section id={id} ref={ref} className="scroll-mt-20 rounded-2xl border border-line bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={body} className="flex w-full items-center gap-3 rounded-2xl px-5 py-4 text-left">
        <h2 className="font-semibold">{title}</h2>
        {badge}
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      <div id={body} hidden={!open} className="border-t border-line px-5 pt-4 pb-5">
        {children}
      </div>
    </section>
  );
}
