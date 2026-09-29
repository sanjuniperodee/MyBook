"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, ViewTransition } from "react";
import { BookOpen, Camera, Eye, LayoutGrid, Mail, Palette, PenLine, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "", label: "Обзор", icon: LayoutGrid },
  { href: "/questions", label: "Текст", icon: PenLine },
  { href: "/cover", label: "Обложка", icon: Palette },
  { href: "/photos", label: "Фото", icon: Camera },
  { href: "/letters", label: "Письма", icon: Mail },
  { href: "/settings", label: "Оформление", icon: SlidersHorizontal },
  { href: "/preview", label: "Макет", icon: Eye },
];

/** Полоска под активной вкладкой — при переходе «переезжает» на новую вкладку. */
function Indicator() {
  return (
    <ViewTransition name="book-tab-indicator" share="indicator" default="none">
      <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-wine" />
    </ViewTransition>
  );
}

export function BookTabs({ bookId }: { bookId: string }) {
  const pathname = usePathname();
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
        aria-label="Разделы книги"
        style={{
          maskImage: `linear-gradient(90deg, ${edges.left ? "transparent" : "#000"} 0, #000 28px, #000 calc(100% - 28px), ${edges.right ? "transparent" : "#000"} 100%)`,
        }}
      >
        {tabs.map((t) => {
          const href = base + t.href;
          const active = !checkout && (t.href ? pathname.startsWith(href) : pathname === base);
          return (
            <Link
              key={t.label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium transition-colors", active ? "text-ink" : "text-muted hover:text-ink")}
            >
              <t.icon className={cn("size-4 transition-colors", active && "text-wine")} strokeWidth={1.8} />
              {t.label}
              {active ? <Indicator /> : null}
            </Link>
          );
        })}
        {checkout ? (
          <span aria-current="page" className="relative flex shrink-0 items-center gap-2 px-3 py-3 text-sm font-medium">
            <BookOpen className="size-4 text-wine" /> Заказ
            <Indicator />
          </span>
        ) : null}
      </nav>
    </div>
  );
}
