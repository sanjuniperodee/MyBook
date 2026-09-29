"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function BookTabs({ bookId }: { bookId: string }) {
  const pathname = usePathname();
  const base = `/books/${bookId}`;
  return (
    <nav className="no-scrollbar -mb-px flex gap-1 overflow-x-auto" aria-label="Разделы книги">
      {tabs.map((t) => {
        const href = base + t.href;
        const active = t.href ? pathname.startsWith(href) : pathname === base;
        return (
          <Link
            key={t.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition",
              active ? "border-wine text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            <t.icon className="size-4" strokeWidth={1.8} />
            {t.label}
          </Link>
        );
      })}
      {pathname.endsWith("/checkout") ? (
        <span className="flex shrink-0 items-center gap-2 border-b-2 border-wine px-3 py-3 text-sm font-medium">
          <BookOpen className="size-4" /> Заказ
        </span>
      ) : null}
    </nav>
  );
}
