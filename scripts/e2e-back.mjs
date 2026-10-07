// Задняя сторона обложки в редакторе: варианты, готовые фразы, фото, сохранение и печатный PDF.
// node scripts/e2e-back.mjs [base] [outDir]
import { chromium } from "playwright";
import sharp from "sharp";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) process.exitCode = 1;
};
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push("CONSOLE " + m.text()));
const preview = (name) => page.locator("div.max-w-\\[340px\\]").first().screenshot({ path: `${out}/${name}-preview.png` });
const saved = () => page.getByText("Сохранено").first().waitFor({ timeout: 8000 }).then(() => true, () => false);

await page.goto(`${base}/register`);
await page.fill("#name", "Алия");
await page.fill("#email", `back${Date.now()}@test.local`);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/new/);
await page.getByRole("button", { name: /Любимому/ }).click();
await page.fill("#recipientName", "Марғұлан");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
const bookUrl = page.url();

// Фото в книгу — для варианта «Фото».
const photo = `${out}/back-photo.jpg`;
await sharp({ create: { width: 2400, height: 1800, channels: 3, background: { r: 196, g: 150, b: 132 } } })
  .composite([{ input: Buffer.from('<svg width="2400" height="1800"><circle cx="1200" cy="760" r="420" fill="#f4d7c3"/><rect y="1250" width="2400" height="550" fill="#748c6f"/></svg>') }])
  .jpeg()
  .toFile(photo);
await page.goto(`${bookUrl}/photos`);
await page.setInputFiles("input[type=file]", [photo]);
await page.waitForTimeout(3000);

await page.goto(`${bookUrl}/cover`);
await page.getByRole("button", { name: /Лён/ }).first().click();
await page.getByRole("radio", { name: "Оборот" }).click();
check(await page.locator("img[src*='-back.svg']").first().isVisible(), "превью оборота с фоном задней крышки");
await page.getByRole("radio", { name: /Цитата/ }).click();
await page.getByRole("button", { name: "Каждая страница этой книги — о тебе." }).click();
check(await saved(), "готовая фраза сохранена");
check(await page.getByText("Каждая страница этой книги — о тебе.").count() >= 2, "фраза видна на обороте");
await page.locator("main").screenshot({ path: `${out}/b1-quote.png` });
await preview("b1-quote");

await page.getByRole("radio", { name: /Письмо/ }).click();
await page.fill("#backText", "Эту книгу я писала тебе почти месяц: вспоминала наши поездки, споры до утра и то, как ты смеёшься.\nСпасибо, что ты рядом.");
await page.getByRole("button", { name: /Пионы/ }).first().click();
check(await saved(), "письмо сохранено");
await page.locator("main").screenshot({ path: `${out}/b2-letter.png` });
await preview("b2-letter");

await page.getByRole("radio", { name: /Фото/ }).first().click();
check(await page.locator("[aria-pressed=true] img[src*='/api/photos/']").count() === 1, "для варианта «Фото» снимок выбран сам");
await page.fill("#backText", "Наше первое лето. Алматы, 2022");
await page.getByRole("button", { name: /Письмо/ }).last().click().catch(() => {});
check(await saved(), "фото и подпись сохранены");
await page.waitForTimeout(800);
await page.locator("main").screenshot({ path: `${out}/b3-photo.png` });
await preview("b3-photo");

await page.getByRole("radio", { name: /Лаконично/ }).click();
check(await saved(), "лаконичный вариант сохранён");
check(await page.getByText(/Алия & Марғұлан/).count() >= 1, "лаконично: имена на обороте");
await page.locator("main").screenshot({ path: `${out}/b4-minimal.png` });
await preview("b4-minimal");

// После перезагрузки — то же самое.
await page.reload();
await page.getByRole("radio", { name: "Оборот" }).click();
check((await page.getByRole("radio", { name: /Лаконично/ }).getAttribute("aria-checked")) === "true", "вариант сохранился после перезагрузки");

// Мобильная ширина: без горизонтальной прокрутки.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
check((await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, "редактор на телефоне без горизонтальной прокрутки");

// 3D-просмотр книги открывается без ошибок.
await page.setViewportSize({ width: 1440, height: 1000 });
await page.goto(`${bookUrl}/preview`);
await page.waitForTimeout(4000);
console.log(errors.length ? errors.join("\n") : "no browser errors");
await browser.close();
