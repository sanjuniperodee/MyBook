import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { crmConversations, crmMessages, crmNotes, users, type CrmConversation } from "../db/schema";
import { env } from "../env";
import { escapeHtml } from "@/shared/infrastructure/mail";
import { container } from "@/server/container";
import { site } from "@/config/site";
import { getSettings, saveSettings } from "./settings";
import { publish } from "./realtime";
import { htmlToText, parseAddress, replySubject, stripQuoted, type InboundEmail } from "./email-logic";
import { adminLabel } from "../crm";

export const emailSendReady = () => container().mailer.configured;

/**
 * Письмо менеджера клиенту: ошибки не глотаются (их видно в чате), возвращается Message-ID для цепочки ответов.
 * Без SMTP в разработке письмо только пишется в лог; в продакшене — ошибка с подсказкой.
 */
async function sendCrmMail(opts: { to: string; subject: string; text: string; inReplyTo?: string | null; fromName?: string }): Promise<{ messageId: string }> {
  const t = container().smtp.transport();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("Почта не настроена: укажите SMTP_HOST и доступы в переменных окружения сервера");
    console.log(`[crm-mail] SMTP не настроен. Письмо для ${opts.to}: «${opts.subject}»\n${opts.text.slice(0, 500)}`);
    return { messageId: `<dev-${Date.now()}@${new URL(env.appUrl).hostname}>` };
  }
  const address = process.env.MAIL_FROM || `${site.name} <${site.contacts.email}>`;
  const email = address.match(/<([^>]+)>/)?.[1] ?? address;
  const from = opts.fromName ? `"${opts.fromName.replace(/["<>]/g, "")} · ${site.name}" <${email}>` : address;
  const info = await t.sendMail({
    from,
    replyTo: process.env.CRM_REPLY_TO || undefined,
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
  return row[0] ? adminLabel(row[0]) : undefined;
}

/** Ответ из единого инбокса в почтовый диалог: «Re: тема» и In-Reply-To последнего письма клиента. */
export async function sendEmailReply(conv: Pick<CrmConversation, "chatId" | "meta">, messageId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const subject = replySubject(conv.meta.subject);
  try {
    const { messageId: externalId } = await sendCrmMail({ to: conv.chatId, subject, text, inReplyTo: conv.meta.lastMessageId, fromName: await authorName(messageId) });
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

/** Письмо из карточки сделки/клиента: уходит клиенту, попадает в историю и в единый инбокс (там же придёт ответ). */
export async function sendEmailToContact(input: { to: string; subject: string; text: string; authorId: string; dealId?: string | null; clientId?: string | null; contactName?: string }) {
  const addr = parseAddress(input.to);
  if (!addr) throw new Error("Некорректный e-mail");
  const conv = await emailConversation(addr.email, { dealId: input.dealId, clientId: input.clientId, contactName: input.contactName, assigneeId: input.authorId });
  const subject = input.subject.trim().slice(0, 200) || replySubject(conv.meta.subject);
  const [msg] = await db.insert(crmMessages).values({ conversationId: conv.id, direction: "out", authorId: input.authorId, text: input.text, subject, status: "pending" }).returning();
  const now = new Date();
  await db
    .update(crmConversations)
    .set({ lastMessageAt: now, lastMessageText: input.text.replace(/\s+/g, " ").slice(0, 160), meta: { ...conv.meta, subject }, unread: 0, awaitingSince: null, updatedAt: now, assigneeId: conv.assigneeId ?? input.authorId })
    .where(eq(crmConversations.id, conv.id));
  let result: { ok: true } | { ok: false; error: string };
  try {
    const { messageId } = await sendCrmMail({ to: addr.email, subject, text: input.text, inReplyTo: conv.meta.lastMessageId, fromName: await authorName(msg.id) });
    await db.update(crmMessages).set({ status: "sent", externalId: `email:${messageId}` }).where(eq(crmMessages.id, msg.id));
    result = { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message.slice(0, 300) : "Не удалось отправить письмо";
    await db.update(crmMessages).set({ status: "error", error }).where(eq(crmMessages.id, msg.id));
    result = { ok: false, error };
  }
  if (result.ok && (input.dealId || input.clientId)) {
    await db.insert(crmNotes).values({ dealId: input.dealId ?? null, clientId: input.clientId ?? null, authorId: input.authorId, kind: "email", text: `✉️ Письмо «${subject}» на ${addr.email}:\n${input.text.slice(0, 1000)}` });
  }
  void publish({ type: "chat", conversationId: conv.id });
  return { ...result, conversationId: conv.id };
}

/** Входящее письмо → сообщение в единый инбокс (диалог по адресу отправителя), со сделкой и уведомлением. */
export async function ingestEmail(mail: InboundEmail) {
  const ours = (process.env.MAIL_FROM ?? site.contacts.email).toLowerCase();
  if (ours.includes(mail.from)) return; // своё же письмо (копия в ящике)
  // Автоответы и рассылки («я в отпуске», новости сервисов) не превращаем в заявки.
  if (mail.auto) return;
  // Повторная доставка того же письма (вебхук, IMAP после сбоя) не должна менять тему и цепочку диалога.
  if (await db.query.crmMessages.findFirst({ where: eq(crmMessages.externalId, `email:${mail.messageId}`), columns: { id: true } })) return;
  const text = mail.subject && !mail.text.includes(mail.subject) ? `${mail.subject}\n\n${mail.text}` : mail.text;
  await container().messaging.chats.ingest(
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

export async function imapConfigured() {
  const s = await getSettings(["email.imapHost", "email.imapUser", "email.imapPassword"]);
  return !!(s["email.imapHost"] && s["email.imapUser"] && s["email.imapPassword"]);
}

let polling = false;

/**
 * Забирает новые письма из ящика по IMAP (раз в минуту из планировщика). Помним UID последнего письма,
 * поэтому при первом подключении берём только письма за последние сутки.
 */
export async function pollImap(): Promise<number> {
  if (polling || !(await imapConfigured())) return 0;
  polling = true;
  const s = await getSettings(["email.imapHost", "email.imapPort", "email.imapUser", "email.imapPassword", "email.imapMailbox", "email.imapLastUid"]);
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
        await ingestEmail({
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
      if (maxUid > lastUid) await saveSettings({ "email.imapLastUid": String(maxUid) }, null);
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
export async function testImap(): Promise<string> {
  const s = await getSettings(["email.imapHost", "email.imapPort", "email.imapUser", "email.imapPassword", "email.imapMailbox"]);
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

/** Последний адрес клиента в почтовом диалоге сделки — чтобы предложить его в форме письма. */
export async function lastEmailOfDeal(dealId: string) {
  const [c] = await db.select({ chatId: crmConversations.chatId, subject: sql<string | null>`${crmConversations.meta}->>'subject'` }).from(crmConversations).where(and(eq(crmConversations.dealId, dealId), eq(crmConversations.channel, "email"))).orderBy(desc(crmConversations.lastMessageAt)).limit(1);
  return c ?? null;
}

