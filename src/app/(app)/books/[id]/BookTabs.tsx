"use client";

import { Link, useLocalePathname, useMessages } from "@/i18n/client";
import { Fragment, useEffect, useRef, useState, ViewTransition } from "react";
import { BookOpen, BookOpenText, Camera, Eye, LayoutGrid, Mail, Palette, PenLine, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/class-names";

/**
 * Вкладки идут в порядке пути к книге и разбиты на группы: обзор · написать (текст, фото, письма) · оформить (обложка,
 * страницы, настройки) · проверить макет. Между группами на компьютере — тонкий разделитель.
 */
const tabs = [
  { href: "", key: "overview", icon: LayoutGrid, group: 0 },
  { href: "/questions", key: "text", icon: PenLine, group: 1 },
  { href: "/photos", key: "photos", icon: Camera, group: 1 },
  { href: "/letters", key: "letters", icon: Mail, group: 1 },
  { href: "/cover", key: "cover", icon: Palette, group: 2 },
  { href: "/pages", key: "pages", icon: BookOpenText, group: 2 },
  { href: "/settings", key: "settings", icon: SlidersHorizontal, group: 2 },
  { href: "/preview", key: "preview", icon: Eye, group: 3 },
] as const;

/** Полоска под активной вкладкой — при переходе «переезжает» на новую вкладку. */
function Indicator() {
  return (
    <ViewTransition name="book-tab-indicator" share="indicator" default="none">
      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-wine" />
    </ViewTransition>
  );
}

export function BookTabs({ bookId }: { bookId: string }) {
  // Путь без языкового префикса: /kk/books/… сравниваем как /books/…
  const pathname = useLocalePathname();
  const labels = useMessages().books.tabs;
  const base = `/books/${bookId}`;
  const nav = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  // Активная вкладка всегда видна на узком экране; тени по краям подсказывают, что ленту можно листать.
  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const update = () => setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    el.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    const raf = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [pathname]);

  const checkout = pathname.endsWith("/checkout");
  return (
    <div className="relative">
      <nav
        ref={nav}
        className="no-scrollbar -mx-1 -mb-px flex justify-between gap-0.5 overflow-x-auto sm:mx-0 sm:justify-start sm:gap-1"
        aria-label={labels.aria}
        style={{
          maskImage: `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 28px), ${edges.right ? "transparent" : "#000"} 100%)`,
        }}
      >
        {tabs.map((t, i) => {
          const href = base + t.href;
          const active = !checkout && (t.href ? pathname.startsWith(href) : pathname === base);
          const divider = i > 0 && tabs[i - 1].group !== t.group;
          return (
            <Fragment key={t.key}>
            {divider ? <span aria-hidden className="mx-1.5 my-auto h-4 w-px shrink-0 bg-line-strong max-sm:hidden" /> : null}
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              title={labels[t.key]}
              className={cn("relative flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 text-sm font-medium transition-colors sm:min-h-12 sm:px-3", active ? "text-ink" : "text-muted hover:text-ink")}
            >
              <t.icon className={cn("size-[18px] transition-colors sm:size-4", active && "text-wine")} strokeWidth={1.8} />
              {/* Телефон: восемь значков по 44 px умещаются в строку; подпись открытой — в заголовке страницы и в title. */}
              <span className="max-sm:sr-only">{labels[t.key]}</span>
              {active ? <Indicator /> : null}
            </Link>
            </Fragment>
          );
        })}
        {checkout ? (
          <span aria-current="page" className="relative flex min-h-11 shrink-0 items-center gap-2 px-2.5 text-sm font-medium sm:min-h-12 sm:px-3">
            <BookOpen className="size-4 text-wine" /> {labels.order}
            <Indicator />
          </span>
        ) : null}
      </nav>
    </div>
  );
}
