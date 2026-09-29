// Сертификат → активация → книга с поводом → заказ с кодом и допами: node scripts/e2e-gift.mjs [baseUrl] [outDir]
// Нужен администратор admin@mybook.local / admin12345 (npm run create-admin).
import { chromium } from "playwright";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const check = (cond, msg) => {
  if (!cond) throw new Error("CHECK FAILED: " + msg);
  console.log("✓", msg);
};
const stamp = Date.now();

// 1. Покупка сертификата без аккаунта
const buyer = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
buyer.on("pageerror", (e) => errors.push(e.message));
buyer.on("console", (m) => m.type() === "error" && !/Failed to load resource|caret-color/.test(m.text()) && errors.push("console@" + (m.location()?.url ?? "") + ": " + m.text().slice(-1200)));
await buyer.goto(`${base}/gift`);
await buyer.getByRole("button", { name: /Премиум/ }).click();
await buyer.fill("#recipientName", "Гульнара");
await buyer.fill("#buyerName", "Айгерим");
await buyer.fill("#message", "Мама, напиши историю нашей семьи");
await buyer.fill("#buyerEmail", `buyer${stamp}@test.local`);
check((await buyer.locator(".font-hand").first().innerText()).includes("Айгерим"), "живое превью сертификата обновляется");
await buyer.screenshot({ path: `${out}/gift-form.png`, fullPage: true });
await buyer.check("input[name=consent]");
await buyer.getByRole("button", { name: /Перейти к оплате/ }).click();
await buyer.waitForURL(/\/gift\/[A-Za-z0-9_-]{20,}$/);
const giftUrl = buyer.url();
check(await buyer.getByText("Остался один шаг").isVisible(), "страница оплаты сертификата");
await buyer.getByRole("button", { name: "Я оплатил(а)" }).click();
await buyer.getByText("Проверим поступление").waitFor();
check(true, "покупатель сообщил об оплате");

// 2. Админ подтверждает оплату
const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await admin.goto(`${base}/login?next=/admin/gifts`);
await admin.fill("#email", "admin@mybook.local");
await admin.fill("#password", "admin12345");
await admin.click("button[type=submit]");
await admin.waitForURL((u) => u.pathname === "/admin/gifts");
const row = admin.locator("tr", { hasText: `buyer${stamp}@test.local` });
check(await row.getByText("сообщил об оплате").isVisible(), "в CRM видно, что клиент сообщил об оплате");
admin.once("dialog", (d) => d.accept());
await row.getByRole("button", { name: "Оплачен" }).click();
await row.getByText(/GIFT-/).waitFor({ timeout: 30000 });
const code = (await row.locator("td.font-mono").innerText()).match(/GIFT-[A-Z0-9]{4}-[A-Z0-9]{4}/)[0];
check(!!code, `выпущен код ${code}`);
await admin.screenshot({ path: `${out}/gift-admin.png`, fullPage: true });

// 3. Страница сертификата: PDF и ссылка для получателя
await buyer.goto(giftUrl);
check(await buyer.getByText("Сертификат готов").isVisible(), "покупатель видит готовый сертификат");
const pdf = await buyer.evaluate(async (u) => {
  const r = await fetch(u);
  return [r.status, r.headers.get("content-type"), (await r.arrayBuffer()).byteLength];
}, `${giftUrl.replace("/gift/", "/api/gifts/")}/pdf`);
check(pdf[0] === 200 && pdf[1] === "application/pdf" && pdf[2] > 10000, `PDF сертификата скачивается (${pdf[2]} байт)`);
await buyer.screenshot({ path: `${out}/gift-ready.png`, fullPage: true });

// 4. Получатель активирует код, регистрируется, создаёт книгу с поводом
const rec = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
rec.on("pageerror", (e) => errors.push(e.message));
rec.on("console", (m) => m.type() === "error" && !/Failed to load resource|caret-color/.test(m.text()) && errors.push("console@" + (m.location()?.url ?? "") + ": " + m.text().slice(-1200)));
await rec.goto(`${base}/redeem?code=${code}`);
check(await rec.getByText("Айгерим дарит вам книгу").isVisible(), "страница активации с пожеланием");
await rec.screenshot({ path: `${out}/gift-redeem.png`, fullPage: true });
await rec.getByRole("button", { name: "Начать книгу" }).click();
await rec.waitForURL(/\/register/);
await rec.fill("#name", "Гульнара");
await rec.fill("#email", `rec${stamp}@test.local`);
await rec.fill("#password", "secret123");
await rec.check("input[name=consent]");
await rec.click("button[type=submit]");
await rec.waitForURL(/\/books\/new/);
await rec.getByRole("button", { name: /Маме/ }).first().click();
await rec.fill("#recipientName", "Дети");
await rec.getByRole("button", { name: "День рождения" }).click();
const d = new Date(Date.now() + 40 * 86_400_000);
const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await rec.fill("input[aria-label='Дата праздника']", iso);
check(await rec.getByText(/закажите книгу до/).isVisible(), "в мастере видно, до какого дня заказать");
await rec.getByRole("button", { name: "Создать книгу" }).click();
await rec.waitForURL(/\/books\/[0-9a-f-]{36}$/);
const bookUrl = rec.url();
check(await rec.getByTestId("deadline-banner").isVisible(), "на обзоре книги — отсчёт до праздника");
await rec.screenshot({ path: `${out}/gift-book.png` });

// Пишем ответ, чтобы можно было заказать
await rec.goto(`${bookUrl}/questions`);
await rec.fill("#answer", "Я родилась в Алматы, в доме у большого тополя. Мама пекла баурсаки по воскресеньям, и весь двор знал об этом по запаху.");
await rec.waitForTimeout(2000);

// 5. Заказ: код подставлен сам, экспресс-печать добавляется, дата подтягивается
await rec.goto(`${bookUrl}/checkout`);
check((await rec.getByText(`${code} применён`).count()) > 0, "код сертификата подставлен автоматически");
check(await rec.getByRole("button", { name: /^Премиум/ }).evaluate((el) => el.className.includes("border-wine")), "выбран тариф из сертификата");
check((await rec.locator("#desiredDate").inputValue()) === iso, "дата праздника подставлена в заказ");
check(await rec.getByTestId("date-fit").isVisible(), "подсказка, успеваем ли к дате");
await rec.getByRole("button", { name: /^Твёрдая обложка/ }).click();
await rec.getByText("Экспресс-печать").click();
await rec.fill("#city", "Алматы");
await rec.fill("#address", "ул. Абая, 1, кв. 2");
await rec.fill("#contactPhone", "+7 701 000 00 00");
await rec.check("input[name=consent]");
await rec.screenshot({ path: `${out}/gift-checkout.png`, fullPage: true });
await rec.getByRole("button", { name: "Оформить заказ" }).click();
await rec.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
const orderText = await rec.locator("main").innerText();
check(orderText.includes("Экспресс-печать"), "допы видны в заказе");
check(/Промокод GIFT-/.test(orderText), "сертификат учтён в заказе");
await rec.screenshot({ path: `${out}/gift-order.png`, fullPage: true });

// 6. Код одноразовый
await rec.goto(`${base}/redeem?code=${code}`);
check(await rec.getByText(/уже использован/).isVisible(), "повторно код не принимается");

console.log(errors.length ? "page errors:\n" + errors.join("\n") : "no page errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
