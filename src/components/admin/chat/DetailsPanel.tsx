"use client";

import { useEffect, useState } from "react";
import { PanelRight, X } from "lucide-react";
import { cn } from "@/lib/class-names";

const EVENT = "chat:details";

/** Кнопка «Детали» в шапке переписки: на экранах без боковой колонки (до 1280 px) открывает её шторкой поверх чата. */
export function DetailsToggle() {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVENT))} className="btn btn-ghost btn-icon btn-sm shrink-0 max-lg:size-11 xl:hidden" aria-label="Детали: сделка, ответственный, счета" title="Сделка, ответственный, счета">
      <PanelRight className="size-[18px]" strokeWidth={1.8} />
    </button>
  );
}

/**
 * Боковая колонка чата (контакт, сделка, ответственный, счета): с 1280 px — третья колонка справа, уже — шторка справа по
 * кнопке «Детали» (на телефоне — на весь экран); закрывается крестиком, кликом мимо или Esc.
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
      {open ? <div className="fixed inset-0 z-40 bg-ink/30 xl:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}
      <aside
        aria-label="Детали диалога"
        className={cn(
          "shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-line bg-white",
          "xl:static xl:flex xl:w-[300px] xl:shadow-none 2xl:w-[340px]",
          open ? "fixed inset-y-0 right-0 z-50 flex w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-lift sm:w-[360px]" : "hidden",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line pr-2 pl-4 sm:pl-5 xl:hidden">
          <span className="text-[15px] font-semibold">Детали</span>
          <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost btn-icon btn-sm max-lg:size-11" aria-label="Закрыть детали">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
