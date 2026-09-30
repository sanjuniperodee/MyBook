// Сквозная проверка CRM уровня amoCRM: роли и права, сделки, чаты Wazzup, телефония Zadarma, автоматизации.
// Поднимает мок-сервер Wazzup/Zadarma на :4010. Запуск: node scripts/e2e-crm-pro.mjs [baseUrl] [outDir]
import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import pg from "pg";
import { chromium } from "playwright";

const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const MOCK = 4010;
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://mybook:mybook@localhost:5432/mybook" });
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const check = (cond, msg) => {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("✓", msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, msg, timeout = 8000) {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > timeout) throw new Error("TIMEOUT: " + msg);
    await sleep(250);
  }
}

// ─── мок провайдеров ────────────────────────────────────────────────────────
const mock = { sent: [], webhooks: [], callbacks: [] };
let outN = 0;
const server = http.createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const url = new URL(req.url, `http://localhost:${MOCK}`);
  const json = (code, data) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  if (url.pathname.startsWith("/v3/") && req.headers.authorization !== "Bearer test-key") return json(401, { error: "unauthorized" });
  if (url.pathname === "/v3/channels") return json(200, [{ channelId: "ch-wa-1", transport: "whatsapp", plainId: "77001112233", state: "active" }]);
  if (url.pathname === "/v3/webhooks") {
    mock.webhooks.push(JSON.parse(body));
    return json(200, { ok: true });
  }
  if (url.pathname === "/v3/message") {
    mock.sent.push(JSON.parse(body));
    return json(201, { messageId: `out-${++outN}`, chatId: JSON.parse(body).chatId });
  }
  if (url.pathname === "/v1/request/callback/") {
    mock.callbacks.push({ query: url.search, auth: req.headers.authorization });
    return json(200, { status: "success", from: url.searchParams.get("from"), to: url.searchParams.get("to") });
  }
  if (url.pathname === "/v1/pbx/record/request/") return json(200, { status: "success", link: `http://localhost:${MOCK}/rec.mp3` });
  if (url.pathname === "/rec.mp3") {
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    return res.end(Buffer.alloc(2048, 7));
  }
  json(404, { error: "not found" });
});
await new Promise((r) => server.listen(MOCK, r));

// Zadarma по-своему подписывает: base64 от HEX-строки HMAC-SHA1.
const zsign = (data, secret) => Buffer.from(createHmac("sha1", secret).update(data).digest("hex")).toString("base64");
async function zadarma(params, { secret = "zsecret" } = {}) {
  const signed = {
    NOTIFY_START: () => params.caller_id + params.called_did + params.call_start,
    NOTIFY_INTERNAL: () => params.caller_id + params.called_did + params.call_start,
    NOTIFY_END: () => params.caller_id + params.called_did + params.call_start,
    NOTIFY_OUT_START: () => params.internal + params.destination + params.call_start,
    NOTIFY_OUT_END: () => params.internal + params.destination + params.call_start,
    NOTIFY_RECORD: () => params.pbx_call_id + params.call_id_with_rec,
  }[params.event]();
  return fetch(`${base}/api/integrations/zadarma`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Signature: zsign(signed, secret) }, body: new URLSearchParams(params) });
}

// Тест не должен зависеть от времени суток: рабочее время — круглосуточно.
await q(`insert into crm_settings (key, value) values ('crm.workHours', '{"days":[1,2,3,4,5,6,7],"from":"00:00","to":"00:00"}') on conflict (key) do update set value = excluded.value`);
// Адрес Zadarma API — на мок (в проде это https://api.zadarma.com по умолчанию).
await q(`insert into crm_settings (key, value) values ('zadarma.baseUrl', $1) on conflict (key) do update set value = excluded.value`, [`http://localhost:${MOCK}`]);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
async function login(email, password) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  await page.goto(`${base}/login?next=/admin`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === "/admin");
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
const stamp = Date.now();

