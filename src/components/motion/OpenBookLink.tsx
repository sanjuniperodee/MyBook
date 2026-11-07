"use client";

import { useRef } from "react";
import { Link, useLocaleRouter } from "@/i18n/client";

/** Сколько длится «открытие» на месте, прежде чем начнётся переход: поворот к читателю и распахнутая обложка. */
const OPEN_MS = 620;

/**
 * Ссылка «в книгу писать» (Продолжить писать, Ответить): сначала книга открывается на месте — обложка Book3D с тем же
 * bookId распахивается вокруг корешка, под ней первая страница, — потом переход, и страница «перетекает» в лист редактора.
 * Без объёмной книги на экране, при «уменьшении движения» и с клавишами-модификаторами (новая вкладка) — обычная ссылка.
 */
export function OpenBookLink({ bookId, href, className, children }: { bookId: string; href: string; className?: string; children: React.ReactNode }) {
  const router = useLocaleRouter();
  const busy = useRef(false);
  return (
    <Link
      href={href}
      prefetch
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const book = document.querySelector<HTMLElement>(`[data-book-3d="${bookId}"]`);
        const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!book || still || !book.getBoundingClientRect().height) return;
        e.preventDefault();
        if (busy.current) return;
        busy.current = true;
        book.classList.add("is-opening");
        window.setTimeout(() => router.push(href), OPEN_MS);
      }}
    >
      {children}
    </Link>
  );
}
