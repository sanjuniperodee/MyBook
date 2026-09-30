// Сквозная проверка CRM v3: рекламные ссылки с UTM и отчёт по каналам, несколько воронок и честная воронка.
// Запускать после e2e-crm-pro (нужен подключённый Wazzup). node scripts/e2e-crm-v3.mjs [baseUrl] [outDir]
import http from "node:http";
import pg from "pg";
import { chromium } from "playwright";

const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook" });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const check = (cond, msg) => {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("✓", msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, msg, timeout = 10000) {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > timeout) throw new Error("TIMEOUT: " + msg);
    await sleep(250);
  }
}
const sent = [];
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  res.writeHead(200, { "Content-Type": "application/json" });
  if (req.url.startsWith("/v3/message")) {
    sent.push(JSON.parse(body));
    return res.end(JSON.stringify({ messageId: `v3-out-${Date.now()}-${sent.length}` }));
  }
  res.end("[]");
});
await new Promise((r) => server.listen(4010, r));
await q(`insert into crm_settings (key, value) values ('crm.workHours', '{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"00:00"}') on conflict (key) do update set value = excluded.value`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const stamp = Date.now();
const tag = String(stamp).slice(-6);

try {
  const admin = await newPage();
  await admin.goto(`${base}/login?next=/admin`);
  await admin.fill("#email", "admin@mybook.local");
  await admin.fill("#password", "admin12345");
  await admin.click("button[type=submit]");
  await admin.waitForURL((u) => u.pathname === "/admin");

  // ─── 1. Ссылка на сайт: создать, перейти, зарегистрироваться ───────────
  await admin.goto(`${base}/admin/marketing`);
  const builder = admin.getByTestId("link-builder");
  await builder.getByPlaceholder("Instagram — шапка профиля").fill(`Instagram сторис ${tag}`);
  await builder.getByLabel("Страница").selectOption("/kniga/kniga-mame");
  await builder.getByRole("button", { name: "Instagram", exact: true }).click();
  await builder.locator("input[name=utmCampaign]").fill(`mama-${tag}`);
  const slug = await builder.getByLabel("Код ссылки").inputValue();
  check(slug === `instagram-mama-${tag}`, "короткий код предложен автоматически из источника и кампании");
  await builder.getByRole("button", { name: "Создать ссылку" }).click();
  await admin.getByTestId("links").getByText(`Instagram сторис ${tag}`).waitFor();
  check(true, "ссылка создана и появилась в списке");

  const visitor = await newPage();
  const resp = await visitor.goto(`${base}/go/${slug}`);
  const landed = new URL(visitor.url());
  check(resp.ok() && landed.pathname === "/kniga/kniga-mame" && landed.searchParams.get("utm_source") === "instagram" && landed.searchParams.get("utm_campaign") === `mama-${tag}` && landed.searchParams.get("lnk") === slug, "/go/код ведёт на страницу с UTM-метками");
  await until(async () => (await q(`select clicks from crm_links where slug = $1`, [slug]))[0]?.clicks === 1, "переход посчитан");
  check(true, "переход по ссылке посчитан");
  const email = `utm${stamp}@test.local`;
  await visitor.goto(`${base}/register?theme=mom`);
  await visitor.fill("#name", "Жансая");
  await visitor.fill("#email", email);
  await visitor.fill("#password", "secret123");
  await visitor.check("input[name=consent]");
  await visitor.click("button[type=submit]");
  await visitor.waitForURL(/\/books\/new/);
  const [u] = await q(`select id, source from users where email = $1`, [email]);
  check(u.source?.source === "instagram" && u.source?.campaign === `mama-${tag}` && u.source?.link === slug, "в профиле клиента сохранились метки и код ссылки");
  await visitor.fill("#recipientName", "Мама");
  await visitor.click("button[type=submit]");
  await visitor.waitForURL(/\/books\/[0-9a-f-]{36}$/);
  const deal = await until(async () => (await q(`select * from crm_deals where client_id = $1`, [u.id]))[0], "сделка клиента");
  check(deal.utm?.link === slug, "сделка клиента получила канал и кампанию");

  await admin.goto(`${base}/admin/clients/${u.id}`);
  check((await admin.getByTestId("client-channel").innerText()) === "Instagram", "в карточке клиента — канал Instagram");
  await admin.goto(`${base}/admin/deals/${deal.id}`);
  check((await admin.getByTestId("deal-channel").innerText()).includes(`mama-${tag}`), "в карточке сделки — канал и кампания");
  await admin.goto(`${base}/admin/clients?ch=instagram&q=${encodeURIComponent(email)}`);
  check(await admin.getByText("Жансая").first().isVisible(), "фильтр клиентов по каналу");

  // ─── 2. Ссылка «сразу в WhatsApp» с кодом в первом сообщении ──────────
  await admin.goto(`${base}/admin/marketing`);
  const b2 = admin.getByTestId("link-builder");
  await b2.getByRole("button", { name: "Сразу в WhatsApp" }).click();
  await b2.getByPlaceholder("Instagram — шапка профиля").fill(`TikTok видео ${tag}`);
  await b2.getByRole("button", { name: "TikTok" }).click();
  await b2.locator("input[name=utmCampaign]").fill(`video-${tag}`);
  const waSlug = await b2.getByLabel("Код ссылки").inputValue();
  await b2.getByRole("button", { name: "Создать ссылку" }).click();
  await admin.getByTestId("links").getByText(`TikTok видео ${tag}`).waitFor();
  const r = await fetch(`${base}/go/${waSlug}`, { redirect: "manual" });
  const wa = r.headers.get("location") ?? "";
  check(r.status === 302 && wa.startsWith("https://wa.me/") && decodeURIComponent(wa).includes(`(код: ${waSlug})`), "WhatsApp-ссылка открывает чат с кодом в сообщении");
  await admin.goto(`${base}/admin/settings`);
  const hookUrl = await admin.locator("input[readonly]").first().inputValue();
  const waPhone = `7747${String(stamp).slice(-7)}`;
  await fetch(hookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ messageId: `v3-${stamp}`, dateTime: new Date().toISOString(), channelId: "ch-wa-1", chatType: "whatsapp", chatId: waPhone, type: "text", isEcho: false, text: decodeURIComponent(wa.split("text=")[1]), contact: { name: "Лаура" } }] }),
  });
  const waDeal = await until(async () => (await q(`select d.* from crm_deals d join crm_conversations c on c.deal_id = d.id where c.chat_id = $1`, [waPhone]))[0], "сделка из WhatsApp");
  check(waDeal.utm?.source === "tiktok" && waDeal.utm?.link === waSlug, "заявка из WhatsApp получила канал TikTok по коду в первом сообщении");

  // ─── 3. Отчёт «Ссылки и каналы» и связанные экраны ─────────────────────
  await admin.goto(`${base}/admin/marketing?period=7`);
  const channelsTable = await admin.getByTestId("channels").innerText();
  check(channelsTable.includes("Instagram") && channelsTable.includes("TikTok"), "отчёт по каналам показывает Instagram и TikTok");
  const linkRow = admin.getByTestId("links").locator("tr", { hasText: `Instagram сторис ${tag}` });
  const cells = await linkRow.locator("td").allInnerTexts();
  check(cells[2].trim() === "1" && cells[3].trim() === "1" && cells[4].trim() === "1", "по ссылке: 1 переход, 1 регистрация, 1 заявка");
  await shot(admin, "v3-marketing");
  await admin.goto(`${base}/admin?period=7`);
  check(await admin.getByRole("link", { name: "Все каналы, ссылки и кампании →" }).isVisible(), "на дашборде — каналы и переход к отчёту");
  await admin.goto(`${base}/admin/deals?view=list`);
  check(await admin.locator("td", { hasText: "TikTok" }).first().isVisible(), "в списке сделок — колонка «Канал»");

  // ─── 4. Несколько воронок и честная воронка ────────────────────────────
  await admin.goto(`${base}/admin/deals/stages`);
  await admin.getByRole("button", { name: "Воронка" }).click();
  await admin.getByPlaceholder("Например, «Корпоративные»").fill(`Корпоративные ${tag}`);
  await admin.getByRole("button", { name: "Создать" }).click();
  await admin.waitForURL(/stages\?p=/);
  const pid = new URL(admin.url()).searchParams.get("p");
  check((await q(`select count(*)::int as n from crm_stages where pipeline_id = $1`, [pid]))[0].n === 4, "новая воронка создана с этапами «в работе», «успех», «отказ»");
  await admin.goto(`${base}/admin/deals/${waDeal.id}`);
  await admin.getByLabel("Воронка").selectOption(pid);
  await until(async () => (await q(`select s.pipeline_id from crm_deals d join crm_stages s on s.id = d.stage_id where d.id = $1`, [waDeal.id]))[0].pipeline_id === pid, "сделка в новой воронке");
  check(true, "сделку можно перенести в другую воронку");
  await admin.goto(`${base}/admin/deals?p=${pid}`);
  check(await admin.getByTestId("deals-board").getByText("Лаура").first().isVisible(), "доска воронки показывает перенесённую сделку");
  const hist = await q(`select count(*)::int as n from crm_stage_history where deal_id = $1`, [waDeal.id]);
  check(hist[0].n >= 2, "история этапов пишется при создании и переходах");
  await admin.goto(`${base}/admin/analytics?period=30`);
  check(await admin.getByTestId("funnel").getByText(/из пред\./).first().isVisible(), "аналитика: конверсия этап → этап по истории");
  await shot(admin, "v3-analytics");

  // ─── 5. Свои поля: автозаполнение из книги, редактор, фильтр ────────────
  await until(async () => (await q(`select custom_fields from crm_deals where id = $1`, [deal.id]))[0].custom_fields?.recipient === "Мама", "поле «Для кого» из книги");
  check(true, "поле сделки «Для кого» заполнилось из книги клиента");
  await admin.goto(`${base}/admin/deals/fields`);
  const newField = admin.locator("form", { has: admin.getByRole("button", { name: "Добавить" }) }).last();
  await newField.getByLabel("Название поля").fill(`Бюджет клиента ${tag}`);
  await newField.getByLabel("Тип поля").selectOption("select");
  await newField.getByLabel("Варианты").fill("до 20 000, 20–40 000, больше 40 000");
  await newField.getByRole("button", { name: "Добавить" }).click();
  await admin.getByText(`{Бюджет клиента ${tag}}`).waitFor();
  const [fld] = await q(`select key from crm_fields where label = $1`, [`Бюджет клиента ${tag}`]);
  check(!!fld, "своё поле-список создано");
  await admin.goto(`${base}/admin/deals/${deal.id}`);
  await admin.getByLabel("Формат").selectOption("Печатная");
  await admin.getByLabel(`Бюджет клиента ${tag}`).selectOption("20–40 000");
  await admin.locator("form", { has: admin.locator("input[name=amount]") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForSelector("text=Сохранено");
  const cf = (await q(`select custom_fields from crm_deals where id = $1`, [deal.id]))[0].custom_fields;
  check(cf.format === "Печатная" && cf[fld.key] === "20–40 000" && cf.recipient === "Мама", "поля сохраняются из карточки сделки, автозаполненные не теряются");
  await admin.goto(`${base}/admin/deals?view=list&cf_format=${encodeURIComponent("Печатная")}`);
  check(await admin.getByRole("link", { name: /Книга для: Мама/ }).first().isVisible(), "фильтр списка сделок по своему полю");

  // ─── 6. Массовые действия и сохранённый фильтр ─────────────────────────
  await admin.goto(`${base}/admin/deals?view=list&q=${encodeURIComponent("Жансая")}`);
  await admin.getByRole("checkbox", { name: "Выбрать все" }).check();
  const bulk = admin.getByTestId("bulk-bar");
  await bulk.getByLabel("Добавить тег").fill(`акция-${tag}`);
  await bulk.getByRole("button", { name: "+ тег" }).click();
  await until(async () => (await q(`select count(*)::int as n from crm_deals where $1 = any(tags)`, [`акция-${tag}`]))[0].n >= 1, "тег массово");
  check(true, "массовое действие: тег добавлен выбранным сделкам");
  await admin.getByRole("button", { name: "Сохранить фильтр" }).click();
  await admin.getByPlaceholder("Например, «Горящие к Новому году»").fill(`Тест ${tag}`);
  await admin.getByTestId("saved-views").getByRole("button", { name: "Сохранить" }).click();
  await admin.getByTestId("saved-views").getByRole("link", { name: `Тест ${tag}` }).waitFor();
  check(true, "фильтр сохранён и появился рядом с быстрыми фильтрами");
  await admin.goto(`${base}/admin/deals?view=list&task=none`);
  check(await admin.getByRole("link", { name: "Без задачи" }).isVisible(), "быстрый фильтр «Без задачи»");

  // ─── 7. План продаж ────────────────────────────────────────────────────
  const [me] = await q(`select id from users where email = 'admin@mybook.local'`);
  await admin.goto(`${base}/admin/team/plans`);
  const planRow = admin.getByTestId("plans").locator("tr", { has: admin.getByLabel(/План в тенге: admin/) });
  await planRow.getByLabel(/План в тенге/).fill("500000");
  await planRow.getByRole("button", { name: "Сохранить" }).click();
  await until(async () => (await q(`select amount from crm_plans where user_id = $1`, [me.id]))[0]?.amount === 500000, "план сохранён");
  await admin.goto(`${base}/admin`);
  check(await admin.getByTestId("my-plan").getByText("500 000").isVisible(), "прогресс плана — в «Моём дне»");

  // ─── 8. Бот-квалификатор ───────────────────────────────────────────────
  await admin.goto(`${base}/admin/settings`);
  const botForm = admin.getByTestId("bot-form");
  await botForm.getByText("Всегда").click();
  await botForm.getByRole("button", { name: "Сохранить бота" }).click();
  await until(async () => (await q(`select 1 from crm_settings where key = 'bot.mode' and value = 'always'`)).length, "бот включён");
  await sleep(11000); // кэш настроек на сервере
  const botPhone = `7778${String(stamp).slice(-7)}`;
  const say = (text, i) =>
    fetch(hookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ messageId: `bot-${stamp}-${i}`, dateTime: new Date().toISOString(), channelId: "ch-wa-1", chatType: "whatsapp", chatId: botPhone, type: "text", isEcho: false, text, contact: { name: "Динара" } }] }) });
  const botSent = () => sent.filter((m) => m.chatId === botPhone);
  await say("Здравствуйте, хочу книгу", 1);
  await until(() => botSent().length === 1, "приветствие бота");
  check(botSent()[0].text.includes("Здравствуйте, Динара!") && botSent()[0].text.includes("Для кого будет книга?"), "бот поздоровался и задал первый вопрос");
  await say("для мамы", 2);
  await until(() => botSent().length === 2, "второй вопрос");
  check(/1 — Годовщина/.test(botSent()[1].text), "вопрос-список бот задаёт с вариантами и номерами");
  const [botConv] = await q(`select * from crm_conversations where chat_id = $1`, [botPhone]);
  check(botConv.awaiting_since !== null, "ответы бота не сбрасывают «клиент ждёт ответа»");
  await say("6", 3);
  await until(() => botSent().length === 3, "третий вопрос");
  await say("15.11", 4);
  await until(() => botSent().length === 4, "четвёртый вопрос");
  await say("печатная", 5);
  await until(() => botSent().length === 5, "финал");
  const botDeal = (await q(`select d.* from crm_deals d where d.id = $1`, [botConv.deal_id]))[0];
  check(botDeal.custom_fields.recipient === "для мамы" && botDeal.custom_fields.occasion === "Свадьба" && /-11-15$/.test(botDeal.custom_fields.event_date) && botDeal.custom_fields.format === "Печатная", "ответы бота записаны в поля сделки");
  check((await q(`select 1 from crm_notes where deal_id = $1 and text like 'Бот собрал ответы%'`, [botDeal.id])).length === 1, "итог опроса — в истории сделки");
  const botPhone2 = `7779${String(stamp).slice(-7)}`;
  await fetch(hookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ messageId: `bot2-${stamp}`, dateTime: new Date().toISOString(), channelId: "ch-wa-1", chatType: "whatsapp", chatId: botPhone2, type: "text", isEcho: false, text: "Добрый день", contact: { name: "Айжан" } }] }) });
  await until(() => sent.some((m) => m.chatId === botPhone2), "бот начал второй диалог");
  const [conv2] = await q(`select id from crm_conversations where chat_id = $1`, [botPhone2]);
  await admin.goto(`${base}/admin/chats?c=${conv2.id}`);
  await admin.getByLabel("Текст сообщения").fill("Здравствуйте! Я менеджер, помогу");
  await admin.keyboard.press("Enter");
  await until(async () => (await q(`select bot_step from crm_conversations where id = $1`, [conv2.id]))[0].bot_step === -1, "бот остановлен");
  const before = sent.filter((m) => m.chatId === botPhone2).length;
  await fetch(hookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ messageId: `bot2b-${stamp}`, dateTime: new Date().toISOString(), channelId: "ch-wa-1", chatType: "whatsapp", chatId: botPhone2, type: "text", isEcho: false, text: "для папы", contact: { name: "Айжан" } }] }) });
  await sleep(1000);
  check(sent.filter((m) => m.chatId === botPhone2).length === before, "после ответа менеджера бот замолкает");
  await q(`update crm_settings set value = 'off' where key = 'bot.mode'`);

  // ─── 9. Мгновенные обновления, push, приложение ─────────────────────────
  await admin.goto(`${base}/admin`);
  await admin.waitForTimeout(1500);
  const bellBefore = Number((await admin.getByTestId("bell-count").innerText().catch(() => "0")) || 0);
  await q(`select 1`); // нотификацию создаём через упоминание в заметке — событие придёт по SSE
  const other = await newPage();
  await other.goto(`${base}/login?next=/admin`);
  const [mgr] = await q(`select email from users where role = 'admin' and email like 'manager%@test.local' and staff_disabled = false order by created_at desc limit 1`);
  await other.fill("#email", mgr.email);
  await other.fill("#password", "manager12345");
  await other.click("button[type=submit]");
  await other.waitForURL((u) => u.pathname === "/admin");
  await other.goto(`${base}/admin/deals/${botDeal.id}`);
  await other.getByPlaceholder(/Что обсудили/).fill("@admin глянь сделку");
  await other.locator("form", { has: other.getByPlaceholder(/Что обсудили/) }).getByRole("button", { name: "Сохранить" }).click();
  const t0 = Date.now();
  await admin.waitForFunction((b) => Number(document.querySelector("[data-testid=bell-count]")?.textContent || 0) > b, bellBefore, { timeout: 5000 });
  check(Date.now() - t0 < 5000, `колокольчик обновился за ${((Date.now() - t0) / 1000).toFixed(1)} с — без перезагрузки (SSE)`);
  const pk = await admin.request.get(`${base}/api/admin/push`);
  check(pk.ok() && ((await pk.json()).publicKey ?? "").length > 40, "ключ для push-подписки выдаётся");
  const subRes = await admin.request.post(`${base}/api/admin/push`, { data: { endpoint: `http://localhost:4010/push-${stamp}`, keys: { p256dh: "BPkUqKy8YcCzXg4xvE5eRUaVJ0T0yB1cS3yXcM9nq8m6Qk7P2wQ2m9kqK8k9V2XH1s7J0k0Kx5Rk0m3cQ1y5Q7k", auth: "k8Jf2mQ9xR1sT3vW" } } });
  check(subRes.ok() && (await q(`select 1 from crm_push_subscriptions where endpoint = $1`, [`http://localhost:4010/push-${stamp}`])).length === 1, "подписка устройства на push сохраняется");
  await admin.request.delete(`${base}/api/admin/push`, { data: { endpoint: `http://localhost:4010/push-${stamp}` } });
  const mf = await (await fetch(`${base}/crm.webmanifest`)).json();
  check(mf.start_url === "/admin" && mf.display === "standalone", "CRM ставится на телефон как приложение (manifest)");
  check((await fetch(`${base}/crm-sw.js`)).ok, "service worker для push доступен");

  console.log(errors.length ? "BROWSER ERRORS:\n" + errors.join("\n") : "no browser errors");
  console.log("OK: CRM v3 — ссылки и каналы, воронки, поля, массовые действия, планы, бот, push");
} finally {
  await browser.close();
  server.close();
  await db.end();
}
