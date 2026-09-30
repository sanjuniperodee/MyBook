// Сквозная проверка удобств отдела продаж: воронка по действиям клиента, «Неразобранное» и спам, дубли,
// заметки с @упоминаниями, оплата и скидка из чата, автоответ вне графика, «забросил книгу», годовщина повода.
// Запускать после e2e-crm-pro (нужны подключённый Wazzup и менеджер). node scripts/e2e-crm-sales.mjs [baseUrl] [outDir]
import http from "node:http";
import { execSync } from "node:child_process";
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

// Мок Wazzup (адрес уже сохранён в настройках прогоном e2e-crm-pro).
const sent = [];
let n = 0;
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  res.writeHead(200, { "Content-Type": "application/json" });
  if (req.url.startsWith("/v3/message")) {
    sent.push(JSON.parse(body));
    return res.end(JSON.stringify({ messageId: `sales-out-${Date.now()}-${++n}` }));
  }
  res.end("[]");
});
await new Promise((r) => server.listen(4010, r));

const setHours = (from, to) => q(`insert into crm_settings (key, value) values ('crm.workHours', $1) on conflict (key) do update set value = excluded.value`, [JSON.stringify({ days: [1, 2, 3, 4, 5, 6, 7], from, to })]);
await setHours("00:00", "00:00");

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("dialog", (d) => d.accept());
  return p;
};
const confirm = async (page) => page.getByRole("dialog").getByRole("button", { name: "Да" }).click();
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });
const stamp = Date.now();
const ph = (prefix) => `${prefix}${String(stamp).slice(-7)}`;

