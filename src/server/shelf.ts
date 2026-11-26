import "server-only";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { OrderStatus } from "@/shared/domain/orders";
import type { OrderStatusTone } from "@/modules/ordering/ui/status";
import { localShelfBooks } from "./v1-local-bridge";
import { v1WebRead } from "./v1-web-client";

/** Всё, что нужно показать о книге на полке. Считает страница: карточке остаётся только разметка. */
export interface ShelfBook {
  /** Строка из userBooks: книга и её цифры. */
  row: {
    book: {
      id: string;
      title: string;
      subtitle: string;
      theme: string;
      format: string;
      coverTemplate: string;
      coverLines?: boolean;
      coverPhotoId: string | null;
      coverPhotoExtra?: string[] | null;
      coverDesign: unknown;
      authorName: string;
      recipientName: string;
      hideRecipientOnCover: boolean;
      namesOnCover: string;
    };
    answered: number;
    total: number;
    words: number;
    photos: number;
  };
  /** Название темы («Любимому человеку»). */
  kind: string;
  /** Своя книга: прогресс по словам и разделам, а не по ответам на вопросы. */
  blank: boolean;
  /** Готовность, 0–100. */
  progress: number;
  /** Последний заказ книги — у заказанной. */
  order: { id: string; number: number; status: OrderStatus; printed: boolean; statusLabel: string; statusTone: OrderStatusTone } | null;
  /** Заказана: правка закрыта, главное действие — следить за заказом. */
  ordered: boolean;
  /** Куда ведёт «Продолжить писать»: следующий раздел без ответа или начало редактора. */
  writeHref: string;
  /** Следующий раздел без ответа (id) — для приложения; null — начало редактора. */
  writeSection: string | null;
  /** Срок к празднику: уже собранная строка и тон. */
  deadline: { text: string; tone: "calm" | "warm" | "hot" } | null;
  /** Строка «Изменена …». */
  updated: string;
}

/**
 * Полка «Мои книги» — одна модель для страницы кабинета и API v1 (приложение): книги в работе первыми, последний заказ
 * каждой, следующий раздел без ответа, прогресс, срок к празднику и подписи на языке пользователя.
 */
export async function shelfBooks(userId: string, locale: Locale, m: Messages): Promise<ShelfBook[]> {
  return v1WebRead({
    name: "cabinet.shelf",
    section: "cabinet",
    locale,
    local: () => localShelfBooks(userId, locale, m),
    viaApi: async (api) => (await api.webShelf({ locale })).books,
  });
}
