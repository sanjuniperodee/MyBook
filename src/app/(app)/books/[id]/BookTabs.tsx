"use client";

import { Link, useLocalePathname, useMessages } from "@/i18n/client";
import { useEffect, useRef, useState, ViewTransition } from "react";
import { BookOpen, BookOpenText, Camera, Eye, LayoutGrid, Mail, Palette, PenLine, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "", key: "overview", icon: LayoutGrid },
  { href: "/questions", key: "text", icon: PenLine },
  { href: "/cover", key: "cover", icon: Palette },
  { href: "/pages", key: "pages", icon: BookOpenText },
  { href: "/photos", key: "photos", icon: Camera },
  { href: "/letters", key: "letters", icon: Mail },
  { href: "/settings", key: "settings", icon: SlidersHorizontal },
  { href: "/preview", key: "preview", icon: Eye },
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
        className="no-scrollbar -mb-px flex gap-1 overflow-x-auto"
        aria-label={labels.aria}
        style={{
          maskImage: `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 28px), ${edges.right ? "transparent" : "#000"} 100%)`,
        }}
      >
        {tabs.map((t) => {
          const href = base + t.href;
          const active = !checkout && (t.href ? pathname.startsWith(href) : pathname === base);
          return (
            <Link
              key={t.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors", active ? "text-ink" : "text-muted hover:text-ink")}
            >
              <t.icon className={cn("size-4 transition-colors", active && "text-wine")} strokeWidth={1.8} />
              {labels[t.key]}
              {active ? <Indicator /> : null}
            </Link>
          );
        })}
        {checkout ? (
          <span aria-current="page" className="relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium">
            <BookOpen className="size-4 text-wine" /> {labels.order}
            <Indicator />
          </span>
        ) : null}
      </nav>
    </div>
  );
}
