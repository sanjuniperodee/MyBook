"use client";

import { Link, useMessages } from "@/i18n/client";
import { usePathname } from "next/navigation";

/**
 * Кнопка заказа в шапке книги; на самой странице оформления не нужна. Пока книга не готова (нет текста или обложки),
 * она контурная: винная кнопка на экране одна — главное действие самой страницы («Ответить», «Добавить фото»).
 */
export function OrderButton({ bookId, ready }: { bookId: string; ready: boolean }) {
  const pathname = usePathname();
  const t = useMessages().books.layout;
  // На оформлении и в макете своя главная кнопка заказа — вторая в шапке не нужна.
  if (pathname.endsWith("/checkout") || pathname.endsWith("/preview")) return null;
  return (
    <Link href={`/books/${bookId}/checkout`} className={ready ? "btn btn-primary btn-sm shrink-0" : "btn btn-outline btn-sm shrink-0"}>
      {t.orderBook}<span className="hidden sm:inline">{t.orderBookTail}</span>
    </Link>
  );
}
