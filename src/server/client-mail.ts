import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@/shared/infrastructure/db/schema";
import { rootDb } from "@/shared/infrastructure/database";
import { appLink, emailLayout } from "@/shared/infrastructure/mail";
import { formatPrice } from "@/config/site";
import { messagesFor } from "@/i18n/messages";
import type { Container } from "./container";

/**
 * Письмо клиенту о деньгах по договорённости с менеджером: платёж принят (сколько осталось) или оформлен возврат.
 * Клиенту без почты (адрес-заглушка) письмо не уходит — сообщение об этом менеджер передаёт сам. Ошибка почты не ломает приём платежа.
 */
export async function mailPaymentToClient(c: Container, input: { clientId: string | null; dealNumber: number; kind: "payment" | "refund"; amount: number; left: number }) {
  if (!input.clientId) return;
  try {
    const [u] = await rootDb.select({ email: users.email, locale: users.locale }).from(users).where(eq(users.id, input.clientId)).limit(1);
    if (!u) return;
    const m = messagesFor(u.locale).mail.payment;
    const amount = formatPrice(input.amount);
    if (input.kind === "refund") {
      await c.mailer.send(u.email, m.refund.subject(amount), emailLayout({ locale: u.locale, title: m.refund.title, paragraphs: [m.refund.text(amount, input.dealNumber)] }));
      return;
    }
    await c.mailer.send(
      u.email,
      m.received.subject(amount),
      emailLayout({
        locale: u.locale,
        title: m.received.title,
        paragraphs: [m.received.text(amount, input.dealNumber), input.left > 0 ? m.received.left(formatPrice(input.left)) : m.received.full, m.received.next],
        button: { label: m.received.button, url: appLink("/books", u.locale) },
      }),
    );
  } catch (err) {
    console.error("[mail] payment", err);
  }
}
