/** Чистая часть почтового канала: тема ответа, очистка цитат, разбор входящего письма из вебхука. */

/** «Re: Заказ» — без накопления «Re: Re: Fwd:». */
export function replySubject(subject: string | null | undefined, fallback = "Ответ от MyBooks"): string {
  const base = (subject ?? "").replace(/^\s*((re|fw|fwd|ответ|отв)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
  return base ? `Re: ${base}` : fallback;
}

const quoteHeaders = [
  /^\s*On .{3,200}wrote:\s*$/i,
  /^.{3,200}\s(пишет|написал|написала|жазды):\s*$/i,
  /^\s*-{2,}\s*(Original Message|Исходное сообщение|Пересылаемое сообщение)\s*-{2,}/i,
  /^\s*(From|От|Кімнен):\s.+$/i,
  /^_{10,}\s*$/,
];

/** Текст нового письма без процитированной переписки и подписи «-- ». */
export function stripQuoted(text: string): string {
  const out: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (quoteHeaders.some((r) => r.test(line))) break;
    if (/^\s*>/.test(line)) continue;
    if (/^-- ?$/.test(line)) break;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** «Айгерим <a@b.kz>» → { email, name }. */
export function parseAddress(raw: string | null | undefined): { email: string; name: string } | null {
  if (!raw) return null;
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>\s]+@[^>\s]+)\s*>\s*$/);
  const email = (m ? m[2] : raw.trim()).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { email, name: m ? m[1].trim() : "" };
}

/** Грубое превращение HTML письма в текст — когда отправитель не приложил текстовую версию. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface InboundEmail {
  from: string;
  fromName: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo: string | null;
  date: Date;
  /** Автоответ («я в отпуске», рассылка) — заявку не создаём. */
  auto: boolean;
}

const str = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : "");

/**
 * Письмо из вебхука: свой JSON ({ from, subject, text, html, messageId }) или поля популярных
 * почтовых сервисов (Mailgun: sender, body-plain, Message-Id; SendGrid/Postmark — From, TextBody…).
 */
export function parseInboundWebhook(body: Record<string, unknown>, now = new Date()): InboundEmail | null {
  const addr = parseAddress(str(body.from) || str(body.sender) || str(body.From) || str(body.FromFull && (body.FromFull as Record<string, unknown>).Email));
  if (!addr) return null;
  const html = str(body.html) || str(body["body-html"]) || str(body.HtmlBody);
  const rawText = str(body.text) || str(body["stripped-text"]) || str(body["body-plain"]) || str(body.TextBody) || (html ? htmlToText(html) : "");
  const text = stripQuoted(rawText).slice(0, 20_000);
  const messageId = (str(body.messageId) || str(body["Message-Id"]) || str(body.MessageID) || "").trim();
  const subject = (str(body.subject) || str(body.Subject)).trim().slice(0, 300);
  const autoHeader = `${str(body["Auto-Submitted"])} ${str(body.autoSubmitted)} ${str(body.Precedence)}`.toLowerCase();
  return {
    from: addr.email,
    fromName: (str(body.fromName) || addr.name).trim().slice(0, 100),
    subject,
    text: text || (subject ? `(${subject})` : "(пустое письмо)"),
    messageId: messageId || `${addr.email}:${subject}:${now.getTime()}`,
    inReplyTo: (str(body.inReplyTo) || str(body["In-Reply-To"])).trim() || null,
    date: now,
    auto: /auto-(replied|generated)|bulk|list|junk/.test(autoHeader),
  };
}
