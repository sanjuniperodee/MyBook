"use client";

import { ChevronLeft } from "lucide-react";
import { Link, useLocalePathname } from "@/i18n/client";

/**
 * Шапка книги: липкая полоса 56 px сверху — на месте шапки кабинета, которая в книге не показывается. Под вырезом экрана —
 * отступ safe-area, как у шапки кабинета: от этой высоты отсчитывают липкие панели редакторов (`--ed-top`, `top-[57px]`).
 */
export function BookTitleRow({ children }: { children: React.ReactNode }) {
  return <header className="sticky top-0 z-40 border-b border-line bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl">{children}</header>;
}

/**
 * Стрелка «назад» на телефоне: при письме (там нет ленты шагов) — в обзор книги, откуда один тап до любого шага;
 * в остальных разделах — на полку «Мои книги».
 */
export function BookBack({ bookId, shelfLabel, bookLabel }: { bookId: string; shelfLabel: string; bookLabel: string }) {
  const writing = useLocalePathname().endsWith("/questions");
  return (
    <Link href={writing ? `/books/${bookId}` : "/books"} aria-label={writing ? bookLabel : shelfLabel} className="-ml-2.5 flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted hover:bg-ink/5 hover:text-ink sm:hidden">
      <ChevronLeft className="size-5" aria-hidden />
    </Link>
  );
}
