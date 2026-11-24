import "server-only";
import { container } from "@/server/container";
import { getTheme } from "@/lib/content/themes";
import { BLANK_READY_WORDS, bookKind } from "@/lib/content/kinds";
import { formatDate, nowMs } from "@/lib/dates";
import { deadlineFor, getOccasion } from "@/lib/occasions";
import { isPrintedPlan, lastOrderPerBook } from "@/modules/ordering/ui/status";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { OrderStatus } from "@/shared/domain/orders";


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
  order: { id: string; number: number; status: OrderStatus; printed: boolean } | null;
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

/** Сколько книг «в работе» ищут следующий раздел без ответа: у остальных «Продолжить писать» ведёт в начало редактора. */
const NEXT_SECTION_LOOKUP = 6;

/**
 * Полка «Мои книги» — одна модель для страницы кабинета и API v1 (приложение): книги в работе первыми, последний заказ
 * каждой, следующий раздел без ответа, прогресс, срок к празднику и подписи на языке пользователя.
 */
export async function shelfBooks(userId: string, locale: Locale, m: Messages): Promise<ShelfBook[]> {
  const [rows, orders] = await Promise.all([container().authoring.queries.userBooks(userId), container().ordering.queries.userOrders(userId)]);
  const t = m.books.list;
  const now = new Date(nowMs());

  // Книги в работе — первыми (свежие выше), заказанные — после: «Продолжить писать» относится к первой.
  const sorted = [...rows].sort((a, b) => Number(a.book.status !== "draft") - Number(b.book.status !== "draft"));
  // Заказ книги для полки: последний, но отменённый не заслоняет действующий (общее правило lastOrderPerBook).
  const lastOrder = lastOrderPerBook(orders);

  // Следующий раздел без ответа — как «Следующий вопрос» на странице книги; ищем только у начатых книг в работе.
  const nextSection = new Map<string, string>();
  await Promise.all(
    sorted
      .filter((r) => r.book.status === "draft" && r.answered > 0 && r.answered < r.total)
      .slice(0, NEXT_SECTION_LOOKUP)
      .map(async (r) => {
        const next = (await container().authoring.queries.questions(r.book.id)).find((q) => !q.answer.trim());
        if (next) nextSection.set(r.book.id, next.id);
      }),
  );

  return sorted.map((row) => {
    const { book, answered, total, words } = row;
    const blank = bookKind(book.theme) === "blank";
    const ordered = book.status !== "draft";
    const occasion = getOccasion(book.occasion);
    const dl = !ordered && occasion && book.occasionDate ? deadlineFor(book.occasionDate, now) : null;
    const last = lastOrder.get(book.id);
    const section = nextSection.get(book.id) ?? null;
    return {
      row,
      kind: getTheme(book.theme, locale).name,
      blank,
      // Своя книга измеряется не ответами на вопросы, а объёмом: полоса — путь к «почти готовой» книге.
      progress: blank ? Math.min(100, Math.round((words / BLANK_READY_WORDS) * 100)) : total ? Math.round((answered / total) * 100) : 0,
      order: last ? { id: last.id, number: last.number, status: last.status, printed: isPrintedPlan(last.plan) } : null,
      ordered,
      writeHref: section ? `/books/${book.id}/questions?s=${section}` : `/books/${book.id}/questions`,
      writeSection: section,
      deadline:
        dl && occasion && dl.state !== "past"
          ? {
              text: m.common.deadline.chip(m.common.occasions[occasion.id].label, dl.daysToTarget) + (dl.state === "relaxed" || dl.state === "soon" || dl.state === "urgent" ? m.common.deadline.chipOrderBy(dl.orderBy) : ""),
              tone: dl.state === "relaxed" ? "calm" : dl.state === "soon" ? "warm" : "hot",
            }
          : null,
      updated: t.updated(formatDate(book.updatedAt, false, locale)),
    };
  });
}
