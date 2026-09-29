"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Кнопка заказа в шапке книги; на самой странице оформления не нужна. */
export function OrderButton({ bookId }: { bookId: string }) {
  const pathname = usePathname();
  if (pathname.endsWith("/checkout")) return null;
  return (
    <Link href={`/books/${bookId}/checkout`} className="btn btn-primary btn-sm shrink-0">
      Заказать<span className="hidden sm:inline"> книгу</span>
    </Link>
  );
}
