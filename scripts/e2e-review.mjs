// Сценарий отзыва: заказ → доставка → отзыв с фото → модерация → отзыв на главной.
// node scripts/e2e-review.mjs [base] [outDir]
import { chromium } from "playwright";
import sharp from "sharp";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const mk = async (viewport = { width: 1440, height: 900 }) => {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => m.type() === "error" && !/404|Failed to load resource/.test(m.text()) && errors.push("CONSOLE " + m.text()));
  return page;
};
const shot = (p, name, fullPage = true) => p.screenshot({ path: `${out}/${name}.png`, fullPage });
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) process.exitCode = 1;
};

const admin = await mk();
await admin.goto(`${base}/login?next=/admin/reviews`);
await admin.fill("#email", "admin@mybook.local");
await admin.fill("#password", "admin12345");
await admin.click("button[type=submit]");
await admin.waitForURL((u) => u.pathname.startsWith("/admin"));
const setStatus = async (orderId, status) => {
  await admin.goto(`${base}/admin/orders/${orderId}`);
  await admin.selectOption("select[name=status]", status);
  await admin.locator("form", { has: admin.locator("select[name=status]") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForTimeout(1500);
};

// Покупатель: книга маме и заказ печатной книги.
const page = await mk({ width: 390, height: 844 });
const run = Date.now();
const email = `reviewer${run}@test.local`;
// Текст отзыва уникален для прогона — витрина копит отзывы прошлых прогонов.
const story = `Мама читала весь вечер и плакала от счастья. Спасибо, что помогли сказать то, что я не умела сказать словами! (${run})`;
await page.goto(`${base}/register`);
await page.fill("#name", "Айгерим");
await page.fill("#email", email);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/new/);
await page.getByRole("button", { name: /Маме/ }).click();
await page.fill("#recipientName", "Гульнара");
await page.getByRole("button", { name: "Женщина" }).click();
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
const bookUrl = page.url();
await page.goto(`${bookUrl}/questions?q=1`);
await page.fill("#answer", "Мама всегда говорила, что главное — это семья и тепло дома.");
await page.waitForTimeout(1200);
await page.goto(`${bookUrl}/checkout`);
await page.fill("#city", "Алматы");
await page.fill("#address", "ул. Абая, 1, кв. 10");
await page.fill("#contactPhone", "+7 701 123 45 67");
await page.check("input[name=consent]");
await page.getByRole("button", { name: "Оформить заказ" }).click();
await page.waitForURL(/\/orders\//, { timeout: 30000 });
const orderUrl = page.url();
const orderId = orderUrl.split("/").pop();

// Оплачен, но книга ещё печатается — отзыв рано.
await setStatus(orderId, "paid");
await page.goto(orderUrl);
check((await page.getByRole("link", { name: "Оценить книгу" }).count()) === 0, "нет карточки отзыва, пока книга в печати");
await page.goto(`${base}/review/${orderId}`);
check(await page.getByText("когда книга будет у вас").isVisible(), "страница отзыва просит подождать доставки");

// Доставлен — карточка в заказе.
await setStatus(orderId, "delivered");
await page.goto(orderUrl);
await shot(page, "r1-order-card");
await page.getByRole("link", { name: "Оценить книгу" }).first().click();
await page.waitForURL(/\/review\//);
check((await page.inputValue("#review-name")) === "Айгерим", "имя подставлено из профиля");

// Отзыв: 5 звёзд, текст, фото.
const photo = `${out}/review-photo.jpg`;
await sharp({ create: { width: 1800, height: 2400, channels: 3, background: { r: 214, g: 170, b: 160 } } }).jpeg().toFile(photo);
await page.getByRole("radio", { name: /^5/ }).click();
await page.fill("#review-text", story);
await page.fill("#review-city", "Алматы");
await page.setInputFiles("input[type=file]", photo);
await page.waitForTimeout(300);
await shot(page, "r2-form");
await page.getByRole("button", { name: "Отправить отзыв" }).click();
await page.getByText("Спасибо за отзыв!").first().waitFor();
const promo = await page.locator("code").first().innerText();
check(/^SPASIBO-[A-Z2-9]{6}$/.test(promo), `промокод-благодарность ${promo}`);
await shot(page, "r3-thanks");

// Правка до проверки: форма открывается с прежним текстом и фото.
await page.goto(`${base}/review/${orderId}`);
check((await page.inputValue("#review-text")) === story, "отзыв можно поправить до проверки");
check(await page.getByText("Фото приложено").isVisible(), "фото сохранено");
await page.goto(orderUrl);
check(await page.getByText(promo).isVisible(), "промокод виден в заказе");

// Промокод работает при новом заказе.
await page.goto(`${base}/redeem?code=${promo}`);
check(await page.getByText("Промокод действует").isVisible(), "промокод принимается на /redeem");

// Чужой не откроет отзыв без подписанной ссылки.
const stranger = await mk();
const res = await stranger.goto(`${base}/review/${orderId}`);
check(res?.status() === 404, "без входа и подписи — 404");
const forged = await stranger.goto(`${base}/review/${orderId}?t=${"a".repeat(32)}`);
check(forged?.status() === 404, "поддельная подпись — 404");
const api = await stranger.evaluate(async (id) => {
  const f = new FormData();
  f.set("rating", "1");
  f.set("text", "spam");
  f.set("authorName", "x");
  f.set("city", "");
  f.set("consent", "1");
  return (await fetch(`/api/reviews/${id}`, { method: "POST", body: f })).status;
}, orderId);
check(api === 404, "API отзыва без доступа — 404");

// Модерация.
await admin.goto(`${base}/admin/reviews`);
await admin.getByText(promo).waitFor();
await shot(admin, "r4-admin-new");
const card = admin.locator("li", { hasText: promo });
await card.getByRole("button", { name: "Опубликовать" }).click();
await admin.waitForTimeout(1200);
await admin.goto(`${base}/admin/reviews?s=published`);
check(await admin.locator("li", { hasText: promo }).isVisible(), "отзыв опубликован");
await admin.locator("li", { hasText: promo }).getByRole("button", { name: "Закрепить первым" }).click();
await admin.waitForTimeout(1200);
await admin.reload();
await shot(admin, "r5-admin-published");

// Опубликованный отзыв больше не правится, фото доступно всем.
await page.goto(`${base}/review/${orderId}`);
check(await page.getByText("Отзыв принят").isVisible(), "после публикации — только благодарность");
const reviewId = await admin.locator("li", { hasText: promo }).locator("img").first().getAttribute("src");
const photoStatus = await stranger.evaluate(async (src) => (await fetch(src)).status, reviewId);
check(photoStatus === 200, "фото опубликованного отзыва открыто всем");

// Главная и страница «книга маме».
const home = await mk();
await home.goto(`${base}/#reviews`);
await home.locator("#reviews").scrollIntoViewIfNeeded();
check(await home.locator("#reviews").getByText(String(run)).isVisible(), "отзыв на главной (закреплён первым)");
await home.locator("#reviews").screenshot({ path: `${out}/r6-landing.png` });
await home.goto(`${base}/kniga/kniga-mame`);
check(await home.locator("#reviews").getByText(String(run)).isVisible(), "отзыв на странице «книга маме»");
const ld = await home.locator("script[type='application/ld+json']").first().innerText();
console.log("aggregateRating в разметке:", ld.includes("aggregateRating") ? "есть" : "нет (меньше 5 отзывов)");
const mobile = await mk({ width: 390, height: 844 });
await mobile.goto(`${base}/`);
check((await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "главная без горизонтальной прокрутки на телефоне");
await mobile.locator("#reviews").screenshot({ path: `${out}/r7-landing-mobile.png` });

console.log(errors.length ? errors.join("\n") : "no browser errors");
await browser.close();
