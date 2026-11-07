"use client";

import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/**
 * Одна большая кнопка внизу экрана телефона: «Начать» всегда под большим пальцем. Появляется, когда главная кнопка
 * первого экрана ушла вверх, и прячется, пока на экране есть другая главная кнопка страницы (элементы с
 * data-main-cta — цены, финальный кадр), чтобы на экране не было двух одинаковых призывов. Пока панель видна,
 * высота пишется в --cta-h: плавающий виджет связи стоит над ней.
 */
export function StickyStart({ href, label }: { href: string; label: string }) {
  const [show, setShow] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marks = Array.from(document.querySelectorAll("[data-main-cta]"));
    if (!marks.length) return;
    const state = new Map<Element, { visible: boolean; above: boolean }>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) state.set(e.target, { visible: e.isIntersecting, above: !e.isIntersecting && e.boundingClientRect.top < 0 });
      const first = state.get(marks[0]);
      const anyVisible = [...state.values()].some((v) => v.visible);
      // Показываем, когда первая главная кнопка (первый экран) осталась выше и никакая другая сейчас не на экране.
      setShow(!!first?.above && !anyVisible);
    });
    marks.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (show && bar.current) root.style.setProperty("--cta-h", `${bar.current.offsetHeight}px`);
    else root.style.removeProperty("--cta-h");
    return () => {
      root.style.removeProperty("--cta-h");
    };
  }, [show]);

  return (
    <div
      ref={bar}
      aria-hidden={!show}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-300 sm:hidden",
        show ? "translate-y-0" : "translate-y-full",
      )}
    >
      <Link href={href} tabIndex={show ? 0 : -1} className="btn btn-primary btn-lg w-full">
        {label}
      </Link>
    </div>
  );
}
