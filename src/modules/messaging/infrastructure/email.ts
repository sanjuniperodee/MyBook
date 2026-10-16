import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/infrastructure/db";
import { crmConversations, crmMessages, crmNotes, users, type CrmConversation } from "@/shared/infrastructure/db/schema";
import { env } from "@/config/env";
import { escapeHtml, type SmtpConfigSource, type SmtpMailer } from "@/shared/infrastructure/mail";
import { site } from "@/config/site";
import type { LiveFeed, SettingsStore } from "@/shared/application";
import { htmlToText, parseAddress, replySubject, stripQuoted, type InboundEmail } from "@/modules/messaging/domain/email";
import { preview, redactSecrets } from "@/modules/messaging/domain/conversation";
import { staffLabel } from "@/shared/domain/staff";
import type { MessagingService } from "../application";

/** Настройки CRM, которые читает и пишет почтовый канал: ящик IMAP и UID последнего забранного письма. */
export type EmailSettingKey = "email.imapHost" | "email.imapPort" | "email.imapUser" | "email.imapPassword" | "email.imapMailbox" | "email.imapLastUid";

/** Почта по SMTP: настроена ли и транспорт для писем менеджеров (корень композиции даёт SmtpMailer). */
export type MailTransport = Pick<SmtpMailer, "configured" | "transport">;

/**
 * Письмо менеджера клиенту: ошибки не глотаются (их видно в чате), возвращается Message-ID для цепочки ответов.
 * Без SMTP в разработке письмо только пишется в лог; в продакшене — ошибка с подсказкой.
 */
async function sendCrmMail(smtp: MailTransport, opts: { to: string; subject: string; text: string; inReplyTo?: string | null; fromName?: string }): Promise<{ messageId: string }> {
  const t = await smtp.transport();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("Почта не настроена: укажите SMTP-сервер в «Интеграциях»");
    console.log(`[crm-mail] SMTP не настроен. Письмо для ${opts.to}: «${opts.subject}»\n${opts.text.slice(0, 500)}`);
    return { messageId: `<dev-${Date.now()}@${new URL(env.appUrl).hostname}>` };
  }
  const address = t.config.from;
  const email = address.match(/<([^>]+)>/)?.[1] ?? address;
  const from = opts.fromName ? `"${opts.fromName.replace(/["<>]/g, "")} · ${site.name}" <${email}>` : address;
  const info = await t.transport.sendMail({
    from,
    replyTo: t.config.replyTo || undefined,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1e1916">${escapeHtml(opts.text).replace(/\n/g, "<br>")}</div>`,
    inReplyTo: opts.inReplyTo ?? undefined,
    references: opts.inReplyTo ? [opts.inReplyTo] : undefined,
  });
  return { messageId: info.messageId };
}

async function authorName(messageId: string) {
  const row = await db
    .select({ name: users.name, email: users.email })
    .from(crmMessages)
    .innerJoin(users, eq(users.id, crmMessages.authorId))
    .where(eq(crmMessages.id, messageId))
    .limit(1);
  return row[0] ? staffLabel(row[0]) : undefined;
}

/** Ответ из единого инбокса в почтовый диалог: «Re: тема» и In-Reply-To последнего письма клиента. */
async function sendEmailReply(smtp: MailTransport, conv: Pick<CrmConversation, "chatId" | "meta">, messageId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = replySubject(conv.meta.subject);
  try {
    const { messageId: externalId } = await sendCrmMail(smtp, { to: conv.chatId, subject, text, inReplyTo: conv.meta.lastMessageId, fromName: await authorName(messageId) });
    await db.update(crmMessages).set({ status: "sent", subject, externalId: `email:${externalId}` }).where(eq(crmMessages.id, messageId));
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 300) : "Не удалось отправить письмо";
    console.error("[crm-mail] send", err);
    await db.update(crmMessages).set({ status: "error", error, subject }).where(eq(crmMessages.id, messageId));
    return { ok: false, error };
  }
}

