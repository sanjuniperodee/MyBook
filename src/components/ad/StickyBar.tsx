"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/class-names";
import { track } from "@/lib/analytics-client";
import { WhatsAppIcon } from "./WhatsAppIcon";

/**
 * Панель внизу экрана на телефоне: цена и WhatsApp всегда под большим пальцем. Появляется, когда первый экран
 * со своей кнопкой ушёл наверх, и прячется у финального призыва, чтобы не дублировать его.
 */
export function StickyBar({ href, price, cta }: { href: string; price: string; cta: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const end = document.getElementById("final");
    if (!hero || !end) return;
    let pastHero = false;
    let atEnd = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
        if (e.target === end) atEnd = e.isIntersecting;
      }
      setShow(pastHero && !atEnd);
    });
    io.observe(hero);
    io.observe(end);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#2a0d12]/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-paper backdrop-blur-md transition-transform duration-300 md:hidden",
        show ? "translate-y-0" : "translate-y-full",
      )}
      aria-hidden={!show}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="font-serif text-[19px] leading-tight">{price}</div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={show ? 0 : -1}
          onClick={() => track("contact", undefined, { place: "sticky" })}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#25d366] px-5 text-[15px] font-semibold text-[#0b2e17] active:scale-[0.97]"
        >
          <WhatsAppIcon className="size-5" /> {cta}
        </a>
      </div>
    </div>
  );
}
