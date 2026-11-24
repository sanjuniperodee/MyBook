/**
 * Кабинет автора для приложения «MyBooks»: модели экранов из тех же функций, что рисуют страницы сайта, — подписи на
 * языке пользователя, адреса картинок обложек с версией.
 */
import { messagesFor } from "@/i18n/messages";
import { orderStatusLabel, orderStatusTone } from "@/modules/ordering/ui/status";
import { coverImagePath } from "@/server/cover-image";
import { shelfBooks } from "@/server/shelf";
import type { Handlers } from "../app";

export const cabinetHandlers: Pick<Handlers, "cabinetShelf"> = {
  async cabinetShelf({ user }) {
    const locale = user!.locale === "kk" ? "kk" : "ru";
    const m = messagesFor(locale);
    const t = m.books.list;
    const books = await shelfBooks(user!.id, locale, m);
    return {
      books: books.map((b) => {
        const { book, answered, total, words, photos } = b.row;
        return {
          id: book.id,
          title: book.title,
          subtitle: book.subtitle,
          kind: b.kind,
          blank: b.blank,
          ordered: b.ordered,
          progress: b.progress,
          progressLabel: b.blank ? t.blankProgress(total, words) : t.ofQuestions(answered, total),
          counts: `${b.blank ? "" : `${m.common.count.words(words)} · `}${m.common.count.photos(photos)}`,
          updated: b.updated,
          deadline: b.deadline,
          order: b.order ? { id: b.order.id, number: b.order.number, label: m.orders.list.number(b.order.number), status: b.order.status, statusLabel: orderStatusLabel(b.order.status, locale, b.order.printed), tone: orderStatusTone[b.order.status] } : null,
          started: answered > 0 || words > 0,
          writeSectionId: b.writeSection,
          coverUrl: coverImagePath(book, 480),
          coverThumbUrl: coverImagePath(book, 240),
        };
      }),
    };
  },
};
