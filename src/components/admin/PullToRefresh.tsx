"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { scrollTop } from "./scroller";

const THRESHOLD = 70;

/**
 * «Потяни, чтобы обновить» для установленной CRM: в режиме приложения у браузера своего жеста нет. Работает только на
 * сенсорных экранах, когда страница прокручена к самому верху; обновляет данные страницы (router.refresh), без перезагрузки.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<number | null>(null);

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const atTop = () => scrollTop() <= 0;
    const onStart = (e: TouchEvent) => {
      // Внутри прокручиваемых блоков (лента чата, доска) жест не наш.
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-no-ptr], textarea, input, select, [role=dialog], [data-chat-root]")) return;
      start.current = atTop() ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null || busy) return;
      const dy = e.touches[0].clientY - start.current;
      if (dy <= 0 || !atTop()) return setPull(0);
      setPull(Math.min(dy * 0.5, 110));
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      if (pull >= THRESHOLD / 1.4) {
        setBusy(true);
        setPull(THRESHOLD / 1.4);
        router.refresh();
        window.setTimeout(() => {
          setBusy(false);
          setPull(0);
        }, 900);
      } else setPull(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [pull, busy, router]);

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-[var(--topbar-h,3.5rem)] z-20 flex justify-center transition-opacity lg:hidden" style={{ opacity: pull > 8 || busy ? 1 : 0, transform: `translateY(${Math.max(0, pull - 28)}px)` }} aria-hidden>
        <span className="flex size-9 items-center justify-center rounded-full border border-line bg-white shadow-lg">
          <LoaderCircle className={busy ? "size-5 animate-spin text-wine" : "size-5 text-muted"} style={busy ? undefined : { transform: `rotate(${pull * 4}deg)` }} />
        </span>
      </div>
      {children}
    </>
  );
}
