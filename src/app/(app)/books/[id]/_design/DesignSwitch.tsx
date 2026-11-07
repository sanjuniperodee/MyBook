"use client";

import { Link, useLocalePathname, useMessages } from "@/i18n/client";
import { cn } from "@/lib/class-names";

/**
 * Шаг «Оформить» — одно место из двух половин: заголовок страницы и есть переключатель «Обложка · Страницы».
 * Открытая половина — тушью, вторая — приглушённой ссылкой; на телефоне так же, крупным шрифтом книги.
 */
export function DesignSwitch({ bookId }: { bookId: string }) {
  const pathname = useLocalePathname();
  const t = useMessages().bookStudio.nav.designSwitch;
  const base = `/books/${bookId}`;
  const items = [
    { href: `${base}/cover`, label: t.cover },
    { href: `${base}/pages`, label: t.pages },
  ];
  return (
    <nav aria-label={t.aria} className="flex items-baseline gap-4 sm:gap-5">
      {items.map((it) => {
        const active = pathname.startsWith(it.href);
        return active ? (
          <h1 key={it.href} aria-current="page" className="font-serif text-[26px] leading-none font-medium text-ink sm:text-[32px]">
            {it.label}
          </h1>
        ) : (
          <Link key={it.href} href={it.href} className={cn("font-serif text-[26px] leading-none font-medium text-muted/70 transition-colors hover:text-ink sm:text-[32px]")}>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
