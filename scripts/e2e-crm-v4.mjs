// Сквозная проверка CRM v4: виджет на сайте (чат и «Перезвоните мне»), AI-помощник (мок Claude API),
// почта как канал, двухфакторный вход, список IP и веб-телефон Zadarma.
// Поднимает мок-сервер на :4010 (Claude, OpenAI-совместимый API, Zadarma) и SMTP на :2525. Запуск: node scripts/e2e-crm-v4.mjs [baseUrl] [outDir]
import http from "node:http";
import net from "node:net";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { chromium } from "playwright";

const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook";
const db = new pg.Pool({ connectionString: DATABASE_URL });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const check = (cond, msg) => {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("✓", msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, msg, timeout = 15000) {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > timeout) throw new Error("TIMEOUT: " + msg);
    await sleep(300);
  }
}

// ─── TOTP для проверки 2FA (RFC 6238) ─────────────────────────────────────
function b32(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, val = 0;
  const out = [];
  for (const c of s.replace(/\s/g, "").toUpperCase()) {
    val = (val << 5) | A.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
function totp(secret, at = Date.now()) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", b32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}

// ─── мок Claude API и Zadarma ─────────────────────────────────────────────
const aiCalls = [];
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  res.writeHead(200, { "Content-Type": "application/json" });
  if (req.url.startsWith("/v1/messages")) {
    const b = JSON.parse(body);
    aiCalls.push({ body: b, beta: req.headers["anthropic-beta"] ?? "", key: req.headers["x-api-key"] });
    const props = b.output_config?.format?.schema?.properties ?? {};
    let text;
    if ("summary" in props) text = JSON.stringify({ summary: "Клиентка хочет книгу маме к юбилею, выбирает тариф.", next_step: "Позвонить и помочь выбрать тариф «Твёрдая обложка»", due_days: 1, temperature: "hot", risks: "" });
    else if ("recipient" in props) text = JSON.stringify(Object.fromEntries(Object.keys(props).map((k) => [k, k === "recipient" ? "мама" : k === "event_date" ? "2027-03-08" : ""])));
    else if (/проверяешь подключение/.test(b.system ?? "")) text = "готово";
    else text = "«Здравствуйте! Печать занимает 5–7 рабочих дней, успеем к празднику.»";
    return res.end(JSON.stringify({ id: "msg_mock", type: "message", role: "assistant", model: b.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 120, output_tokens: 40 } }));
  }
  if (req.url.startsWith("/chat/completions")) {
    const b = JSON.parse(body);
    aiCalls.push({ body: b, openai: true, key: req.headers.authorization });
    return res.end(JSON.stringify({ id: "chatcmpl-mock", object: "chat.completion", model: b.model, choices: [{ index: 0, message: { role: "assistant", content: "готово" }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 2 } }));
  }
  if (req.url.startsWith("/v1/webrtc/get_key/")) return res.end(JSON.stringify({ status: "success", key: "WEBRTC-KEY-1" }));
  res.end("{}");
});
await new Promise((r) => server.listen(4010, r));

