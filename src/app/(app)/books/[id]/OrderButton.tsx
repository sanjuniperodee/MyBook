"use client";

import { Link, useMessages } from "@/i18n/client";
import { usePathname } from "next/navigation";

/** Кнопка заказа в шапке книги; на самой странице оформления не нужна. */
export function OrderButton({ bookId }: { bookId: string }) {
  const pathname = usePathname();
  const t = useMessages().books.layout;
  if (pathname.endsWith("/checkout")) return null;
  return (
    <Link href={`/books/${bookId}/checkout`} className="btn btn-primary btn-sm shrink-0">
      {t.orderBook}<span className="hidden sm:inline">{t.orderBookTail}</span>
    </Link>
  );
}