try {
  const admin = await login("admin@mybook.local", "admin12345");
  check(await admin.getByRole("link", { name: "Интеграции" }).isVisible(), "руководитель видит все разделы меню");

  // ─── интеграции ──────────────────────────────────────────────────────────
  await admin.goto(`${base}/admin/settings`);
  await admin.fill("input[name=apiKey]", "test-key");
  await admin.fill("input[name=baseUrl]", `http://localhost:${MOCK}`);
  await admin.locator("form", { has: admin.locator("input[name=apiKey]") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForSelector("text=ключ сохранён");
  await admin.getByRole("button", { name: "Проверить" }).click();
  await admin.waitForSelector("text=Подключено. Каналов: 1");
  await admin.selectOption("select[name=channelId]", "ch-wa-1");
  await admin.locator("form", { has: admin.locator("select[name=channelId]") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForSelector("text=Сохранено");
  await admin.getByRole("button", { name: "Подключить вебхук" }).click();
  await admin.waitForSelector("text=Вебхук подключён");
  const hookUri = mock.webhooks.at(-1)?.webhooksUri ?? "";
  check(hookUri.startsWith(`${base.replace("localhost", "localhost")}`) || hookUri.includes("/api/integrations/wazzup?token="), "Wazzup: вебхук зарегистрирован с секретным токеном");
  const token = new URL(hookUri).searchParams.get("token");
  const secretRow = (await q(`select value from crm_settings where key = 'wazzup.apiKey'`))[0];
  check(secretRow && !secretRow.value.includes("test-key") && secretRow.value.startsWith("v1."), "API-ключ хранится в базе зашифрованным");

  await admin.getByText("Zadarma", { exact: true }).click();
  await admin.fill("input[name=zadarmaKey]", "zkey");
  await admin.fill("input[name=zadarmaSecret]", "zsecret");
  await admin.locator("form", { has: admin.locator("input[name=zadarmaKey]") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForSelector("text=Сохранено");
  await shot(admin, "crm-settings");

  // ─── команда: менеджер и своя роль ──────────────────────────────────────
  await admin.goto(`${base}/admin/team`);
  const managerEmail = `manager${stamp}@test.local`;
  await admin.fill("input[name=email]", managerEmail);
  await admin.fill("input[name=name]", "Айгерим");
  await admin.fill("input[name=extension]", String(100 + (stamp % 800)));
  await admin.fill("input[name=password]", "manager12345");
  await admin.getByRole("button", { name: "Добавить" }).click();
  await admin.waitForSelector(`text=${managerEmail}`);
  const managerExt = String(100 + (stamp % 800));
  const [manager] = await q(`select id from users where email = $1`, [managerEmail]);
  check(!!manager, "сотрудник создан с ролью «Менеджер продаж» и внутренним номером");
  // Остальные менеджеры из прошлых прогонов не должны мешать распределению по кругу.
  await q(`update users set staff_disabled = true where role = 'admin' and email like 'manager%@test.local' and id <> $1`, [manager.id]);
  // Внутренний номер руководителю — для «Позвонить».
  const [me] = await q(`select id from users where email = 'admin@mybook.local'`);
  await admin.locator("tr", { hasText: "admin@mybook.local" }).getByLabel("Внутренний номер").fill("99");
  await admin.locator("tr", { hasText: "admin@mybook.local" }).getByLabel("Внутренний номер").blur();
  await until(async () => (await q(`select sip_extension from users where id = $1`, [me.id]))[0].sip_extension === "99", "номер руководителя сохранён");

  await admin.goto(`${base}/admin/team/roles`);
  await admin.getByRole("button", { name: "Новая роль" }).click();
  const roleForm = admin.locator("form", { has: admin.getByRole("button", { name: "Создать роль" }) });
  await roleForm.getByPlaceholder("Название роли").fill(`Стажёр ${stamp}`);
  await roleForm.getByText("Только свои").click();
  await roleForm.getByRole("button", { name: "Создать роль" }).click();
  await admin.waitForSelector(`input[value="Стажёр ${stamp}"]`);
  const [internRole] = await q(`select id, scope, permissions from crm_roles where name = $1`, [`Стажёр ${stamp}`]);
  check(internRole?.scope === "own" && !internRole.permissions.includes("clients.contacts"), "своя роль «Стажёр»: только свои, без контактов");
  const internEmail = `intern${stamp}@test.local`;
  await admin.goto(`${base}/admin/team`);
  await admin.fill("input[name=email]", internEmail);
  await admin.selectOption("select[name=roleId]", internRole.id);
  await admin.fill("input[name=password]", "intern12345");
  await admin.getByRole("button", { name: "Добавить" }).click();
  await admin.waitForSelector(`text=${internEmail}`);

  // ─── входящее из WhatsApp ───────────────────────────────────────────────
  const hook = (body, t = token) => fetch(`${base}/api/integrations/wazzup?token=${t}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  check((await hook({ test: true })).status === 200, "Wazzup: тестовый запрос → 200");
  check((await hook({ test: true }, "wrong")).status === 403, "Wazzup: чужой токен → 403");
  const phone = `7701${String(stamp).slice(-7)}`;
  const inMsg = { messageId: `in-${stamp}-1`, dateTime: new Date().toISOString(), channelId: "ch-wa-1", chatType: "whatsapp", chatId: phone, type: "text", isEcho: false, text: "Здравствуйте! Хочу книгу для мамы к юбилею", contact: { name: "Гульнара" } };
  check((await hook({ messages: [inMsg] })).status === 200, "Wazzup: входящее сообщение принято");
  await hook({ messages: [inMsg] }); // повторная доставка
  const [conv] = await q(`select * from crm_conversations where chat_id = $1`, [phone]);
  check(conv && conv.unread === 1 && conv.awaiting_since, "диалог создан, 1 непрочитанное, клиент ждёт ответа (повтор вебхука не задвоил)");
  const [deal] = await q(`select d.*, s.name as stage from crm_deals d join crm_stages s on s.id = d.stage_id where d.id = $1`, [conv.deal_id]);
  check(deal && deal.stage === "Новая заявка" && deal.source === "whatsapp", "по новому номеру создана сделка «Новая заявка» из WhatsApp");
  check(deal.assignee_id === manager.id && conv.assignee_id === manager.id, "автоматизация распределила заявку менеджеру по кругу");
  const [notif] = await q(`select * from crm_notifications where user_id = $1 and kind = 'message' order by created_at desc limit 1`, [manager.id]);
  check(notif && notif.title.includes("Гульнара"), "менеджеру пришло уведомление о сообщении");

  // ─── ответ из CRM ───────────────────────────────────────────────────────
  await admin.goto(`${base}/admin/chats`);
  await admin.getByTestId("chat-list").getByText("Гульнара").first().click();
  await admin.waitForSelector("text=Хочу книгу для мамы");
  await admin.getByRole("button", { name: "Шаблоны" }).click();
  await admin.getByRole("button", { name: /Приветствие/ }).click();
  const filled = await admin.getByLabel("Текст сообщения").inputValue();
  check(filled.includes("Гульнара"), "шаблон подставил имя клиента");
  await admin.getByLabel("Текст сообщения").fill("Здравствуйте, Гульнара! Расскажу, как всё устроено 🙂");
  await admin.keyboard.press("Enter");
  await until(() => mock.sent.find((m) => m.chatId === phone && m.text.includes("Расскажу")), "сообщение ушло в Wazzup");
  const sent = mock.sent.find((m) => m.chatId === phone);
  check(sent.channelId === "ch-wa-1" && sent.chatType === "whatsapp" && sent.crmMessageId, "в Wazzup ушли channelId, chatType, chatId и crmMessageId");
  await until(async () => (await q(`select status from crm_messages where external_id = 'out-1'`))[0]?.status === "sent", "исходящее получило messageId и статус «отправлено»");
  await hook({ statuses: [{ messageId: "out-1", timestamp: new Date().toISOString(), status: "read" }] });
  await hook({ statuses: [{ messageId: "out-1", timestamp: new Date().toISOString(), status: "delivered" }] }); // опоздавший статус
  check((await q(`select status from crm_messages where external_id = 'out-1'`))[0].status === "read", "статус «прочитано» не откатывается опоздавшим «доставлено»");
  await hook({ messages: [{ ...inMsg, messageId: "out-1", isEcho: true, text: "Здравствуйте, Гульнара! Расскажу, как всё устроено 🙂" }] });
  check((await q(`select count(*)::int as n from crm_messages where conversation_id = $1`, [conv.id]))[0].n === 2, "эхо своего сообщения не задвоилось");
  const [conv2] = await q(`select * from crm_conversations where id = $1`, [conv.id]);
  check(conv2.unread === 0 && !conv2.awaiting_since, "после ответа диалог прочитан и не ждёт ответа");
  await shot(admin, "crm-chats");

  // ─── карточка сделки ────────────────────────────────────────────────────
  await admin.goto(`${base}/admin/deals/${deal.id}`);
  await admin.getByTestId("stage-bar").getByRole("button", { name: "Взяли в работу" }).click();
  await until(async () => (await q(`select s.name from crm_deals d join crm_stages s on s.id = d.stage_id where d.id = $1`, [deal.id]))[0].name === "Взяли в работу", "сделка переведена на этап «Взяли в работу»");
  await admin.fill("input[name=amount]", "45000");
  await admin.locator("form", { has: admin.locator("input[name=amount]") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForSelector("text=Сохранено");
  await admin.getByPlaceholder("Новая задача: перезвонить, уточнить адрес…").fill("Отправить примеры книг");
  await admin.getByRole("button", { name: "Добавить" }).click();
  await admin.waitForSelector("text=Отправить примеры книг");
  await admin.getByPlaceholder("Что обсудили, о чём договорились…").fill("Юбилей 12 ноября, нужна печатная версия");
  await admin.locator("form", { has: admin.getByPlaceholder("Что обсудили, о чём договорились…") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForSelector("text=Юбилей 12 ноября");
  check(await admin.getByText("Здравствуйте! Хочу книгу для мамы").isVisible(), "переписка видна прямо в карточке сделки");
  await shot(admin, "crm-deal");

  // ─── телефония ──────────────────────────────────────────────────────────
  check((await (await fetch(`${base}/api/integrations/zadarma?zd_echo=abc123`)).text()) === "abc123", "Zadarma: проверка адреса zd_echo");
  const callStart = new Date().toISOString().slice(0, 19).replace("T", " ");
  const pbxId = `in-${stamp}`;
  const startP = { event: "NOTIFY_START", call_start: callStart, pbx_call_id: pbxId, caller_id: `+${phone}`, called_did: "77272000000" };
  check((await zadarma(startP, { secret: "wrong" })).status === 403, "Zadarma: неверная подпись → 403");
  check((await zadarma(startP)).status === 200, "Zadarma: начало входящего звонка");
  await zadarma({ event: "NOTIFY_INTERNAL", call_start: callStart, pbx_call_id: pbxId, caller_id: `+${phone}`, called_did: "77272000000", internal: managerExt });
  const managerPage = await login(managerEmail, "manager12345");
  await managerPage.waitForSelector("[data-testid=incoming-call]", { timeout: 12000 });
  check(await managerPage.getByTestId("incoming-call").getByText("Гульнара").isVisible(), "менеджеру всплыла карточка входящего звонка с именем клиента");
  await shot(managerPage, "crm-incoming-call");
  await zadarma({ event: "NOTIFY_END", call_start: callStart, pbx_call_id: pbxId, caller_id: `+${phone}`, called_did: "77272000000", internal: managerExt, duration: "0", disposition: "no answer", status_code: "16", is_recorded: "0" });
  await zadarma({ event: "NOTIFY_END", call_start: callStart, pbx_call_id: pbxId, caller_id: `+${phone}`, called_did: "77272000000", internal: managerExt, duration: "0", disposition: "no answer", status_code: "16", is_recorded: "0" });
  const [missed] = await q(`select * from crm_calls where external_id = $1`, [pbxId]);
  check(missed.status === "missed" && missed.staff_id === manager.id && missed.deal_id === deal.id, "пропущенный звонок привязан к менеджеру и сделке");
  const tasks = await q(`select * from crm_tasks where deal_id = $1 and title like 'Перезвонить%'`, [deal.id]);
  check(tasks.length === 1 && tasks[0].assignee_id === manager.id && tasks[0].kind === "call", "автоматизация: одна задача «Перезвонить» ответственному (повтор события не задвоил)");

  // Звонок из CRM → Zadarma callback с подписью
  await admin.goto(`${base}/admin/deals/${deal.id}`);
  await admin.getByRole("button", { name: "Позвонить" }).click();
  await until(() => mock.callbacks.length, "Zadarma получила запрос на звонок");
  const cb = mock.callbacks.at(-1);
  const cbq = new URLSearchParams(cb.query);
  check(cbq.get("from") === "99" && cbq.get("to") === phone, "callback: с внутреннего номера сотрудника на номер клиента");
  const paramStr = cb.query.slice(1);
  const expected = `zkey:${zsign("/v1/request/callback/" + paramStr + createHash("md5").update(paramStr).digest("hex"), "zsecret")}`;
  check(cb.auth === expected, "callback подписан по алгоритму Zadarma");
  const outId = `out-${stamp}`;
  await zadarma({ event: "NOTIFY_OUT_START", call_start: callStart, pbx_call_id: outId, internal: "99", destination: phone });
  await zadarma({ event: "NOTIFY_OUT_END", call_start: callStart, pbx_call_id: outId, internal: "99", destination: phone, duration: "95", disposition: "answered", status_code: "16", is_recorded: "1", call_id_with_rec: `rec-${stamp}` });
  const [outCall] = await q(`select * from crm_calls where external_id = $1`, [outId]);
  check(outCall.status === "answered" && outCall.duration_sec === 95 && outCall.has_recording && outCall.staff_id === me.id, "исходящий: разговор 1:35, есть запись");
  check(!!(await q(`select handled_at from crm_calls where id = $1`, [missed.id]))[0].handled_at, "дозвонились — пропущенный отмечен обработанным");
  const rec = await admin.request.get(`${base}/api/admin/calls/${outCall.id}/recording`);
  check(rec.ok() && rec.headers()["content-type"] === "audio/mpeg" && (await rec.body()).length === 2048, "запись разговора отдаётся через наш сервер");
  check((await q(`select count(*)::int as n from crm_audit where action = 'call.recording' and entity_id = $1`, [outCall.id]))[0].n >= 1, "прослушивание записи попало в журнал действий");

  // Универсальный вебхук АТС
  await admin.goto(`${base}/admin/settings`);
  await admin.getByText("Другая АТС (вебхук)").click();
  await admin.locator("form", { has: admin.getByText("Другая АТС (вебхук)") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForSelector("text=Адрес вебхука (токен можно передать и заголовком X-Token)");
  const [{ value: pbxEnc }] = await q(`select value from crm_settings where key = 'pbx.token'`);
  check(pbxEnc.startsWith("v1."), "токен своей АТС создан и зашифрован");
  const pbxUrl = await admin.locator("input[readonly]").last().inputValue();
  const pbx = (b, url = pbxUrl) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  check((await pbx({ event: "end", callId: "x" }, `${base}/api/integrations/pbx?token=bad`)).status === 403, "своя АТС: неверный токен → 403");
  const boom = await pbx({ event: "boom" });
  if (boom.status !== 400) console.log("pbx debug", pbxUrl, boom.status, await boom.text());
  check(boom.status === 400, "своя АТС: неверный формат → 400");
  const newPhone = `7702${String(stamp).slice(-7)}`;
  check((await pbx({ event: "start", callId: `g-${stamp}`, direction: "in", phone: `8${newPhone.slice(1)}` })).ok, "своя АТС: входящий с номера в формате 8…");
  await pbx({ event: "end", callId: `g-${stamp}`, direction: "in", phone: `8${newPhone.slice(1)}`, duration: 0 });
  const [gCall] = await q(`select c.*, d.title from crm_calls c left join crm_deals d on d.id = c.deal_id where c.external_id = $1`, [`g-${stamp}`]);
  check(gCall.client_phone === newPhone && gCall.status === "missed" && gCall.title?.startsWith("Звонок: +7"), "номер нормализован, по пропущенному с нового номера создана сделка");

  // ─── автоматизация: автоответ ───────────────────────────────────────────
  await admin.goto(`${base}/admin/automations`);
  check((await admin.getByTestId("automation").count()) >= 3, "базовые автоматизации на месте");
  await admin.getByRole("button", { name: "Новое правило" }).click();
  await admin.getByPlaceholder("Название правила").fill(`Автоответ ${stamp}`);
  await admin.getByLabel("Событие").selectOption("message.incoming");
  await admin.getByLabel("Действие").first().selectOption("send_message");
  await admin.getByPlaceholder("Здравствуйте, {имя}! Получили ваше сообщение…").fill("Спасибо, {имя}! Ответим в течение 15 минут.");
  await admin.getByRole("button", { name: "Сохранить правило" }).click();
  await admin.waitForSelector(`text=Автоответ ${stamp}`);
  const phone3 = `7705${String(stamp).slice(-7)}`;
  await hook({ messages: [{ ...inMsg, messageId: `in-${stamp}-3`, chatId: phone3, contact: { name: "Динара" }, text: "Сколько стоит?" }] });
  await until(() => mock.sent.find((m) => m.chatId === phone3), "автоответ ушёл");
  check(mock.sent.find((m) => m.chatId === phone3).text === "Спасибо, Динара! Ответим в течение 15 минут.", "автоответ с подставленным именем");
  await q(`update crm_automations set active = false where name = $1`, [`Автоответ ${stamp}`]);

  // ─── SLA: клиент ждёт ответа ────────────────────────────────────────────
  await q(`update crm_conversations set awaiting_since = now() - interval '20 minutes' where chat_id = $1`, [phone3]);
  const { execSync } = await import("node:child_process");
  execSync("npx tsx --import ./scripts/preload.mjs scripts/scheduler-once.ts", { stdio: "pipe", env: { ...process.env, SMTP_HOST: "" } });
  const sla = await q(`select n.* from crm_notifications n join crm_conversations c on n.link = '/admin/chats?c=' || c.id where c.chat_id = $1 and n.kind = 'sla'`, [phone3]);
  check(sla.length >= 1, "SLA: уведомление «клиент ждёт ответа 15 минут»");

  // ─── права: менеджер и стажёр ───────────────────────────────────────────
  await managerPage.goto(`${base}/admin`);
  check(await managerPage.getByTestId("my-day").isVisible(), "у менеджера без аналитики — «Мой день» вместо выручки");
  check(!(await managerPage.getByRole("link", { name: "Команда" }).count()) && !(await managerPage.getByRole("link", { name: "Интеграции" }).count()), "в меню менеджера нет «Команды» и «Интеграций»");
  check(Number(await managerPage.getByTestId("bell-count").innerText()) >= 1, "колокольчик показывает непрочитанные уведомления");
  check((await managerPage.goto(`${base}/admin/team`)).status() === 404, "менеджер: /admin/team → 404");
  await managerPage.goto(`${base}/admin/deals`);
  check(await managerPage.getByTestId("deals-board").getByText("Заявка из WhatsApp: Гульнара").isVisible(), "менеджер видит свою сделку в воронке");
  await shot(managerPage, "crm-deals-board");

  const intern = await login(internEmail, "intern12345");
  check((await intern.goto(`${base}/admin/deals/${deal.id}`)).status() === 404, "стажёр («только свои») не открывает чужую сделку");
  await intern.goto(`${base}/admin/deals`);
  check(!(await intern.getByText("Заявка из WhatsApp: Гульнара").count()), "чужая сделка не видна стажёру в воронке");
  const [internUser] = await q(`select id from users where email = $1`, [internEmail]);
  await q(`update crm_deals set assignee_id = $1 where id = $2`, [internUser.id, gCall.deal_id]);
  await intern.goto(`${base}/admin/deals/${gCall.deal_id}`);
  const masked = await intern.getByTestId("masked-contacts").innerText();
  check(masked.includes("•••") && !masked.includes(newPhone.slice(-4) + newPhone.slice(-2)), "стажёр без права на контакты видит телефон замаскированным");
  check((await intern.request.get(`${base}/api/admin/export/clients`)).status() === 403, "стажёр не может выгрузить базу");

  // ─── аналитика и журнал ─────────────────────────────────────────────────
  await admin.goto(`${base}/admin/analytics`);
  check(await admin.getByTestId("leaderboard").getByText("Айгерим").first().isVisible(), "аналитика: менеджер в рейтинге");
  await shot(admin, "crm-analytics");
  await admin.goto(`${base}/admin/team/audit`);
  check(await admin.getByText("Прослушал запись звонка").first().isVisible(), "журнал действий фиксирует прослушивание записи");
  await admin.goto(`${base}/admin/calls`);
  check(await admin.getByText("пропущен").first().isVisible(), "журнал звонков");
  await shot(admin, "crm-calls");
  await admin.goto(`${base}/admin/search?q=${phone.slice(-7)}`);
  check(await admin.getByText("Сделки ·").isVisible() && (await admin.getByText("Чаты ·").isVisible()), "глобальный поиск находит сделку и чат по телефону");

  console.log(errors.length ? "BROWSER ERRORS:\n" + errors.join("\n") : "no browser errors");
  console.log("OK: CRM — роли, сделки, чаты, телефония, автоматизации");
} finally {
  await browser.close();
  server.close();
  await db.end();
}
