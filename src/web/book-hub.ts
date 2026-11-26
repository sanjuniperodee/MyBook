import "server-only";
import type { Messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { sectionHref as sectionLink } from "@/lib/book/hub-model";
import type { StepStatus } from "@/lib/book/book-nav";
import type { getAccessibleBook } from "@/web/books";
import { buildHubDeadline } from "@/web/dto";
import { v1WebRead } from "./api";

type Book = Awaited<ReturnType<typeof getAccessibleBook>>;

export interface HubStepRow {
  key: string;
  href: string;
  title: string;
  value: string;
  action: string;
  bar?: number;
  status: StepStatus;
  fraction: number;
  active: boolean;
}

/** Карточка «Следующий шаг»: пока пишем — вопрос; потом обложка; потом заказ; после заказа — состояние заказа. */
export interface HubCard {
  eyebrow: string;
  title: string;
  text?: string;
  serif?: boolean;
  lang?: string;
  primary: { href: string; label: string; icon?: boolean };
  secondary?: { href: string; label: string };
  more?: { href: string; label: string; text: string };
}

/** Отсчёт до праздника (как DeadlineBanner): дни, заголовок, строка срока; null у книги без даты или после праздника. */
export interface HubDeadline {
  days: number;
  daysShort: string;
  tone: "calm" | "warm" | "hot";
  headline: string;
  line: string;
  /** Значок строки: clock — обычный срок, zap — срочная печать, null — электронная книга. */
  icon: "clock" | "zap" | null;
  changeLabel: string;
}

/**
 * Штаб книги — одна модель для страницы /books/[id] и приложения (API v1 cabinetBook): шаги пути, карточка следующего
 * шага, замечания к готовности, главы, письма, срок к празднику. Подписи — на языке интерфейса, главы — на языке книги.
 */
export async function bookHub(book: Book, locale: Locale, _m: Messages) {
  const dto = await v1WebRead({
    name: "book.hub",
    section: "book",
    locale,
    viaApi: (api) => api.webBookHub({ bookId: book.id, locale }),
  });
  return {
    ...dto,
    sectionHref: (sid: string | null) => sectionLink(book.id, sid),
  };
}

/** Срок к празднику для обзора книги — те же строки, что DeadlineBanner. */
export function hubDeadline(occasion: string | null, occasionDate: string | null, answered: number, m: Messages): HubDeadline | null {
  return buildHubDeadline(occasion, occasionDate, answered, m);
}
