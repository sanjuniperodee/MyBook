import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmConversations, crmDeals, crmMessages, crmTemplates, orders, users, type CrmConversation } from "@/shared/infrastructure/db/schema";
import { env } from "@/config/env";
import { staffLabel } from "@/shared/domain/staff";
import type { CustomFieldsReader, SettingsReader } from "@/shared/application";
import { fieldVars } from "@/shared/domain/customFields";
import { GOWA_CHANNEL, gowaDownloadable, gowaMediaPath } from "../domain/gowa";
import type { MailTransport } from "./email";
import type { GowaClient } from "./gowa";
import type { WazzupClient } from "./wazzup";

/** Сообщение диалога в виде, готовом для ChatPanel. */
export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  type: string;
  text: string;
  mediaUrl: string | null;
  status: string;
  error: string | null;
  author: string | null;
  at: string;
  /** Внутренняя заметка сотрудника — клиент её не видит. */
  internal?: boolean;
  /**
   * Файл вложения лежит в шлюзе GOWA (или шлюз скачает его по запросу) — открывается по id сообщения,
   * через /api/admin/chats/messages/<id>/media, с проверкой, что сотрудник видит диалог.
   */
  gateway?: boolean;
}

/** Последние сообщения диалога в виде, готовом для ChatPanel. gateway — вложение открывается через шлюз GOWA. */
async function loadChatMessages(conversationId: string, limit: number, gateway: (m: typeof crmMessages.$inferSelect) => boolean): Promise<ChatMessage[]> {
  const rows = await db
    .select({ m: crmMessages, author: { name: users.name, email: users.email } })
    .from(crmMessages)
    .leftJoin(users, eq(users.id, crmMessages.authorId))
    .where(eq(crmMessages.conversationId, conversationId))
    .orderBy(desc(crmMessages.createdAt))
    .limit(limit);
  return rows.reverse().map(({ m, author }) => {
    const viaGateway = gateway(m);
    return {
      id: m.id,
      direction: m.direction,
      type: m.type,
      text: m.text,
      // Путь файла шлюза (в нём номер клиента) в браузер не уходит: такое вложение открывается по id сообщения.
      mediaUrl: viaGateway ? null : m.mediaUrl,
      status: m.status,
      error: m.error,
      author: m.internal ? (author?.email ? staffLabel({ name: author.name ?? "", email: author.email }) : "—") : m.direction === "out" ? (author?.email ? staffLabel({ name: author.name ?? "", email: author.email }) : m.externalId && !m.authorId ? "с телефона" : "автоматически") : null,
      at: m.createdAt.toISOString(),
      internal: m.internal,
      ...(viaGateway ? { gateway: true } : {}),
    };
  });
}

/** Экран чата (ChatPanel): сообщения, шаблоны ответов, их переменные и почему отправка сейчас не сработает. */
export class ChatView {
  constructor(
    private readonly deps: {
      fields: CustomFieldsReader;
      settings: SettingsReader<"wazzup.channelId">;
      wazzup: WazzupClient;
      gowa: Pick<GowaClient, "status">;
      /** Через что сейчас работает WhatsApp. */
      whatsappProvider: () => Promise<"wazzup" | "gowa">;
      smtp: Pick<MailTransport, "configured">;
    },
  ) {}

  async messages(conversationId: string, limit = 150) {
    const [conv] = await db.select({ channel: crmConversations.channel, channelId: crmConversations.channelId, chatId: crmConversations.chatId }).from(crmConversations).where(eq(crmConversations.id, conversationId)).limit(1);
    const viaGowa = conv?.channel === "whatsapp" && (await this.deps.whatsappProvider()) === "gowa";
    return loadChatMessages(conversationId, limit, (m) => !!conv && (gowaMediaPath(m.mediaUrl) !== null || gowaDownloadable(conv, viaGowa, m)));
  }

  templates() {
    return db.select({ id: crmTemplates.id, title: crmTemplates.title, text: crmTemplates.text }).from(crmTemplates).orderBy(asc(crmTemplates.position), asc(crmTemplates.createdAt));
  }

  /** Переменные шаблонов для конкретного диалога. */
  async vars(conv: Pick<CrmConversation, "contactName" | "clientId" | "dealId">, managerName: string) {
    const [lastOrder, deal, fields] = await Promise.all([
      conv.clientId ? db.query.orders.findFirst({ where: eq(orders.userId, conv.clientId), orderBy: desc(orders.createdAt), columns: { number: true } }) : null,
      conv.dealId ? db.query.crmDeals.findFirst({ where: eq(crmDeals.id, conv.dealId), columns: { customFields: true } }) : null,
      this.deps.fields.list("deal"),
    ]);
    return { name: conv.contactName.split(" ")[0] ?? "", order: lastOrder?.number ?? null, link: env.appUrl, manager: managerName, fields: fieldVars(fields, deal?.customFields) };
  }

  /** Почему отправка сейчас не сработает (показываем над полем ввода). */
  async sendBlocker(conv: Pick<CrmConversation, "channelId" | "channel">) {
    if (conv.channel === "site") return null;
    if (conv.channel === "email") return (await this.deps.smtp.configured()) || process.env.NODE_ENV !== "production" ? null : "Почта (SMTP) не настроена — укажите сервер в «Интеграциях», иначе письма не уйдут клиенту.";
    if (conv.channel === "whatsapp" && (conv.channelId === GOWA_CHANNEL || (await this.deps.whatsappProvider()) === "gowa")) {
      const s = await this.deps.gowa.status();
      if (!s.reachable) return "Шлюз WhatsApp (GOWA) недоступен — сообщения не уйдут клиенту. Проверьте, что сервис запущен.";
      if (s.problem) return `${s.problem} — сообщения не уйдут клиенту. Проверьте настройки в «Интеграциях».`;
      return s.loggedIn ? null : "Номер WhatsApp не привязан — отсканируйте QR в разделе «Интеграции».";
    }
    if (!(await this.deps.wazzup.configured())) return "Wazzup не подключён — сообщения не уйдут клиенту. Подключите в разделе «Интеграции».";
    if (!conv.channelId && !(await this.deps.settings.get("wazzup.channelId"))) return "Не выбран канал WhatsApp для отправки.";
    return null;
  }
}