/** Почтовый диалог с адресом (для письма из карточки): существующий или новый. */
async function emailConversation(address: string, patch: { clientId?: string | null; dealId?: string | null; contactName?: string; assigneeId?: string | null }) {
  const email = address.toLowerCase();
  const existing = await db.query.crmConversations.findFirst({ where: and(eq(crmConversations.channel, "email"), eq(crmConversations.channelId, ""), eq(crmConversations.chatId, email)) });
  if (existing) {
    if ((!existing.dealId && patch.dealId) || (!existing.clientId && patch.clientId)) {
      const [u] = await db
        .update(crmConversations)
        .set({ dealId: existing.dealId ?? patch.dealId ?? null, clientId: existing.clientId ?? patch.clientId ?? null })
        .where(eq(crmConversations.id, existing.id))
        .returning();
      return u;
    }
    return existing;
  }
  const [conv] = await db
    .insert(crmConversations)
    .values({ channel: "email", channelId: "", chatId: email, contactName: patch.contactName ?? "", clientId: patch.clientId ?? null, dealId: patch.dealId ?? null, assigneeId: patch.assigneeId ?? null, status: "open" })
    .onConflictDoNothing()
    .returning();
  return conv ?? (await db.query.crmConversations.findFirst({ where: and(eq(crmConversations.channel, "email"), eq(crmConversations.chatId, email)) }))!;
}

let polling = false;

/** Почта как канал: письма из карточки, ответы из инбокса, входящие по IMAP и вебхуком почтового сервиса. */
export class EmailChannel {
  constructor(private readonly deps: { settings: SettingsStore<EmailSettingKey>; live: LiveFeed; smtpConfig: SmtpConfigSource; smtp: MailTransport; chats: Pick<MessagingService, "ingest"> }) {}

  /** Ответ из единого инбокса в почтовый диалог (сообщение уже записано, здесь оно уходит и получает статус). */
  reply(conv: Pick<CrmConversation, "chatId" | "meta">, messageId: string, text: string) {
    return sendEmailReply(this.deps.smtp, conv, messageId, text);
  }

