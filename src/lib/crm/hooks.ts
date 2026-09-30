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

export async function onBookStarted(userId: string, book: { id: string; recipientName: string; title: string }) {
  const { advanceByMilestone } = await import("./deals");
  await advanceByMilestone(userId, "book_started", { title: `Книга${book.recipientName ? ` для: ${book.recipientName}` : book.title ? ` «${book.title}»` : ""}` });
}

export async function onAnswerSaved(bookId: string, userId: string) {
  const { onBookProgress } = await import("./deals");
  await onBookProgress(bookId, userId);
}
