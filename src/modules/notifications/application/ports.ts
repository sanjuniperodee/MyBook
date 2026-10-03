import type { Locale } from "@/i18n/config";
import type { DraftEmail, DraftProgress } from "../domain";

/** Получатель писем (клиент). */
export interface Recipient {
  id: string;
  email: string;
  name: string;
  locale: Locale;
  remindedAt: Date | null;
}

export interface DraftCandidate {
  recipient: Recipient;
  book: DraftProgress;
}

export interface OrderReminder {
  recipient: Recipient;
  orderId: string;
  number: number;
  amount: number;
  contactEmail: string;
}

/** Самая свежая незаказанная книга клиента — для ручного напоминания из CRM. */
export interface LatestDraft {
  bookId: string;
  title: string;
  answered: number;
  total: number;
  firstEmpty: number | null;
}

/** Кому и о чём можно написать (read-модель поверх книг и заказов). */
export interface LifecycleSource {
  /** Черновики клиентов, не отписавшихся от писем, созданные раньше createdBefore. */
  draftCandidates(createdBefore: Date): Promise<DraftCandidate[]>;
  /** Заказы, ждущие оплаты дольше суток. */
  unpaidOrders(createdBefore: Date): Promise<OrderReminder[]>;
  /** Пора попросить отзыв: печатная книга доставлена, электронная оплачена давно; отзыва ещё нет. */
  reviewDue(deliveredBefore: Date, digitalPaidBefore: Date): Promise<OrderReminder[]>;
  latestDraft(userId: string): Promise<LatestDraft | null>;
}

/** Журнал отправленных писем: каждое автописьмо уходит один раз. */
export interface EmailJournal {
  /** false — такое письмо уже было. */
  claim(userId: string, key: string): Promise<boolean>;
}

export interface RecipientRepository {
  find(userId: string): Promise<Recipient | null>;
  markReminded(userId: string, at: Date): Promise<void>;
  optOut(userId: string): Promise<void>;
}

/** Лента клиента в CRM: отметка, что ему ушло письмо. */
export interface ClientTimeline {
  emailSent(clientId: string, authorId: string | null, note: string): Promise<void>;
}

export interface ComposedEmail {
  to: string;
  subject: string;
  html: string;
  /** Запись в ленту клиента в CRM. */
  note: string;
}

/** Шаблоны писем: текст на языке клиента, ссылки, отписка. */
export interface EmailTemplates {
  draft(email: DraftEmail, c: DraftCandidate): ComposedEmail;
  unpaid(o: OrderReminder): ComposedEmail;
  review(o: OrderReminder): ComposedEmail;
  reminder(recipient: Recipient, book: LatestDraft): ComposedEmail;
}

/** Подпись ссылок отписки. */
export interface UnsubscribeLinks {
  verify(userId: string, token: string): boolean;
}
