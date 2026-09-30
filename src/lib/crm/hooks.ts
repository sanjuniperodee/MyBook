import "server-only";
import { after } from "next/server";

/**
 * Реакции CRM на действия клиента на сайте выполняются после ответа: клиент не ждёт CRM,
 * а ошибка CRM не ломает регистрацию, книгу или заказ.
 */
export function crmAfter(task: () => Promise<unknown>) {
  const job = () => task().catch((err) => console.error("[crm] hook failed", err));
  try {
    after(job);
  } catch {
    void job(); // вне HTTP-запроса (скрипты)
  }
}

export async function onClientRegistered(userId: string) {
  const { advanceByMilestone } = await import("./deals");
  await advanceByMilestone(userId, "registered");
}

export async function onBookStarted(userId: string, book: { id: string; recipientName: string; title: string; occasion?: string | null; occasionDate?: string | null }) {
  const { advanceByMilestone, fillEmptyFields } = await import("./deals");
  const { messagesFor } = await import("@/i18n/messages");
  // Повод, дата и адресат из книги сразу попадают в поля сделки.
  const occasion = book.occasion ? (messagesFor("ru").common.occasions as Record<string, { label: string }>)[book.occasion]?.label : undefined;
  const fields = { ...(occasion ? { occasion } : {}), ...(book.occasionDate ? { event_date: book.occasionDate } : {}), ...(book.recipientName ? { recipient: book.recipientName } : {}) };
  const deal = await advanceByMilestone(userId, "book_started", { title: `Книга${book.recipientName ? ` для: ${book.recipientName}` : book.title ? ` «${book.title}»` : ""}`, customFields: fields });
  if (deal) await fillEmptyFields(deal.id, fields);
}

export async function onAnswerSaved(bookId: string, userId: string) {
  const { onBookProgress } = await import("./deals");
  await onBookProgress(bookId, userId);
}
