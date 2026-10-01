import "server-only";
import { fieldVars, listFields } from "./fields";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { crmDeals, crmMessages, crmTemplates, orders, users, type CrmConversation } from "../db/schema";
import { env } from "../env";
import { smtpConfigured } from "../mail";
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
    author: m.internal ? (author?.email ? adminLabel({ name: author.name ?? "", email: author.email }) : "—") : m.direction === "out" ? (author?.email ? adminLabel({ name: author.name ?? "", email: author.email }) : m.externalId && !m.authorId ? "с телефона" : "автоматически") : null,
    at: m.createdAt.toISOString(),
    internal: m.internal,
  }));
}

export async function listTemplates() {
  return db.select({ id: crmTemplates.id, title: crmTemplates.title, text: crmTemplates.text }).from(crmTemplates).orderBy(asc(crmTemplates.position), asc(crmTemplates.createdAt));
}

/** Переменные шаблонов для конкретного диалога. */
export async function chatVars(conv: Pick<CrmConversation, "contactName" | "clientId" | "dealId">, managerName: string) {
  const [lastOrder, deal, fields] = await Promise.all([
    conv.clientId ? db.query.orders.findFirst({ where: eq(orders.userId, conv.clientId), orderBy: desc(orders.createdAt), columns: { number: true } }) : null,
    conv.dealId ? db.query.crmDeals.findFirst({ where: eq(crmDeals.id, conv.dealId), columns: { customFields: true } }) : null,
    listFields("deal"),
  ]);
  return { name: conv.contactName.split(" ")[0] ?? "", order: lastOrder?.number ?? null, link: env.appUrl, manager: managerName, fields: fieldVars(fields, deal?.customFields) };
}

/** Почему отправка сейчас не сработает (показываем над полем ввода). */
export async function sendBlocker(conv: Pick<CrmConversation, "channelId" | "channel">) {
  if (conv.channel === "site") return null;
  if (conv.channel === "email") return smtpConfigured() || process.env.NODE_ENV !== "production" ? null : "Почта (SMTP) не настроена на сервере — письма не уйдут клиенту.";
  if (!(await wazzupConfigured())) return "Wazzup не подключён — сообщения не уйдут клиенту. Подключите в разделе «Интеграции».";
  if (!conv.channelId && !(await getSetting("wazzup.channelId"))) return "Не выбран канал WhatsApp для отправки.";
  return null;
}