// ─── мок SMTP: принимает вход и письма ───────────────────────────────────
const smtpMails = [];
const smtpAuth = [];
const smtp = net.createServer((sock) => {
  let data = false;
  let buf = "";
  let mail = "";
  sock.write("220 mock ESMTP\r\n");
  sock.on("data", (chunk) => {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (data) {
        if (line === ".") {
          data = false;
          smtpMails.push(mail);
          mail = "";
          sock.write("250 OK queued\r\n");
        } else mail += line + "\n";
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") sock.write("250-mock\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
      else if (cmd === "AUTH") {
        smtpAuth.push(Buffer.from(line.split(" ")[2] ?? "", "base64").toString());
        sock.write("235 Authentication successful\r\n");
      } else if (cmd === "DATA") {
        data = true;
        sock.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (cmd === "QUIT") sock.end("221 Bye\r\n");
      else sock.write("250 OK\r\n");
    }
  });
});
await new Promise((r) => smtp.listen(2525, r));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const login = async (page, email, password, next = "/admin") => {
  await page.goto(`${base}/login?next=${encodeURIComponent(next)}`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
};
const stamp = Date.now();
const tag = String(stamp).slice(-6);
const prevProvider = (await q(`select value from crm_settings where key = 'telephony.provider'`))[0]?.value ?? null;

try {
  const admin = await newPage();
  await login(admin, "admin@mybook.local", "admin12345");
  await admin.waitForURL((u) => u.pathname === "/admin");

  // ─── 1. Настройки: AI-ключ, почта, виджет ─────────────────────────────
  await admin.goto(`${base}/admin/settings`);
  const aiForm = admin.locator("form", { has: admin.locator("textarea[name=knowledge]") });
  await aiForm.locator("input[name=aiKey]").fill("sk-ant-test-key");
  await aiForm.locator("textarea[name=knowledge]").fill("Печать 5–7 рабочих дней.");
  await aiForm.locator("input[name=aiBaseUrl]").fill("http://localhost:4010");
  await aiForm.getByRole("button", { name: "Сохранить" }).click();
  await aiForm.getByText("Сохранено").waitFor();
  await aiForm.getByRole("button", { name: "Проверить" }).click();
  await aiForm.getByText("Подключено, Claude отвечает: «готово»").waitFor();
  const ping = aiCalls.at(-1);
  check(ping.body.model === "claude-opus-5-5" && ping.body.fallbacks === "default" && ping.beta.includes("server-side-fallback-2026-07-01") && ping.body.output_config?.effort === "low" && ping.key === "sk-ant-test-key" && !("thinking" in ping.body), "AI: ключ сохранён, запрос к claude-opus-5-5 с резервной моделью и effort");

  // Другой провайдер: DeepSeek через OpenAI-совместимый API, затем обратно на Claude.
  await aiForm.getByText("DeepSeek", { exact: true }).click();
  await aiForm.locator("input[name=aiKey]").fill("sk-deepseek-test");
  await aiForm.locator("input[name=aiBaseUrl]").fill("http://localhost:4010");
  await aiForm.getByRole("button", { name: "Сохранить" }).click();
  await until(async () => (await q(`select value from crm_settings where key = 'ai.provider'`))[0]?.value === "deepseek", "провайдер DeepSeek сохранён");
  await admin.waitForTimeout(500);
  await aiForm.getByRole("button", { name: "Проверить" }).click();
  await aiForm.getByText("Подключено, DeepSeek отвечает: «готово»").waitFor();
  const dsCall = aiCalls.at(-1);
  check(dsCall.openai && dsCall.body.model === "deepseek-chat" && dsCall.key === "Bearer sk-deepseek-test" && dsCall.body.messages[0].role === "system", "AI: DeepSeek подключается по OpenAI-совместимому API со своим ключом");
  const encDs = (await q(`select value from crm_settings where key = 'ai.deepseek.apiKey'`))[0]?.value ?? "";
  check(encDs.startsWith("v1.") && !encDs.includes("sk-deepseek"), "AI: ключ DeepSeek хранится зашифрованным");
  await aiForm.getByText("Claude (Anthropic)", { exact: true }).click();
  await aiForm.getByRole("button", { name: "Сохранить" }).click();
  await until(async () => (await q(`select value from crm_settings where key = 'ai.provider'`))[0]?.value === "anthropic", "провайдер Claude сохранён");
  await admin.waitForTimeout(500);
  await aiForm.getByRole("button", { name: "Проверить" }).click();
  await aiForm.getByText("Подключено, Claude отвечает: «готово»").waitFor();
  check(!aiCalls.at(-1).openai, "AI: обратно на Claude — ключ Claude сохранился");

  // Почта для отправки (SMTP) настраивается в админке.
  const smtpForm = admin.locator("form", { has: admin.locator("input[name=smtpHost]") });
  await smtpForm.locator("input[name=smtpHost]").fill("127.0.0.1");
  await smtpForm.locator("input[name=smtpPort]").fill("2525");
  await smtpForm.locator("select[name=smtpSecure]").selectOption("false");
  await smtpForm.locator("input[name=smtpUser]").fill("robot@mybook.local");
  await smtpForm.locator("input[name=smtpPassword]").fill("app-pass-123");
  await smtpForm.locator("input[name=mailFrom]").fill("MyBooks <robot@mybook.local>");
  await smtpForm.getByRole("button", { name: "Сохранить" }).click();
  await smtpForm.getByText("Сохранено").waitFor();
  await smtpForm.getByRole("button", { name: "Проверить" }).click();
  await smtpForm.getByText("Подключено к 127.0.0.1:2525, логин и пароль приняты").waitFor();
  check(smtpAuth.some((a) => a.includes("robot@mybook.local") && a.includes("app-pass-123")), "SMTP: проверка входит на сервер с логином и паролем из админки");
  await smtpForm.getByRole("button", { name: /Письмо на/ }).click();
  await smtpForm.getByText(/Письмо отправлено на admin@mybook.local/).waitFor();
  check(smtpMails.some((m) => /Subject: =\?UTF-8\?|Subject: Проверка/i.test(m) && m.includes("robot@mybook.local") && m.includes("admin@mybook.local")), "SMTP: тестовое письмо ушло через сервер из админки");
  const encPass = (await q(`select value from crm_settings where key = 'mail.smtpPassword'`))[0]?.value ?? "";
  check(encPass.startsWith("v1.") && !encPass.includes("app-pass"), "SMTP: пароль хранится зашифрованным");
  // Дальше письма в сценарии идут в лог, как без SMTP.
  await q(`delete from crm_settings where key like 'mail.%'`);

  const emailForm = admin.locator("form", { has: admin.locator("input[name=imapHost]") });
  await emailForm.getByRole("button", { name: "Сохранить" }).click();
  await emailForm.getByText("Сохранено").waitFor();
  await admin.reload();
  const hookUrl = await admin.locator("form", { has: admin.locator("input[name=imapHost]") }).locator("input[readonly]").inputValue();
  check(/\/api\/integrations\/email\?token=/.test(hookUrl), "почта: адрес вебхука входящих выдан");
  await shot(admin, "v4-settings");

  // ─── 2. Виджет на сайте: онлайн-чат ────────────────────────────────────
  const visitor = await newPage({ viewport: { width: 390, height: 844 } });
  await visitor.goto(`${base}/kniga/kniga-mame`);
  const widget = visitor.getByTestId("site-widget");
  await widget.getByRole("button", { name: "Связаться с нами" }).click();
  check(await widget.getByRole("link", { name: "Написать в WhatsApp" }).isVisible(), "виджет: кнопка WhatsApp");
  await widget.getByRole("button", { name: "Чат на сайте" }).click();
  await widget.getByLabel("Телефон (необязательно)").fill(`+7 701 ${tag.slice(0, 3)} ${tag.slice(3)} 0`);
  await widget.getByLabel("Сообщение…").fill(`Здравствуйте! Хочу книгу маме к 8 марта ${tag}`);
  await widget.getByRole("button", { name: "Отправить" }).click();
  const conv = await until(async () => (await q(`select c.* from crm_conversations c join crm_messages m on m.conversation_id = c.id where c.channel = 'site' and c.deal_id is not null and m.text like $1`, [`%${tag}%`]))[0], "диалог с сайта создан");
  check(!!conv.deal_id && conv.meta.page === "/kniga/kniga-mame" && conv.meta.phone?.endsWith("0"), "виджет: сообщение пришло в CRM — диалог «Чат на сайте» со сделкой, страницей и телефоном");
  await shot(visitor, "v4-widget-chat");

  // ─── 3. AI в чате: подсказка ответа → отправка → посетитель видит ──────
  await admin.goto(`${base}/admin/chats?c=${conv.id}`);
  await admin.getByTestId("chat-messages").getByText(`к 8 марта ${tag}`).waitFor();
  await admin.getByRole("button", { name: "Подсказать ответ" }).click();
  const box = admin.getByLabel("Текст сообщения");
  await until(async () => (await box.inputValue()).startsWith("Здравствуйте! Печать"), "подсказка вставлена");
  const replyCall = aiCalls.at(-1);
  check(replyCall.body.system.includes("Печать 5–7 рабочих дней.") && replyCall.body.messages[0].content.includes(`к 8 марта ${tag}`) && /24\s900/.test(replyCall.body.system), "AI: подсказка учитывает переписку, цены с сайта и базу знаний; кавычки сняты");
  await admin.getByRole("button", { name: "Отправить" }).click();
  await until(async () => (await q(`select status from crm_messages where conversation_id = $1 and direction = 'out' and text like 'Здравствуйте! Печать%'`, [conv.id]))[0]?.status === "sent", "ответ сохранён");
  check(true, "ответ из инбокса в чат сайта отправлен (без Wazzup)");
  await widget.getByTestId("widget-messages").getByText("Здравствуйте! Печать занимает").waitFor({ timeout: 12000 });
  check(true, "посетитель увидел ответ менеджера в виджете");

  // ─── 4. AI в сделке: резюме, задача, поля из переписки ────────────────
  await admin.goto(`${base}/admin/deals/${conv.deal_id}`);
  const ai = admin.getByTestId("deal-ai");
  await ai.getByRole("button", { name: "Резюме и следующий шаг" }).click();
  await ai.getByTestId("ai-summary").getByText("Клиентка хочет книгу маме").waitFor();
  check((await q(`select ai_summary from crm_deals where id = $1`, [conv.deal_id]))[0].ai_summary?.temperature === "hot", "AI: резюме сохранено в сделке («горячий»)");
  check(aiCalls.at(-1).body.output_config.effort === "medium" && aiCalls.at(-1).body.output_config.format.type === "json_schema", "AI: резюме — структурированный ответ по схеме");
  await ai.getByRole("button", { name: "В задачи" }).click();
  await until(async () => (await q(`select kind from crm_tasks where deal_id = $1 and title like 'Позвонить и помочь%'`, [conv.deal_id]))[0]?.kind === "call", "задача из следующего шага");
  check(true, "следующий шаг стал задачей «звонок»");
  await ai.getByRole("button", { name: "Заполнить поля из переписки" }).click();
  const fields = ai.getByTestId("ai-fields");
  await fields.getByText("мама").waitFor();
  await fields.getByRole("button", { name: "Записать" }).click();
  await until(async () => (await q(`select custom_fields from crm_deals where id = $1`, [conv.deal_id]))[0].custom_fields.recipient === "мама", "поля записаны");
  const cf = (await q(`select custom_fields from crm_deals where id = $1`, [conv.deal_id]))[0].custom_fields;
  check(cf.recipient === "мама" && cf.event_date === "2027-03-08", "AI: поля «Для кого» и «Дата события» заполнены из переписки");
  await shot(admin, "v4-deal-ai");

  // ─── 5. «Перезвоните мне» ──────────────────────────────────────────────
  await widget.getByRole("button", { name: "Назад" }).click();
  await widget.getByRole("button", { name: "Перезвоните мне" }).click();
  const cbPhone = `+7 702 ${tag.slice(0, 3)} ${tag.slice(3)} 1`;
  await widget.getByLabel("Как вас зовут").fill(`Айжан ${tag}`);
  await widget.getByLabel("Телефон").fill(cbPhone);
  await widget.getByLabel("Удобное время или вопрос").fill("после 18:00");
  await widget.getByRole("button", { name: "Отправить" }).click();
  await widget.getByTestId("callback-done").waitFor();
  const cbDeal = await until(async () => (await q(`select * from crm_deals where contact_name = $1`, [`Айжан ${tag}`]))[0], "сделка по перезвону");
  const cbTask = (await q(`select * from crm_tasks where deal_id = $1 and kind = 'call'`, [cbDeal.id]))[0];
  check(cbDeal.source === "site" && cbTask && Math.abs(new Date(cbTask.due_at).getTime() - Date.now() - 15 * 60_000) < 120_000, "перезвон: сделка с сайта и задача позвонить через 15 минут");
  const badCb = await visitor.request.post(`${base}/api/chat/callback`, { data: { name: "x", phone: "123" } });
  check(badCb.status() === 400 && (await badCb.json()).error.includes("телефон"), "перезвон: короткий номер отклонён понятной ошибкой");

  // ─── 6. Почта: входящее письмо, ответ из инбокса, письмо из карточки ──
  const from = `client${tag}@mail.test`;
  const bad = await fetch(hookUrl.replace(/token=[^&]+/, "token=wrong"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check(bad.status === 403, "почта: вебхук без верного токена → 403");
  const inbound = await fetch(hookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from: `Динара <${from}>`, subject: `Книга папе ${tag}`, text: "Можно ли добавить 50 фото?\n\nOn Mon wrote:\n> старое", messageId: `<in-${tag}@mail.test>` }) });
  check(inbound.ok, "почта: входящее письмо принято");
  await fetch(hookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, subject: "Re", text: "повтор", messageId: `<in-${tag}@mail.test>` }) });
  const mailConv = await until(async () => (await q(`select * from crm_conversations where channel = 'email' and chat_id = $1 and deal_id is not null`, [from]))[0], "почтовый диалог");
  const inMsgs = await q(`select text from crm_messages where conversation_id = $1 and direction = 'in'`, [mailConv.id]);
  check(inMsgs.length === 1 && !inMsgs[0].text.includes("старое") && mailConv.contact_name === "Динара" && !!mailConv.deal_id && mailConv.meta.subject === `Книга папе ${tag}`, "почта: письмо в инбоксе без цитаты, повтор не задублирован, сделка создана");
  await admin.goto(`${base}/admin/chats?c=${mailConv.id}`);
  await admin.getByLabel("Текст сообщения").fill("Да, до 200 фото.");
  await admin.getByRole("button", { name: "Отправить" }).click();
  const reply = await until(async () => (await q(`select * from crm_messages where conversation_id = $1 and direction = 'out' and status = 'sent'`, [mailConv.id]))[0], "ответ на письмо");
  check(reply.subject === `Re: Книга папе ${tag}` && reply.external_id?.startsWith("email:"), "почта: ответ из инбокса ушёл с темой «Re: …»");
  await admin.goto(`${base}/admin/deals/${conv.deal_id}`);
  await q(`update crm_deals set contact_email = $2 where id = $1`, [conv.deal_id, `mama${tag}@mail.test`]);
  await admin.reload();
  await admin.locator("button[aria-expanded]", { hasText: "Письмо" }).click();
  const ef = admin.getByTestId("email-form");
  await ef.getByLabel("Тема письма").fill("Макет книги");
  await ef.getByLabel("Текст письма").fill("Добрый день! Высылаем ссылку на макет.");
  await ef.getByRole("button", { name: "Отправить" }).click();
  await until(async () => (await q(`select 1 from crm_notes where deal_id = $1 and kind = 'email'`, [conv.deal_id])).length, "заметка о письме");
  check((await q(`select 1 from crm_conversations where channel = 'email' and chat_id = $1 and deal_id = $2`, [`mama${tag}@mail.test`, conv.deal_id])).length === 1, "почта: письмо из карточки сделки — в истории и в инбоксе");

  // ─── 7. Двухфакторный вход ─────────────────────────────────────────────
  const secEmail = `sec${stamp}@test.local`;
  execFileSync("node", ["scripts/create-admin.mjs", secEmail, "secpass123"], { env: { ...process.env, DATABASE_URL } });
  const sec = await newPage({ extraHTTPHeaders: { "x-real-ip": "10.1.2.3" } });
  await login(sec, secEmail, "secpass123");
  await sec.waitForURL((u) => u.pathname === "/admin");
  await sec.goto(`${base}/admin/security`);
  await sec.getByRole("button", { name: "Включить 2FA" }).click();
  const secret = (await sec.getByTestId("totp-secret").textContent()).trim();
  check(/^[A-Z2-7]{32}$/.test(secret) && (await sec.getByAltText("QR-код для приложения-аутентификатора").isVisible()), "2FA: QR-код и ключ для приложения");
  await sec.getByLabel("Код подтверждения").fill("000000");
  await sec.getByRole("button", { name: "Подтвердить" }).click();
  await sec.getByText("Код не подошёл").first().waitFor();
  await sec.getByLabel("Код подтверждения").fill(totp(secret));
  await sec.getByRole("button", { name: "Подтвердить" }).click();
  await sec.getByTestId("backup-codes").waitFor();
  const codes = (await sec.getByTestId("backup-codes").locator("span.font-mono, .font-mono span").allTextContents()).filter((c) => /^\d{4}-\d{4}$/.test(c));
  check(codes.length === 10, "2FA включена, выданы 10 резервных кодов");
  await sec.getByRole("button", { name: "Я сохранил коды" }).click();
  await sec.getByTestId("2fa-on").waitFor();

  const sec2 = await newPage({ extraHTTPHeaders: { "x-real-ip": "10.1.2.3" } });
  await login(sec2, secEmail, "secpass123");
  await sec2.waitForURL((u) => u.pathname === "/login/2fa");
  check(!(await sec2.context().cookies()).some((c) => c.name === "mb_session"), "2FA: после пароля сессии ещё нет — нужен код");
  await sec2.fill("#code", "123456");
  await sec2.click("button[type=submit]");
  await sec2.getByText("Неверный код").waitFor();
  await sec2.fill("#code", totp(secret, Date.now() + 30_000));
  await sec2.click("button[type=submit]");
  await sec2.waitForURL((u) => u.pathname === "/admin");
  check(true, "2FA: вход по коду из приложения");
  const sec3 = await newPage({ extraHTTPHeaders: { "x-real-ip": "10.1.2.3" } });
  await login(sec3, secEmail, "secpass123");
  await sec3.waitForURL((u) => u.pathname === "/login/2fa");
  await sec3.fill("#code", codes[0]);
  await sec3.click("button[type=submit]");
  await sec3.waitForURL((u) => u.pathname === "/admin");
  check((await q(`select cardinality(totp_backup) n from users where email = $1`, [secEmail]))[0].n === 9, "2FA: вход по резервному коду, код сгорел");

  // ─── 8. Обязательная 2FA и список IP ───────────────────────────────────
  await sec.goto(`${base}/admin/security`);
  const rules = sec.locator("form", { has: sec.getByLabel("Разрешённые IP") });
  await rules.getByLabel("Разрешённые IP").fill("10.9.9.9");
  await rules.getByRole("button", { name: "Сохранить" }).click();
  await rules.getByText("Ваш текущий адрес 10.1.2.3 не входит в список").waitFor();
  check(true, "IP: защита от самоблокировки — без своего адреса сохранить нельзя");
  await rules.getByLabel("Разрешённые IP").fill("10.1.2.0/24 # офис\n2a02:6b8::/32");
  await rules.locator("input[name=require2fa]").check();
  await rules.getByRole("button", { name: "Сохранить" }).click();
  await rules.getByText("Сохранено").waitFor();
  await sleep(10_500); // кэш настроек
  const outsider = await newPage({ extraHTTPHeaders: { "x-real-ip": "10.9.9.9" } });
  await login(outsider, "admin@mybook.local", "admin12345");
  await outsider.waitForURL((u) => u.pathname === "/admin-denied");
  check(await outsider.getByText("10.9.9.9").isVisible(), "IP: вход не из офисной сети — страница отказа с адресом");
  const outsiderApi = await outsider.request.get(`${base}/api/admin/live`);
  check(outsiderApi.status() === 403, "IP: API CRM тоже закрыт");
  const office = await newPage({ extraHTTPHeaders: { "x-real-ip": "10.1.2.77" } });
  await login(office, "admin@mybook.local", "admin12345");
  await office.waitForURL((u) => u.pathname === "/admin/security");
  await office.getByTestId("require-2fa").waitFor();
  await office.goto(`${base}/admin/deals`);
  check(new URL(office.url()).pathname === "/admin/security", "обязательная 2FA: без настройки открыта только «Безопасность»");
  await shot(office, "v4-require-2fa");
  const reset = execFileSync("node", ["scripts/crm-security-reset.mjs"], { env: { ...process.env, DATABASE_URL } }).toString();
  check(reset.includes("сняты"), "аварийный скрипт снимает ограничения");
  await sleep(10_500);
  await office.goto(`${base}/admin/deals`);
  check(new URL(office.url()).pathname === "/admin/deals", "после сброса CRM снова доступна");
  await admin.goto(`${base}/admin/security`);
  await admin.getByTestId("team-2fa").getByText(secEmail.split("@")[0]).waitFor();
  check(await admin.getByTestId("team-2fa").locator("li", { hasText: secEmail.split("@")[0] }).getByText("включена").isVisible(), "руководитель видит статус 2FA сотрудников");

  // ─── 9. Веб-телефон Zadarma ────────────────────────────────────────────
  await q(`insert into crm_settings (key, value) values ('telephony.provider', 'zadarma'), ('zadarma.pbxId', '12345'), ('zadarma.webphone', 'on') on conflict (key) do update set value = excluded.value`);
  await sleep(10_500);
  await admin.goto(`${base}/admin`);
  check(await admin.getByTestId("webphone").isVisible(), "веб-телефон: кнопка в шапке CRM");
  const key = await admin.request.get(`${base}/api/admin/webphone`);
  const kj = await key.json();
  check(key.ok() && kj.key === "WEBRTC-KEY-1" && kj.sip === "12345-99", "веб-телефон: ключ WebRTC от Zadarma и SIP-логин сотрудника");

  check(errors.length === 0, `нет JS-ошибок на страницах${errors.length ? ": " + errors.join("; ") : ""}`);
  console.log("\nВСЕ ПРОВЕРКИ CRM v4 ПРОЙДЕНЫ");
} finally {
  await q(`delete from crm_settings where key in ('security.ipAllowlist', 'security.require2fa', 'zadarma.pbxId', 'zadarma.webphone', 'ai.apiKey', 'ai.baseUrl', 'ai.knowledge', 'ai.provider', 'ai.deepseek.apiKey', 'ai.deepseek.baseUrl', 'ai.deepseek.model')`).catch(() => {});
  await q(`delete from crm_settings where key like 'mail.%'`).catch(() => {});
  if (prevProvider) await q(`update crm_settings set value = $1 where key = 'telephony.provider'`, [prevProvider]).catch(() => {});
  await browser.close();
  server.close();
  smtp.close();
  await db.end();
}
