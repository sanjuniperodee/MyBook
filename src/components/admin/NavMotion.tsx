"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { scrollMax, scrollTo, scrollTop } from "./scroller";
import { navKind, rememberTab, sectionOf, saveScroll, savedScroll, type NavKind } from "./nav-memory";

const PHONE = "(max-width: 1023.98px)";

/**
 * Поведение приложения при переходах на телефоне, ничего не перехватывая:
 *  — по нажатию на ссылку CRM определяет направление (вглубь / назад / другая вкладка) и ставит его на <html data-nav>,
 *    а анимацию рисует CSS (globals.css, .crm-page): как в iOS — карточка въезжает справа, назад уезжает вправо, вкладки сменяются растворением;
 *  — запоминает, где стояли: прокрутку каждой страницы и последнюю страницу каждой вкладки — и возвращает при возврате.
 */
export function NavMotion() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = pathname + (search ? `?${search}` : "");
  const current = useRef(url);
  const pending = useRef<NavKind | null>(null);
  const prev = useRef<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const root = document.documentElement;
    const phone = () => window.matchMedia(PHONE).matches;
    const mark = (kind: NavKind | null) => {
      pending.current = kind;
      if (kind && phone()) root.dataset.nav = kind;
      else delete root.dataset.nav;
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin || !to.pathname.startsWith("/admin")) return;
      saveScroll(current.current, scrollTop());
      const kind = navKind(location.pathname, to.pathname);
      mark(kind);
      // «Назад» на уровень выше в том же разделе — туда, откуда пришли (список с фильтрами и позицией), а не на голый корень раздела.
      const from = prev.current;
      if (kind === "back" && from && sectionOf(from) === sectionOf(to.pathname) && new URL(from, location.origin).pathname === to.pathname) {
        e.preventDefault();
        router.push(from);
      }
    };
    // Жест «назад» на iPhone уже анимирует сам Safari — свою анимацию не добавляем, но позицию вернём.
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const onPop = () => mark(ios ? null : "back");
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPop);
    // Прокрутка: пишем под адресом, на котором стоим (current — обновляется после перехода).
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      // Пока идёт переход, прокрутку не пишем: Next сбрасывает её в 0 раньше, чем мы узнаём новый адрес.
      raf = requestAnimationFrame(() => pending.current === null && saveScroll(current.current, scrollTop()));
    };
    // Захват: событие прокрутки элемента (оболочки) не всплывает до окна.
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("scroll", onScroll, true);
      cancelAnimationFrame(raf);
    };
  }, [router]);

  useEffect(() => {
    const kind = pending.current;
    const first = current.current === url && kind === null;
    if (current.current !== url) prev.current = current.current;
    current.current = url;
    rememberTab(url);
    // Вглубь — всегда с начала; назад, вкладка и обновление — туда, где стояли.
    const target = kind === "forward" ? 0 : savedScroll(url);
    let frames = 0;
    let stop = false;
    const user = () => (stop = true);
    window.addEventListener("touchstart", user, { passive: true, once: true });
    window.addEventListener("wheel", user, { passive: true, once: true });
    const settle = () => {
      if (stop || frames++ > 40) return;
      // Содержимое ещё догружается (стриминг) — пробуем, пока страница не станет достаточно длинной.
      const max = scrollMax();
      if (target > 0 && max >= target - 1) scrollTo(target);
      else if (target === 0 && scrollTop() !== 0) scrollTo(0);
      if (target > 0 && Math.abs(scrollTop() - target) > 2) requestAnimationFrame(settle);
    };
    if (!first || target > 0) requestAnimationFrame(() => requestAnimationFrame(settle));
    // Направление нужно только на время перехода.
    const t = window.setTimeout(() => {
      delete document.documentElement.dataset.nav;
      pending.current = null;
    }, 700);
    return () => {
      stop = true;
      window.clearTimeout(t);
      window.removeEventListener("touchstart", user);
      window.removeEventListener("wheel", user);
    };
  }, [url]);

  return null;
}
