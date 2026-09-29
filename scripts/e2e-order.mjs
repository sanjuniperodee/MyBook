// Сценарий заказа: node scripts/e2e-order.mjs <bookUrl> <userEmail> <outDir>
import { chromium } from "playwright";
import sharp from "sharp";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const mk = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message));
  page.on("console", (m) => m.type() === "error" && errors.push("CONSOLE " + m.text()));
  return page;
};
const admin = await mk();
await admin.goto(`${base}/login?next=/admin/promo`);
await admin.fill("#email", "admin@mybook.local");
await admin.fill("#password", "admin12345");
await admin.click("button[type=submit]");
await admin.waitForURL((u) => u.pathname.startsWith("/admin"));
const promoCode = `TEST${Date.now().toString().slice(-6)}`;
await admin.fill("input[name=code]", promoCode);
await admin.fill("input[name=value]", "10");
await admin.getByRole("button", { name: "Создать промокод" }).click();
await admin.waitForSelector(`text=Промокод ${promoCode} создан`);

const page = await mk();
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const email = `buyer${Date.now()}@test.local`;
await page.goto(`${base}/register`);
await page.fill("#name", "Ерлан");
await page.fill("#email", email);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/new/);
await page.getByRole("button", { name: /Маме/ }).click();
await page.fill("#recipientName", "Гульнара");
await page.getByRole("button", { name: "Мужчина" }).click();
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
const bookUrl = page.url();
for (let i = 1; i <= 12; i++) {
  await page.goto(`${bookUrl}/questions?q=${i}`);
  await page.fill("#answer", `Ответ на вопрос ${i}. Мама всегда говорила, что главное — это семья и тепло дома. Я помню запах её пирогов по воскресеньям и то, как она пела на кухне.`);
  await page.waitForTimeout(1100);
}
// фото
const files = [];
for (let k = 0; k < 3; k++) {
  const p = `${out}/photo${k}.jpg`;
  await sharp({ create: { width: 2400, height: k === 1 ? 1600 : 3000, channels: 3, background: { r: 120 + k * 40, g: 90, b: 110 } } }).jpeg().toFile(p);
  files.push(p);
}
await page.goto(`${bookUrl}/photos`);
await page.setInputFiles("input[type=file]", files);
await page.waitForSelector("text=3", { timeout: 30000 });
await page.waitForTimeout(1500);
await shot(page, "10-photos");
await page.goto(`${bookUrl}/settings`);
await page.fill("textarea", "Маме — с благодарностью за всё.");
await page.waitForTimeout(1200);
await shot(page, "11-settings");
await page.goto(`${bookUrl}/preview`);
await page.waitForTimeout(6000);
await shot(page, "12-preview");
await page.goto(`${bookUrl}/checkout`);
await shot(page, "13-checkout");
await page.fill("#city", "Алматы");
await page.fill("#address", "ул. Абая, 1, кв. 10");
await page.fill("#contactPhone", "+7 701 123 45 67");
await page.fill("#giftNote", "С днём рождения, мама!");
await page.check("input[name=surprise]");
await page.getByPlaceholder("Промокод").fill(promoCode.toLowerCase());
await page.getByRole("button", { name: "Применить" }).click();
await page.waitForSelector(`text=${promoCode} применён`);
console.log("total with promo:", await page.locator("aside .font-serif.text-3xl").innerText());
await page.check("input[name=consent]");
await page.getByRole("button", { name: "Оформить заказ" }).click();
await page.waitForURL(/\/orders\//, { timeout: 30000 });
const orderUrl = page.url();
await shot(page, "14-order");
await page.getByRole("button", { name: /Я оплатил/ }).click();
await page.waitForTimeout(1500);
await shot(page, "15-order-claimed");

// админ
await admin.goto(`${base}/admin`);
await shot(admin, "20-admin");
const orderId = orderUrl.split("/").pop();
await admin.goto(`${base}/admin/orders/${orderId}`);
await admin.selectOption("select[name=status]", "paid");
await admin.locator("form", { has: admin.locator("select[name=status]") }).getByRole("button", { name: "Сохранить" }).click();
await admin.waitForTimeout(1500);
const [dl] = await Promise.all([admin.waitForEvent("download", { timeout: 120000 }), admin.click("text=Скачать всё (ZIP)")]);
const zipPath = `${out}/package.zip`;
await dl.saveAs(zipPath);
await admin.reload();
await shot(admin, "21-admin-order");
await page.reload();
await shot(page, "16-order-paid");
const res = await page.evaluate(async (id) => { const r = await fetch(`/api/orders/${id}/files/reading`); return [r.status, (await r.arrayBuffer()).byteLength]; }, orderId);
console.log("reading pdf", res);
const denied = await page.evaluate(async (id) => (await fetch(`/api/orders/${id}/files/block`)).status, orderId);
console.log("block for printed plan (expect 403):", denied);
console.log("zip saved", zipPath);
console.log(errors.length ? errors.join("\n") : "no browser errors");
await browser.close();
