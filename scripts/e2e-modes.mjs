// Новые виды книг: node scripts/e2e-modes.mjs [baseUrl] — автобиография и своя книга создаются через мастер,
// у своей книги добавляются глава и раздел, разделы переставляются, предпросмотр (PDF) и текст книги открываются.
// Оглавление ведём через API (куки сессии те же, что у страницы): так скрипт не зависит от вёрстки редактора.
import { chromium } from "playwright";
const [base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const result = {};
const fail = (what) => {
  console.log(JSON.stringify({ failed: what, result, errors }));
  process.exit(1);
};

await page.goto(`${base}/register?theme=autobiography`);
await page.fill("#name", "Вид");
await page.fill("#email", `modes${Date.now()}@test.local`);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/new/);

/** Создаёт книгу заданной темы через мастер и возвращает её id. */
async function create(theme, fill) {
  await page.goto(`${base}/books/new?theme=${theme}`);
  await page.fill("#authorName", "Бакыт Ахметов");
  await fill();
  await page.click("button[type=submit]");
  await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
  return page.url().split("/").pop();
}

const memoirId = await create("autobiography", async () => {});
result.memoir = memoirId;
const memoir = await page.request.get(`${base}/api/books/${memoirId}/export`);
if (!memoir.ok()) fail("текст автобиографии не открылся");

const blankId = await create("blank", async () => {
  if (await page.locator("#title").count()) await page.fill("#title", "Записки");
});
result.blank = blankId;
const api = (method, path, data) => page.request.fetch(`${base}/api/books/${blankId}${path}`, { method, ...(data ? { data } : {}) });

const chapter = await api("POST", "/chapters", { title: "Дорога домой" });
if (!chapter.ok()) fail(`глава не создалась: ${chapter.status()}`);
const { key } = await chapter.json().then((j) => ({ key: j.key ?? j.chapter?.key ?? j.outline?.chapters?.at(-1)?.key }));
const first = await api("POST", "/questions", { chapterKey: key, title: "Отъезд", prompt: "Что вы взяли с собой?" });
const second = await api("POST", "/questions", { chapterKey: key, title: "Станция", prompt: "" });
if (!first.ok() || !second.ok()) fail("разделы не создались");
const a = (await first.json()).question.id;
const b = (await second.json()).question.id;

const reorder = await api("PUT", "/questions/order", { sections: [{ id: b, chapter: key }, { id: a, chapter: key }] });
if (!reorder.ok()) fail(`перестановка разделов: ${reorder.status()}`);
const edit = await api("PATCH", `/questions/${a}`, { answer: "Взяли одну сумку и фотографию дома." });
if (!edit.ok()) fail(`правка раздела: ${edit.status()}`);

const pdf = await api("GET", "/preview");
result.previewType = pdf.headers()["content-type"];
if (!pdf.ok() || !String(result.previewType).includes("pdf")) fail("предпросмотр не открылся");
const text = await (await api("GET", "/export")).text();
result.hasText = text.includes("Взяли одну сумку");
if (!result.hasText) fail("текст раздела не попал в книгу");

await page.goto(`${base}/books/${blankId}`);
result.header = await page.locator("main, body").first().innerText().then((s) => s.includes("Записки"));
console.log(JSON.stringify({ ok: true, result, errors }));
await browser.close();
process.exit(errors.length ? 1 : 0);
