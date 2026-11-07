"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/**
 * Горизонтальная лента на всю ширину экрана: левый край выровнен по колонке страницы, дальше — прокрутка пальцем,
 * колёсиком или стрелками (стрелки только там, где есть мышь). Содержимое (обложки) рисует сервер и передаёт сюда.
 */
export function StripScroller({ children, className }: { children: ReactNode; className?: string }) {
  const actions = useMessages().common.actions;
  const el = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const n = el.current;
    if (!n) return;
    setEdge({ start: n.scrollLeft < 8, end: n.scrollLeft + n.clientWidth >= n.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const go = (dir: 1 | -1) => el.current?.scrollBy({ left: dir * el.current.clientWidth * 0.75, behavior: "smooth" });
  const btn = "size-12 items-center justify-center rounded-(--r-ctl) border border-line-strong bg-white text-ink transition-colors hover:border-ink/40 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className={className}>
      <ul
        ref={el}
        onScroll={measure}
        className="no-scrollbar flex snap-x items-end gap-4 overflow-x-auto scroll-smooth pt-2 pb-10 [padding-inline:max(1rem,calc((100%-72rem)/2+1.5rem))] [scroll-padding-inline:max(1rem,calc((100%-72rem)/2+1.5rem))] sm:gap-6"
      >
        {children}
      </ul>
      <div className="container-x -mt-2 hidden justify-end gap-2 md:flex">
        <button type="button" className={cn(btn, "flex")} onClick={() => go(-1)} disabled={edge.start} aria-label={actions.back}>
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" className={cn(btn, "flex")} onClick={() => go(1)} disabled={edge.end} aria-label={actions.next}>
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
