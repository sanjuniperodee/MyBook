import { BANK_TEXT_STEP, BLANK_TEXT_WORDS, progressOf, type BookKind } from "@/lib/content/kinds";

/**
 * Путь книги: вопросы → фото → страницы → обложка → макет → заказ. Одна модель на ленту разделов в шапке книги и на
 * обзор (штаб): состояние каждого шага считается здесь, а подписи и ссылки — в разметке.
 */
export type StepKey = "questions" | "photos" | "pages" | "cover" | "preview" | "order";

/** done — шаг выполнен; partial — начат (fraction — доля пути до отметки «готово»); todo — не начат; attention — нужно поправить. */
export type StepStatus = "done" | "partial" | "todo" | "attention";

export interface NavInput {
  kind: BookKind;
  /** Вопросов или разделов с текстом / всего / слов. */
  answered: number;
  total: number;
  words: number;
  photos: number;
  letters: { approved: number; pending: number };
  /** Для обложки нет блокирующих замечаний готовности (фото на месте, слои не пустые). */
  coverReady: boolean;
  /** Книга передана в работу: статус не «черновик» — править уже нельзя. */
  ordered: boolean;
  /** Последний заказ книги оплачен (оплачен, в печати, отправлен, доставлен). */
  paid: boolean;
  order: { id: string; number: number; status: string; plan: string } | null;
}

export interface NavStep {
  key: StepKey;
  status: StepStatus;
  /** Доля пути внутри шага, 0…1: кольцо на узле ленты. */
  fraction: number;
}

export interface BookNav extends NavInput {
  steps: NavStep[];
  /** Шаг «Текст» выполнен (progressOf — те же пороги, что в готовности к заказу и CRM). */
  textDone: boolean;
  /** Книгу можно заказывать: текст есть, с обложкой всё в порядке, ещё не заказана. */
  ready: boolean;
  /** Что делать дальше; null — делать нечего (оплаченный заказ). */
  current: StepKey | null;
}

/** Состояние шагов пути по данным книги. Чистая функция — её проверяют тесты. */
export function bookNav(i: NavInput): BookNav {
  const textDone = progressOf(i.kind, i).textStepDone;
  const blank = i.kind === "blank";
  const textStarted = blank ? i.words > 0 : i.answered > 0;
  const textFraction = textDone ? 1 : Math.min(1, blank ? i.words / BLANK_TEXT_WORDS : i.answered / BANK_TEXT_STEP);
  const ready = !i.ordered && textDone && i.coverReady;
  const steps: NavStep[] = [
    { key: "questions", status: textDone ? "done" : textStarted ? "partial" : "todo", fraction: textFraction },
    { key: "photos", status: i.photos > 0 ? "done" : "todo", fraction: i.photos > 0 ? 1 : 0 },
    // Оформление страниц выбрано с самого начала (стиль по умолчанию): шаг «готов», его можно сменить.
    { key: "pages", status: "done", fraction: 1 },
    { key: "cover", status: i.coverReady ? "done" : "attention", fraction: i.coverReady ? 1 : 0 },
    { key: "preview", status: i.ordered ? "done" : "todo", fraction: i.ordered ? 1 : 0 },
    { key: "order", status: i.paid ? "done" : i.ordered ? "partial" : "todo", fraction: i.paid ? 1 : i.ordered ? 0.5 : 0 },
  ];
  const current: StepKey | null = i.ordered ? (i.paid ? null : "order") : !textDone ? "questions" : !i.coverReady ? "cover" : "order";
  return { ...i, steps, textDone, ready, current };
}

/** Адрес раздела шага: заказ — оформление или, если книга уже заказана, страница заказа. */
export function stepHref(bookId: string, key: StepKey, nav: Pick<BookNav, "order" | "ordered">): string {
  const base = `/books/${bookId}`;
  switch (key) {
    case "questions":
      return `${base}/questions`;
    case "photos":
      return `${base}/photos`;
    case "pages":
      return `${base}/pages`;
    case "cover":
      return `${base}/cover`;
    case "preview":
      return `${base}/preview`;
    case "order":
      return nav.ordered && nav.order ? `/orders/${nav.order.id}` : `${base}/checkout`;
  }
}
