"use client";

import { useEffect, useState } from "react";
import { PanelRight, X } from "lucide-react";
import { cn } from "@/lib/class-names";

const EVENT = "chat:details";

/** Кнопка «Детали» в шапке переписки: на экранах без боковой колонки открывает её поверх чата. */
export function DetailsToggle() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVENT))} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[#f3efe9] hover:text-ink 2xl:hidden" aria-label="Детали: сделка, ответственный, счета" title="Сделка, ответственный, счета">
      <PanelRight className="size-5" />
    </button>
  );
}

/**
 * Боковая колонка чата (контакт, сделка, счета, управление): на широком экране — всегда справа, на остальных —
 * выезжает поверх по кнопке «Детали»; закрывается крестиком, кликом мимо или Esc.
 */
export function DetailsPanel({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(EVENT, toggle);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener(EVENT, toggle);
      window.removeEventListener("keydown", esc);
    };
  }, []);
  return (
    <>
      {open ? <div className="fixed inset-0 z-40 bg-black/25 2xl:hidden" onClick={() => setOpen(false)} /> : null}
      <aside
        className={cn(
          "w-[340px] shrink-0 space-y-5 overflow-y-auto border-l border-line bg-[#faf8f5] p-4",
          "2xl:static 2xl:block 2xl:w-[320px] 2xl:shadow-none",
          open ? "fixed inset-y-0 right-0 z-50 block shadow-2xl" : "hidden",
        )}
      >
        <button type="button" onClick={() => setOpen(false)} className="ml-auto flex size-8 items-center justify-center rounded-full text-muted hover:bg-white 2xl:hidden" aria-label="Закрыть">
          <X className="size-5" />
        </button>
        {children}
      </aside>
    </>
  );
}