  /** Письмо из карточки сделки/клиента: уходит клиенту, попадает в историю и в единый инбокс (там же придёт ответ). */
  async sendToContact(input: { to: string; subject: string; text: string; authorId: string; dealId?: string | null; clientId?: string | null; contactName?: string }) {
    const addr = parseAddress(input.to);
    if (!addr) throw new Error("Некорректный e-mail");
    const conv = await emailConversation(addr.email, { dealId: input.dealId, clientId: input.clientId, contactName: input.contactName, assigneeId: input.authorId });
    const subject = input.subject.trim().slice(0, 200) || replySubject(conv.meta.subject);
    // Письмо уходит целиком, а в CRM (переписка, превью, заметка) — без секретов (ссылки «задайте пароль»).
    const stored = redactSecrets(input.text);
    const [msg] = await db.insert(crmMessages).values({ conversationId: conv.id, direction: "out", authorId: input.authorId, text: stored, subject, status: "pending" }).returning();
    const now = new Date();
    await db
      .update(crmConversations)
      .set({ lastMessageAt: now, lastMessageText: preview(stored), meta: { ...conv.meta, subject }, unread: 0, awaitingSince: null, updatedAt: now, assigneeId: conv.assigneeId ?? input.authorId })
      .where(eq(crmConversations.id, conv.id));
    let result: { ok: true } | { ok: false; error: string };
    try {
      const { messageId } = await sendCrmMail(this.deps.smtp, { to: addr.email, subject, text: input.text, inReplyTo: conv.meta.lastMessageId, fromName: await authorName(msg.id) });
      await db.update(crmMessages).set({ status: "sent", externalId: `email:${messageId}` }).where(eq(crmMessages.id, msg.id));
      result = { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err.message.slice(0, 300) : "Не удалось отправить письмо";
      await db.update(crmMessages).set({ status: "error", error }).where(eq(crmMessages.id, msg.id));
      result = { ok: false, error };
    }
    if (result.ok && (input.dealId || input.clientId)) {
      await db.insert(crmNotes).values({ dealId: input.dealId ?? null, clientId: input.clientId ?? null, authorId: input.authorId, kind: "email", text: `✉️ Письмо «${subject}» на ${addr.email}:\n${stored.slice(0, 1000)}` });
    }
    void this.deps.live.publish({ type: "chat", conversationId: conv.id });
    return { ...result, conversationId: conv.id };
  }

  /** Входящее письмо → сообщение в единый инбокс (диалог по адресу отправителя), со сделкой и уведомлением. */
  async ingest(mail: InboundEmail) {
    const ours = ((await this.deps.smtpConfig())?.from ?? site.contacts.email).toLowerCase();
    if (ours.includes(mail.from)) return; // своё же письмо (копия в ящике)
    // Автоответы и рассылки («я в отпуске», новости сервисов) не превращаем в заявки.
    if (mail.auto) return;
    // Повторная доставка того же письма (вебхук, IMAP после сбоя) не должна менять тему и цепочку диалога.
    if (await db.query.crmMessages.findFirst({ where: eq(crmMessages.externalId, `email:${mail.messageId}`), columns: { id: true } })) return;
    const text = mail.subject && !mail.text.includes(mail.subject) ? `${mail.subject}\n\n${mail.text}` : mail.text;
    await this.deps.chats.ingest(
      {
        externalId: `email:${mail.messageId}`,
        channelId: "",
        chatType: "email",
        chatId: mail.from,
        at: mail.date,
        isEcho: false,
        type: "text",
        text: text.slice(0, 20_000),
        mediaUrl: null,
        contactName: mail.fromName,
        avatarUrl: null,
        status: null,
      },
      { meta: { subject: mail.subject, lastMessageId: mail.messageId.startsWith("<") ? mail.messageId : undefined, email: mail.from }, subject: mail.subject },
    );
  }

  private async imapConfigured() {
    const s = await this.deps.settings.getMany(["email.imapHost", "email.imapUser", "email.imapPassword"]);
    return !!(s["email.imapHost"] && s["email.imapUser"] && s["email.imapPassword"]);
  }

  /**
   * Забирает новые письма из ящика по IMAP (раз в минуту из планировщика). Помним UID последнего письма,
   * поэтому при первом подключении берём только письма за последние сутки.
   */
  async pollImap(): Promise<number> {
    if (polling || !(await this.imapConfigured())) return 0;
    polling = true;
    const s = await this.deps.settings.getMany(["email.imapHost", "email.imapPort", "email.imapUser", "email.imapPassword", "email.imapMailbox", "email.imapLastUid"]);
    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");
    const client = new ImapFlow({
      host: s["email.imapHost"],
      port: Number(s["email.imapPort"]) || 993,
      secure: Number(s["email.imapPort"] || 993) !== 143,
      auth: { user: s["email.imapUser"], pass: s["email.imapPassword"] },
      logger: false,
      socketTimeout: 60_000,
    });
    let count = 0;
    try {
      await client.connect();
      const lock = await client.getMailboxLock(s["email.imapMailbox"] || "INBOX");
      try {
        const lastUid = Number(s["email.imapLastUid"]) || 0;
        const query = lastUid ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - 86_400_000) };
        let maxUid = lastUid;
        for await (const msg of client.fetch(query, { uid: true, source: true }, { uid: true })) {
          if (msg.uid <= lastUid || !msg.source) continue;
          maxUid = Math.max(maxUid, msg.uid);
          const parsed = await simpleParser(msg.source);
          const from = parsed.from?.value[0];
          if (!from?.address) continue;
          const headers = parsed.headers;
          const autoHeader = `${headers.get("auto-submitted") ?? ""} ${headers.get("precedence") ?? ""}`.toLowerCase();
          const raw = parsed.text || (typeof parsed.html === "string" ? htmlToText(parsed.html) : "");
          await this.ingest({
            from: from.address.toLowerCase(),
            fromName: from.name ?? "",
            subject: (parsed.subject ?? "").slice(0, 300),
            text: stripQuoted(raw).slice(0, 20_000) || "(пустое письмо)",
            messageId: parsed.messageId ?? `${from.address}:${msg.uid}`,
            inReplyTo: typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : null,
            date: parsed.date ?? new Date(),
            auto: /auto-(replied|generated)|bulk|list|junk/.test(autoHeader),
          });
          count++;
        }
        if (maxUid > lastUid) await this.deps.settings.save({ "email.imapLastUid": String(maxUid) }, null);
      } finally {
        lock.release();
      }
      await client.logout();
    } catch (err) {
      console.error("[crm-mail] imap", err instanceof Error ? err.message : err);
      await client.close();
    } finally {
      polling = false;
    }
    return count;
  }

  /** Проверка IMAP из «Интеграций»: подключение и число писем в ящике. */
  async testImap(): Promise<string> {
    const s = await this.deps.settings.getMany(["email.imapHost", "email.imapPort", "email.imapUser", "email.imapPassword", "email.imapMailbox"]);
    if (!s["email.imapHost"] || !s["email.imapUser"] || !s["email.imapPassword"]) throw new Error("Заполните сервер, логин и пароль IMAP");
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({ host: s["email.imapHost"], port: Number(s["email.imapPort"]) || 993, secure: Number(s["email.imapPort"] || 993) !== 143, auth: { user: s["email.imapUser"], pass: s["email.imapPassword"] }, logger: false, socketTimeout: 20_000 });
    try {
      await client.connect();
      const status = await client.status(s["email.imapMailbox"] || "INBOX", { messages: true });
      await client.logout();
      return `Подключено, писем в ящике: ${(status && status.messages) ?? 0}`;
    } catch (err) {
      await client.close();
      throw new Error(err instanceof Error ? `IMAP: ${err.message}` : "Не удалось подключиться к IMAP");
    }
  }
}
