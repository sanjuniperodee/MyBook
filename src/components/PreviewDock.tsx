"use client";

import { useEffect, useState, type RefObject } from "react";

/** Высота липкой шапки кабинета на телефоне (h-14 + рамка). */
const HEADER = 57;

/** Истина, когда элемент прокручен выше верхнего края экрана (за шапку). */
export function useScrolledPast(ref: RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.bottom <= HEADER + 1), { rootMargin: `-${HEADER}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return past;
}

/**
 * Телефон: крупное превью осталось выше, а выбираем и правим ниже — под шапкой держим его уменьшенную копию,
 * чтобы результат каждого выбора был виден сразу. На компьютере превью и так закреплено сбоку.
 */
export function PreviewDock({ show, children }: { show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 z-30 border-b border-line/80 bg-paper/95 shadow-soft backdrop-blur-xl lg:hidden" style={{ top: HEADER }}>
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2 sm:px-6">{children}</div>
    </div>
  );
}
