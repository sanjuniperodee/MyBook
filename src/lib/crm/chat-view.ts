import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { crmMessages, crmTemplates, orders, users, type CrmConversation } from "../db/schema";
import { env } from "../env";
import { adminLabel } from "../crm";
import { getSetting } from "./settings";
import { wazzupConfigured } from "./wazzup";
import type { ChatMessage } from "@/components/admin/ChatPanel";

/** Последние сообщения диалога в виде, готовом для ChatPanel. */
export async function loadChatMessages(conversationId: string, limit = 150): Promise<ChatMessage[]> {
  const rows = await db
    .select({ m: crmMessages, author: { name: users.name, email: users.email } })
    .from(crmMessages)
    .leftJoin(users, eq(users.id, crmMessages.authorId))
    .where(eq(crmMessages.conversationId, conversationId))
    .orderBy(desc(crmMessages.createdAt))
    .limit(limit);
  return rows.reverse().map(({ m, author }) => ({
    id: m.id,
    direction: m.direction,
    type: m.type,
    text: m.text,
    mediaUrl: m.mediaUrl,
    status: m.status,
    error: m.error,
    author: m.direction === "out" ? (author?.email ? adminLabel({ name: author.name ?? "", email: author.email }) : m.externalId && !m.authorId ? "с телефона" : "автоматически") : null,
    at: m.createdAt.toISOString(),
  }));
}

export async function listTemplates() {
  return db.select({ id: crmTemplates.id, title: crmTemplates.title, text: crmTemplates.text }).from(crmTemplates).orderBy(asc(crmTemplates.position), asc(crmTemplates.createdAt));
}

/** Переменные шаблонов для конкретного диалога. */
export async function chatVars(conv: Pick<CrmConversation, "contactName" | "clientId">, managerName: string) {
  const lastOrder = conv.clientId ? await db.query.orders.findFirst({ where: eq(orders.userId, conv.clientId), orderBy: desc(orders.createdAt), columns: { number: true } }) : null;
  return { name: conv.contactName.split(" ")[0] ?? "", order: lastOrder?.number ?? null, link: env.appUrl, manager: managerName };
}

/** Почему отправка сейчас не сработает (показываем над полем ввода). */
export async function sendBlocker(conv: Pick<CrmConversation, "channelId">) {
  if (!(await wazzupConfigured())) return "Wazzup не подключён — сообщения не уйдут клиенту. Подключите в разделе «Интеграции».";
  if (!conv.channelId && !(await getSetting("wazzup.channelId"))) return "Не выбран канал WhatsApp для отправки.";
  return null;
}