try {
  const admin = await newPage();
  await admin.goto(`${base}/login?next=/admin`);
  await admin.fill("#email", "admin@mybook.local");
  await admin.fill("#password", "admin12345");
  await admin.click("button[type=submit]");
  await admin.waitForURL((u) => u.pathname === "/admin");
  await admin.goto(`${base}/admin/settings`);
  const hookUrl = await admin.locator("input[readonly]").first().inputValue();
  check(hookUrl.includes("/api/integrations/wazzup?token="), "адрес вебхука Wazzup получен из настроек");
  const hook = (messages) => fetch(hookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }) });
  const msg = (chatId, text, name) => ({ messageId: `sales-in-${stamp}-${++n}`, dateTime: new Date().toISOString(), channelId: "ch-wa-1", chatType: "whatsapp", chatId, type: "text", isEcho: false, text, contact: { name } });
  check(await admin.getByText("Отдел продаж").isVisible(), "настройки отдела продаж: график, автосделки, «Неразобранное», лимит скидки");

  // ─── 1. Воронка по действиям клиента ────────────────────────────────────
  const client = await newPage();
  const clientEmail = `sales${stamp}@test.local`;
  await client.goto(`${base}/register?theme=mom`);
  await client.fill("#name", "Салтанат");
  await client.fill("#email", clientEmail);
  await client.fill("#password", "secret123");
  await client.check("input[name=consent]");
  await client.click("button[type=submit]");
  await client.waitForURL(/\/books\/new/);
  const [clientUser] = await q(`select id from users where email = $1`, [clientEmail]);
  check(!(await q(`select 1 from crm_deals where client_id = $1`, [clientUser.id])).length, "регистрация без книги сделку не заводит (настройка «начал книгу»)");
  await client.fill("#recipientName", "Бабушка Роза");
  await client.click("button[type=submit]");
  await client.waitForURL(/\/books\/[0-9a-f-]{36}$/);
  const bookId = client.url().split("/").pop();
  const deal = await until(async () => (await q(`select d.*, s.name as stage from crm_deals d join crm_stages s on s.id = d.stage_id where d.client_id = $1`, [clientUser.id]))[0], "сделка по новой книге");
  check(deal.stage === "Пишет книгу" && deal.source === "site" && deal.title.includes("Бабушка Роза"), "клиент начал книгу → сделка сама встала на этап «Пишет книгу»");
  const questions = await q(`select id from book_questions where book_id = $1 order by position limit 26`, [bookId]);
  await q(`update book_questions set answer = 'Тёплое воспоминание о бабушке' where id = any($1)`, [questions.slice(0, 25).map((x) => x.id)]);
  const patch = await client.request.patch(`${base}/api/books/${bookId}/questions/${questions[25].id}`, { data: { answer: "Её пирожки по воскресеньям" } });
  check(patch.ok(), "клиент сохранил ответ");
  await until(async () => (await q(`select s.name from crm_deals d join crm_stages s on s.id = d.stage_id where d.id = $1`, [deal.id]))[0].name === "Готова к заказу", "сделка перешла дальше");
  check(true, "26 ответов → сделка сама перешла в «Готова к заказу»");
  await admin.goto(`${base}/admin/deals/${deal.id}`);
  check(await admin.getByTestId("deal-books").getByText(/26 из \d+ ответов/).isVisible(), "в карточке сделки виден прогресс книги");
  await shot(admin, "sales-deal-book");

  // ─── 2. «Неразобранное»: принять ответом, отклонить как спам ────────────
  const phoneA = ph("7707");
  await hook([msg(phoneA, "Добрый вечер, сколько стоит книга?", "Асель")]);
  const unsortedDeal = await until(async () => (await q(`select d.* from crm_deals d join crm_conversations c on c.deal_id = d.id where c.chat_id = $1`, [phoneA]))[0], "заявка с нового номера");
  check(unsortedDeal.unsorted, "заявка с нового номера попала в «Неразобранное»");
  await admin.goto(`${base}/admin/deals`);
  check(await admin.locator('[data-stage="Неразобранное"]').getByText("Асель").first().isVisible(), "на доске — колонка «Неразобранное» с заявкой");
  await shot(admin, "sales-unsorted");
  const [convA] = await q(`select id from crm_conversations where chat_id = $1`, [phoneA]);
  await admin.goto(`${base}/admin/chats?c=${convA.id}`);
  await admin.getByLabel("Текст сообщения").fill("Здравствуйте, Асель! От 19 900 ₸, расскажу подробнее.");
  await admin.keyboard.press("Enter");
  await until(async () => !(await q(`select unsorted from crm_deals where id = $1`, [unsortedDeal.id]))[0].unsorted, "ответ принимает заявку");
  check(true, "ответ клиенту в чате принял заявку в работу");

  const phoneSpam = ph("7708");
  await hook([msg(phoneSpam, "Раскрутка Instagram недорого!!!", "Promo")]);
  const spamDeal = await until(async () => (await q(`select d.id from crm_deals d join crm_conversations c on c.deal_id = d.id where c.chat_id = $1`, [phoneSpam]))[0], "спам-заявка");
  await admin.goto(`${base}/admin/deals/${spamDeal.id}`);
  await admin.getByTestId("unsorted-banner").getByRole("button", { name: "Спам" }).click();
  await confirm(admin);
  await admin.waitForURL(/\/admin\/deals$/);
  check((await q(`select 1 from crm_blocklist where value = $1`, [phoneSpam])).length === 1 && !(await q(`select 1 from crm_deals where id = $1`, [spamDeal.id])).length, "спам: сделка удалена, номер в списке спама");
  await hook([msg(phoneSpam, "Ещё раз предлагаем раскрутку", "Promo")]);
  await sleep(800);
  check(!(await q(`select 1 from crm_deals d join crm_conversations c on c.deal_id = d.id where c.chat_id = $1`, [phoneSpam])).length, "новые сообщения со спам-номера заявок не создают");

  // ─── 3. Дубли и объединение ─────────────────────────────────────────────
  await admin.goto(`${base}/admin/deals/new`);
  await admin.fill("input[name=title]", "Асель — книга маме");
  await admin.fill("input[name=contactPhone]", `8${phoneA.slice(1)}`);
  await admin.getByRole("button", { name: "Создать сделку" }).click();
  await admin.waitForURL(/\/admin\/deals\/[0-9a-f-]{36}$/);
  const manualId = admin.url().split("/").pop();
  check(await admin.getByTestId("duplicates").isVisible(), "карточка предупреждает о дубле по телефону (8… и 7… — один номер)");
  await admin.getByTestId("duplicates").getByRole("button", { name: "Объединить сюда" }).click();
  await confirm(admin);
  await until(async () => !(await q(`select 1 from crm_deals where id = $1`, [unsortedDeal.id])).length, "дубль удалён");
  check((await q(`select deal_id from crm_conversations where id = $1`, [convA.id]))[0].deal_id === manualId, "объединение: переписка перешла в основную сделку, дубль удалён");

  // ─── 4. Внутренняя заметка с @упоминанием ───────────────────────────────
  const [mgr] = await q(`select id, name from users where role = 'admin' and email like 'manager%@test.local' and staff_disabled = false order by created_at desc limit 1`);
  const sentBefore = sent.length;
  await admin.goto(`${base}/admin/chats?c=${convA.id}`);
  await admin.getByRole("button", { name: "Заметка для коллег" }).click();
  const box = admin.getByLabel("Текст сообщения");
  await box.fill("Клиентка хочет к юбилею, ");
  await box.pressSequentially(`@${mgr.name.slice(0, 3)}`);
  await admin.getByRole("option", { name: `@${mgr.name}` }).waitFor();
  await admin.keyboard.press("Enter");
  await box.pressSequentially("перезвони завтра");
  await admin.keyboard.press("Enter");
  await until(async () => (await q(`select 1 from crm_messages where conversation_id = $1 and internal and text like '%перезвони завтра%'`, [convA.id])).length, "заметка сохранена");
  check(sent.length === sentBefore, "внутренняя заметка клиенту не отправлена");
  const mention = await until(async () => (await q(`select * from crm_notifications where user_id = $1 and kind = 'mention' order by created_at desc limit 1`, [mgr.id]))[0], "уведомление об упоминании");
  check(mention.link === `/admin/chats?c=${convA.id}`, "упомянутый менеджер получил уведомление со ссылкой на чат");
  await admin.waitForSelector("[data-internal='1']");
  await shot(admin, "sales-internal-note");

  // ─── 5. Ссылка на книгу и персональная скидка из чата ──────────────────
  const phoneB = ph("7709");
  await q(`update users set phone = $2 where id = $1`, [clientUser.id, `+${phoneB}`]);
  await hook([msg(phoneB, "Подскажите, как оформить?", "Салтанат")]);
  const convB = await until(async () => (await q(`select * from crm_conversations where chat_id = $1`, [phoneB]))[0], "диалог клиента");
  check(convB.client_id === clientUser.id && convB.deal_id === deal.id, "сообщение с номера клиента привязалось к его аккаунту и сделке");
  await admin.goto(`${base}/admin/chats?c=${convB.id}`);
  await admin.getByRole("button", { name: "Оплата и скидка" }).click();
  await admin.getByTestId("offers").getByRole("button", { name: /Ссылка на книгу/ }).click();
  const bookMsg = await until(() => sent.find((m) => m.chatId === phoneB && m.text.includes(`/books/${bookId}`)), "ссылка на книгу");
  check(bookMsg.text.startsWith("Ваша книга"), "ссылка на книгу ушла клиенту на его языке");
  await admin.getByRole("button", { name: "Оплата и скидка" }).click();
  await admin.getByLabel("Размер скидки").selectOption("10");
  await admin.getByTestId("offers").getByRole("button", { name: "Отправить" }).click();
  const discountMsg = await until(() => sent.find((m) => m.chatId === phoneB && m.text.includes("промокод")), "скидка");
  const code = /MB-[0-9A-F]{6}/.exec(discountMsg.text)?.[0];
  const [promo] = await q(`select * from promo_codes where code = $1`, [code]);
  check(promo && promo.value === 10 && promo.max_uses === 1 && promo.expires_at > new Date(), "создан одноразовый промокод 10% со сроком действия");
  const url = /https?:\/\/\S+/.exec(discountMsg.text)[0];
  check(url.includes(`/books/${bookId}/checkout?promo=${code}`), "ссылка ведёт на оформление с промокодом");
  await client.goto(url.replace(/^https?:\/\/[^/]+/, base));
  check(await client.getByText(code).first().isVisible().catch(() => false) || (await client.locator(`input[value="${code}"]`).count()) > 0, "по ссылке промокод подставился на странице заказа");

  // ─── 6. Вне рабочего времени: автоответ и заявка без распределения ─────
  const almatyHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Almaty", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  const hh = (h) => `${String((h + 24) % 24).padStart(2, "0")}:00`;
  await setHours(hh(almatyHour + 2), hh(almatyHour + 3));
  await q(`update crm_automations set active = true where name = 'Вне рабочего времени → автоответ'`);
  await sleep(11000); // кэш настроек на сервере — 10 секунд
  const phoneNight = ph("7706");
  await hook([msg(phoneNight, "Здравствуйте, вы работаете?", "Гаухар")]);
  const autoReply = await until(() => sent.find((m) => m.chatId === phoneNight), "автоответ вне графика");
  check(autoReply.text.startsWith("Здравствуйте, Гаухар! Сейчас мы не на связи"), "вне рабочего времени клиенту ушёл автоответ");
  const [nightDeal] = await q(`select d.assignee_id from crm_deals d join crm_conversations c on c.deal_id = d.id where c.chat_id = $1`, [phoneNight]);
  check(nightDeal && nightDeal.assignee_id === null, "ночная заявка не распределена — утром её возьмёт первый на смене");
  await q(`update crm_automations set active = false where name = 'Вне рабочего времени → автоответ'`);
  await setHours("00:00", "00:00");

  // ─── 7. «Забросил книгу» и годовщина повода ─────────────────────────────
  await q(`update users set last_seen_at = now() - interval '6 days' where id = $1`, [clientUser.id]);
  const [paid] = await q(`select o.id, o.user_id, o.book_id from orders o where o.paid_at is not null and o.status <> 'cancelled' order by o.created_at desc limit 1`);
  await q(`update books set occasion = 'wedding', occasion_date = to_char(current_date - interval '1 year' + interval '10 days', 'YYYY-MM-DD') where id = $1`, [paid.book_id]);
  execSync("npx tsx --import ./scripts/preload.mjs scripts/scheduler-once.ts", { stdio: "pipe", env: { ...process.env, SMTP_HOST: "" } });
  check((await q(`select 1 from crm_tasks where deal_id = $1 and title like 'Подтолкнуть%'`, [deal.id])).length === 1, "клиент 6 дней не заходит → менеджеру задача «подтолкнуть»");
  const anniversary = await q(`select t.title, d.source from crm_tasks t join crm_deals d on d.id = t.deal_id where d.client_id = $1 and t.title like 'Предложить книгу к годовщине%'`, [paid.user_id]);
  check(anniversary.length === 1 && anniversary[0].title.includes("("), "за 10 дней до годовщины свадьбы → сделка и задача «предложить книгу»");
  execSync("npx tsx --import ./scripts/preload.mjs scripts/scheduler-once.ts", { stdio: "pipe", env: { ...process.env, SMTP_HOST: "" } });
  check((await q(`select count(*)::int as n from crm_tasks t join crm_deals d on d.id = t.deal_id where d.client_id = $1 and t.title like 'Предложить книгу к годовщине%'`, [paid.user_id]))[0].n === 1, "повторный проход планировщика задач не дублирует");

  // ─── 8. Смена и этапы ───────────────────────────────────────────────────
  const [me] = await q(`select id from users where email = 'admin@mybook.local'`);
  await admin.goto(`${base}/admin`);
  await admin.getByTestId("shift-toggle").click();
  await until(async () => (await q(`select on_shift from users where id = $1`, [me.id]))[0].on_shift === false, "ушёл со смены");
  await admin.getByTestId("shift-toggle").click();
  await until(async () => (await q(`select on_shift from users where id = $1`, [me.id]))[0].on_shift === true, "вернулся на смену");
  check(true, "переключатель «На смене» работает");
  await admin.goto(`${base}/admin/deals/stages`);
  check((await admin.locator("select[name=milestone]").count()) >= 5, "в редакторе этапов — автоперевод по действиям клиента");
  await admin.goto(`${base}/admin/deals/duplicates`);
  check(await admin.getByRole("heading", { name: "Дубли" }).isVisible(), "страница дублей открывается");

  console.log(errors.length ? "BROWSER ERRORS:\n" + errors.join("\n") : "no browser errors");
  console.log("OK: удобства отдела продаж");
} finally {
  await setHours("00:00", "00:00").catch(() => {});
  await browser.close();
  server.close();
  await db.end();
}
