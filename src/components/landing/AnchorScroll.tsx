"use client";

import { useEffect } from "react";

/**
 * Переход к якорю (#pricing, #faq…) на странице с отложенной отрисовкой секций (.below-fold).
 * Пока секции не нарисованы, их высота — оценка, и прокрутка промахивается. Поэтому перед переходом
 * дорисовываем всё разом (один раз, только когда человек действительно прыгает по странице) и уже
 * потом прокручиваем — плавно или сразу, как настроено в системе.
 */
export function AnchorScroll() {
  useEffect(() => {
    const go = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return false;
      document.documentElement.classList.add("cv-all");
      requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
      return true;
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
      // Ссылка ведёт на эту же страницу: перехватываем до Link, чтобы сначала дорисовать секции.
      if (!go(decodeURIComponent(url.hash.slice(1)))) return;
      e.preventDefault();
      history.pushState(history.state, "", url.hash);
    };
    document.addEventListener("click", onClick, true);
    // Пришли по ссылке с якорем (/#faq со страницы сертификата) — тот же путь.
    if (location.hash) go(decodeURIComponent(location.hash.slice(1)));
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
