// Сценарий приглашений: клиент делится ссылкой → друг приходит, скидка подставляется сама →
// друг оплачивает → приглашающему награда. Плюс правила: свой код и повторный заказ — без скидки.
// node scripts/e2e-invite.mjs [base] [outDir]
import { chromium } from "playwright";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const mk = async (viewport = { width: 390, height: 844 }) => {
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push("CONSOLE " + m.text()));
  return page;
};
const shot = (p, name, fullPage = true) => p.screenshot({ path: `${out}/${name}.png`, fullPage });
const check = (ok, what) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (!ok) process.exitCode = 1;
};
const run = Date.now();
/** Дождаться появления (ответ серверного действия приходит не сразу). */
const seen = (locator, timeout = 8000) => locator.first().waitFor({ timeout }).then(() => true, () => false);

const admin = await mk({ width: 1440, height: 900 });
await admin.goto(`${base}/login?next=/admin`);
await admin.fill("#email", "admin@mybook.local");
await admin.fill("#password", "admin12345");
await admin.click("button[type=submit]");
await admin.waitForURL((u) => u.pathname.startsWith("/admin"));
const markPaid = async (orderId) => {
  await admin.goto(`${base}/admin/orders/${orderId}`);
  await admin.selectOption("select[name=status]", "paid");
  await admin.locator("form", { has: admin.locator("select[name=status]") }).getByRole("button", { name: "Сохранить" }).click();
  await admin.waitForTimeout(2000);
};

/** Регистрация и книга (электронная — без доставки), возвращает URL книги. */
const signUpWithBook = async (page, name, email, theme = /Маме/) => {
  await page.goto(`${base}/register`);
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", "secret123");
  await page.check("input[name=consent]");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/books\/new/);
  return newBook(page, theme);
};
const newBook = async (page, theme = /Маме/) => {
  await page.goto(`${base}/books/new`);
  await page.getByRole("button", { name: theme }).click();
  await page.fill("#recipientName", "Гульнара");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
  const url = page.url();
  await page.goto(`${url}/questions?q=1`);
  await page.fill("#answer", "Мама всегда говорила, что главное — это семья и тепло дома.");
  await page.waitForTimeout(1200);
  return url;
};
const openCheckout = async (page, bookUrl) => {
  await page.goto(`${bookUrl}/checkout`);
  await page.getByText("Электронная").first().click();
  await page.fill("#contactPhone", "+7 701 123 45 67");
};
const placeOrder = async (page) => {
  await page.check("input[name=consent]");
  await page.getByRole("button", { name: "Оформить заказ" }).click();
  await page.waitForURL(/\/orders\//, { timeout: 30000 });
  return page.url().split("/").pop();
};

// 1. Асель заказывает книгу и получает свою ссылку.
const asel = await mk();
const aselBook = await signUpWithBook(asel, "Асель", `asel${run}@test.local`);
await openCheckout(asel, aselBook);
const aselOrder = await placeOrder(asel);
await markPaid(aselOrder);
await asel.goto(`${base}/orders/${aselOrder}`);
check(await asel.getByRole("link", { name: "Пригласить друга" }).isVisible(), "в оплаченном заказе — приглашение друзей");
await asel.getByRole("link", { name: "Пригласить друга" }).click();
await asel.waitForURL(/\/invite/);
const link = await asel.getByTestId("invite-link").getAttribute("data-link");
const code = link.split("/").pop();
check(/^ASEL-[A-Z2-9]{4}$/.test(code), `код с именем: ${code}`);
check((await asel.locator("a[href^='https://wa.me/?text=']").getAttribute("href")).includes(encodeURIComponent(link)), "WhatsApp: текст со ссылкой");
await shot(asel, "i1-invite");
await asel.reload();
check((await asel.getByTestId("invite-link").getAttribute("data-link")) === link, "ссылка постоянная");

// 2. Свой код применить нельзя.
const aselBook2 = await newBook(asel, /Папе/);
await openCheckout(asel, aselBook2);
await asel.getByPlaceholder("Промокод").fill(code);
await asel.getByRole("button", { name: "Применить" }).click();
check(await seen(asel.getByText("Это ваш код для друзей")), "свой код — отказ с объяснением");

// 3. Дана приходит по ссылке.
const dana = await mk();
await dana.goto(link);
await dana.waitForURL((u) => new URL(u).pathname === "/");
check(await dana.getByText("Асель дарит вам 10% на первую книгу").isVisible(), "главная: «Асель дарит вам 10%»");
await shot(dana, "i2-landing", false);
const danaBook = await signUpWithBook(dana, "Дана", `dana${run}@test.local`);
await openCheckout(dana, danaBook);
check(await dana.getByText(`${code} применён`).isVisible(), "скидка друга подставилась при оформлении");
await shot(dana, "i3-checkout");
const danaOrder = await placeOrder(dana);
await markPaid(danaOrder);

// 4. Асель получает награду.
await asel.goto(`${base}/invite`);
await asel.waitForTimeout(500);
check(await asel.getByText("1 друг заказал книгу").isVisible(), "приглашения: 1 друг заказал");
const reward = (await asel.locator("li code").first().innerText()).trim();
check(/^ASEL-[A-Z2-9]{8}$/.test(reward) && reward !== code, `награда: ${reward}`);
await shot(asel, "i4-reward");
await asel.goto(`${base}/redeem?code=${reward}`);
check(await asel.getByText("Промокод действует").isVisible(), "награда действует");

// 5. Повторный заказ Даны со скидкой друга — нельзя.
const danaBook2 = await newBook(dana, /Папе/);
await openCheckout(dana, danaBook2);
check(!(await dana.getByText(`${code} применён`).isVisible()), "повторный заказ: скидка друга не подставляется");
await dana.getByPlaceholder("Промокод").fill(code);
await dana.getByRole("button", { name: "Применить" }).click();
check(await seen(dana.getByText("Этот код — на первую книгу")), "повторный заказ: отказ «на первую книгу»");

// 6. Неизвестный код — просто главная, без приветствия.
const stranger = await mk();
await stranger.goto(`${base}/r/NOPE-0000`);
check(new URL(stranger.url()).pathname === "/" && !(await stranger.getByText("дарит вам").isVisible()), "неизвестный код — главная без подарка");

console.log(errors.length ? errors.join("\n") : "no browser errors");
await browser.close();
