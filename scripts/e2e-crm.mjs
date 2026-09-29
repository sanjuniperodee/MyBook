// Сквозная проверка CRM: node scripts/e2e-crm.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const check = (cond, msg) => {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("✓", msg);
};

// Клиент с незаконченной книгой — для напоминания
const client = await (await browser.newContext()).newPage();
const stamp = Date.now();
const email = `crm${stamp}@test.local`;
const taskTitle = `Перезвонить Жанель в пятницу #${stamp}`;
await client.goto(`${base}/register?theme=friend`);
await client.fill("#name", "Жанель");
await client.fill("#email", email);
await client.fill("#password", "secret123");
await client.check("input[name=consent]");
await client.click("button[type=submit]");
await client.waitForURL(/\/books\/new/);
await client.fill("#recipientName", "Мадина");
await client.click("button[type=submit]");
await client.waitForURL(/\/books\/[0-9a-f-]{36}$/);

await page.goto(`${base}/login?next=/admin`);
await page.fill("#email", "admin@mybook.local");
await page.fill("#password", "admin12345");
await page.click("button[type=submit]");
await page.waitForURL((u) => u.pathname === "/admin");
check(await page.getByText("Выручка по дням").isVisible(), "дашборд открывается");

// Глобальный поиск по e-mail клиента
await page.fill("input[name=q]", email);
await page.keyboard.press("Enter");
await page.waitForURL(/\/admin\/search/);
await page.getByRole("link", { name: /Жанель/ }).first().click();
await page.waitForURL(/\/admin\/clients\//);
check(await page.getByText("История общения").isVisible(), "карточка клиента из поиска");

// Теги, заметка, задача, напоминание
await page.getByRole("button", { name: "+ vip" }).click();
await page.waitForTimeout(800);
await page.getByPlaceholder("Что обсудили, о чём договорились…").fill("Позвонила, обещала дописать к выходным");
await page.locator("form", { has: page.getByPlaceholder("Что обсудили, о чём договорились…") }).getByRole("button", { name: "Сохранить" }).click();
await page.waitForSelector("text=Позвонила, обещала дописать к выходным");
check(true, "заметка сохранена");
await page.getByPlaceholder(/Новая задача/).fill(taskTitle);
await page.getByRole("button", { name: "Добавить", exact: true }).click();
await page.waitForSelector(`text=${taskTitle}`);
check(true, "задача создана");
await page.getByRole("button", { name: /Напомнить дописать книгу/ }).click();
await page.waitForSelector("text=Напоминание отправлено");
check(true, "напоминание отправлено");
await page.reload();
check(await page.getByText("Отправлено напоминание дописать книгу").isVisible(), "напоминание записано в историю");
check(await page.locator("span", { hasText: /^vip$/ }).count() > 0, "тег vip сохранён");

// Сегмент VIP
await page.goto(`${base}/admin/clients?segment=vip`);
check(await page.getByText("Жанель").first().isVisible(), "клиент в сегменте VIP");

// Задачи: выполнить
await page.goto(`${base}/admin/tasks`);
const row = page.locator("li", { hasText: taskTitle });
await row.locator("input[type=checkbox]").check();
await page.waitForTimeout(1000);
await page.goto(`${base}/admin/tasks?done=1`);
check(await page.getByText(taskTitle).isVisible(), "задача выполнена");

// Массовая смена статуса
await page.goto(`${base}/admin/orders?status=paid`);
const boxes = page.locator("tbody input[type=checkbox]");
const count = await boxes.count();
check(count >= 2, `есть оплаченные заказы (${count})`);
await boxes.nth(0).check();
await boxes.nth(1).check();
page.once("dialog", (d) => d.accept());
await page.locator("select").filter({ hasText: "В производстве" }).last().selectOption("in_production");
await page.getByRole("button", { name: "Применить" }).click();
await page.waitForSelector("text=Обновлено заказов: 2");
check(true, "массовая смена статуса");

// CSV
const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "CSV" }).click()]);
const path = `${out}/orders.csv`;
await dl.saveAs(path);
check((await import("node:fs")).readFileSync(path, "utf8").includes("Номер;Создан"), "CSV заказов выгружается");

// Доска и ответственный
await page.goto(`${base}/admin/board`);
check(await page.getByRole("heading", { name: "Производство" }).isVisible(), "канбан открывается");
const firstOrder = page.locator("article a").first();
await firstOrder.click();
await page.waitForURL(/\/admin\/orders\//);
const select = page.getByLabel("Ответственный");
await select.selectOption({ index: 1 });
await page.waitForTimeout(1200);
await page.reload();
check((await page.getByLabel("Ответственный").inputValue()) !== "", "ответственный назначен");

await page.goto(`${base}/admin/books?f=stalled`);
check(await page.getByRole("heading", { name: "Книги" }).isVisible(), "раздел книг");
console.log(errors.length ? "PAGE ERRORS:\n" + errors.join("\n") : "no page errors");
await browser.close();
