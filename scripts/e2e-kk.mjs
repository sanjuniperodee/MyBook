// Сквозная проверка казахской версии: node scripts/e2e-kk.mjs [baseUrl] [outDir]
// Проходит путь клиента на /kk/… и ищет на страницах «дырки» — русские слова интерфейса.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "/tmp";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("PAGEERROR " + e.message));
// 400 — ожидаемый ответ на намеренно неверный запрос в проверке ошибок API.
page.on("console", (m) => m.type() === "error" && !/caret-color|status of 400/.test(m.text()) && problems.push("CONSOLE " + m.text()));
const shot = (name) => page.screenshot({ path: `${out}/kk-${name}.png`, fullPage: true });

// Характерные русские слова интерфейса; пользовательский текст в проверку не попадает (его мы пишем по-казахски).
const RUSSIAN = /\b(Сохранено|Сохраняем|Мои книги|Войти|Выйти|Обложка|Заказать|Вопрос|Глава|Письма|Оформление|Фото в ответ|Надиктовать|Следующий|Предыдущий|Бесплатно|Доставка|Итого|Создать|Подарочный|Новая книга|страниц|ответов|Загружаем)\b|[ёщъ]/i;
async function checkNoRussian(label) {
  const text = await page.evaluate(() => {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll("script,style,textarea,input,[data-user-content]").forEach((n) => n.remove());
    return clone.innerText;
  });
  const lang = await page.evaluate(() => document.documentElement.lang);
  if (lang !== "kk") problems.push(`${label}: html lang=${lang}`);
  const hits = text.split("\n").filter((l) => RUSSIAN.test(l));
  if (hits.length) problems.push(`${label}: русские строки → ${hits.slice(0, 5).join(" | ")}`);
}

await page.goto(`${base}/kk`);
await checkNoRussian("главная");
await shot("01-landing");

const email = `kk${Date.now()}@test.local`;
await page.goto(`${base}/kk/register?theme=mom`);
await checkNoRussian("регистрация");
await page.fill("#name", "Айгерім");
await page.fill("#email", email);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/kk\/books\/new/);
await checkNoRussian("мастер");
// Язык книги по умолчанию — язык сайта
const kkChecked = await page.getByRole("radio", { name: "Қазақша" }).getAttribute("aria-checked");
if (kkChecked !== "true") problems.push("мастер: язык книги по умолчанию не казахский");
await page.fill("#recipientName", "Гүлнар");
await shot("02-wizard");
await page.click("button[type=submit]");
await page.waitForURL(/\/kk\/books\/[0-9a-f-]{36}$/);
const bookUrl = page.url();
await page.getByText("Алғысөздің орнына").first().waitFor({ timeout: 15000 }).catch(() => problems.push("обзор: главы не на казахском"));
await checkNoRussian("обзор книги");
await shot("03-hub");

await page.goto(`${bookUrl}/questions?q=1`);
await page.waitForSelector("#answer");
await checkNoRussian("редактор");
const prompt = await page.innerText("h1");
if (!/[әғқңөұүі]/i.test(prompt)) problems.push(`редактор: вопрос не на казахском: ${prompt}`);
await page.fill("#answer", "Анашым, бұл кітапты саған арнаймын. Балалық шағымның ең жылы естеліктері сенімен байланысты.");
await page.waitForTimeout(1800);
await shot("04-editor");
await page.reload();
if (!(await page.inputValue("#answer")).startsWith("Анашым")) problems.push("редактор: ответ не сохранился");

for (const [sub, label] of [["cover", "обложка"], ["pages", "страницы"], ["photos", "фото"], ["letters", "письма"], ["settings", "оформление"], ["preview", "макет"], ["checkout", "заказ"]]) {
  await page.goto(`${bookUrl}/${sub}`);
  await page.waitForLoadState("networkidle");
  await checkNoRussian(label);
  await shot(`05-${sub}`);
}

const id = bookUrl.split("/").pop();
const pdf = await page.request.get(`${base}/api/books/${id}/preview?v=1`);
if (pdf.status() !== 200 || !(pdf.headers()["content-type"] ?? "").includes("pdf")) problems.push(`превью PDF: ${pdf.status()}`);

// API отвечает ошибками на языке страницы
const err = await page.evaluate(async (bid) => {
  const r = await fetch(`/api/books/${bid}`, { method: "PATCH", headers: { "Content-Type": "application/json", "x-mb-locale": "kk" }, body: JSON.stringify({ format: "nope" }) });
  return r.json();
}, id);
if (err.error !== "Белгісіз формат" || err.code !== "unknownFormat") problems.push(`API ошибка: ${JSON.stringify(err)}`);

// Смена языка книги переводит стандартные вопросы, ответ остаётся
await page.goto(`${bookUrl}/settings`);
await page.locator("#language").getByRole("button", { name: "Русский" }).click();
await page.getByRole("dialog").getByRole("button").last().click();
await page.waitForTimeout(1500);
await page.goto(`${bookUrl}/questions?q=1`);
const ruPrompt = await page.innerText("h1");
if (!/Представьтесь/.test(ruPrompt)) problems.push(`смена языка книги: вопрос не перевёлся: ${ruPrompt}`);
if (!(await page.inputValue("#answer")).startsWith("Анашым")) problems.push("смена языка книги: ответ потерялся");
// …а интерфейс остаётся казахским (сам текст книги теперь русский — его не проверяем)
for (const label of ["Мәтін", "Шолу", "Өз сұрағым"]) if (!(await page.getByText(label).first().isVisible())) problems.push(`интерфейс после смены языка книги: нет «${label}»`);

// Переключатель интерфейса ведёт на ту же страницу по-русски и запоминается
await page.locator("[role=group] button[lang=ru]:visible").first().click();
await page.waitForURL((u) => !u.pathname.startsWith("/kk"));
const lang = await page.evaluate(() => document.documentElement.lang);
if (lang !== "ru") problems.push(`переключатель: lang=${lang}`);
await page.goto(`${base}/books`);
if (new URL(page.url()).pathname.startsWith("/kk")) problems.push(`переключатель: выбор не запомнился (${page.url()}; ${(await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join(" ")})`);
await shot("06-switched-ru");

console.log(problems.length ? "PROBLEMS:\n" + problems.join("\n") : "OK: казахская версия без дыр");
await browser.close();
process.exit(problems.length ? 1 : 0);
