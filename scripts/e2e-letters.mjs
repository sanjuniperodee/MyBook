// Письма близких: node scripts/e2e-letters.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const newPage = async () => {
  const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  return p;
};
const owner = await newPage();
await owner.goto(`${base}/register`);
await owner.fill("#name", "Алия");
await owner.fill("#email", `letters${Date.now()}@test.local`);
await owner.fill("#password", "secret123");
await owner.check("input[name=consent]");
await owner.click("button[type=submit]");
await owner.waitForURL(/\/books\/new/);
await owner.getByRole("button", { name: /Любимому человеку/ }).click();
await owner.fill("#recipientName", "Марғұлан");
await owner.click("button[type=submit]");
await owner.waitForURL(/\/books\/[0-9a-f-]{36}$/);
const bookUrl = owner.url();
await owner.goto(`${bookUrl}/questions?q=1`);
await owner.fill("#answer", "Я пишу эту книгу, потому что люблю тебя.");
await owner.waitForTimeout(1500);
await owner.goto(`${bookUrl}/letters`);
await owner.getByRole("button", { name: "Создать ссылку-приглашение" }).click();
await owner.waitForSelector("text=Копировать");
const link = await owner.locator("span.truncate").filter({ hasText: "/letters/" }).first().innerText();
console.log("invite link", link);

const guest = await newPage();
await guest.goto(link.replace(/^https?:\/\/[^/]+/, base));
await guest.screenshot({ path: `${out}/l-guest.png`, fullPage: true });
await guest.fill("#authorName", "Дана");
await guest.fill("#relation", "подруга");
await guest.fill("#text", "Марғұлан, ты лучший друг и муж для нашей Алии. Помню, как вы впервые пришли к нам вдвоём — сразу было понятно, что это навсегда.");
await guest.getByRole("button", { name: "Отправить письмо" }).click();
await guest.waitForSelector("text=Спасибо!");

await owner.reload();
await owner.getByRole("button", { name: "Добавить в книгу" }).click();
await owner.waitForTimeout(800);
await owner.getByRole("button", { name: /В книге/ }).click();
await owner.screenshot({ path: `${out}/l-owner.png`, fullPage: true });
const bookId = bookUrl.split("/").pop();
const pdf = await owner.evaluate(async (id) => {
  const r = await fetch(`/api/books/${id}/preview`);
  const b = new Uint8Array(await r.arrayBuffer());
  return [r.status, b.length];
}, bookId);
console.log("preview pdf", pdf);
await owner.goto(bookUrl);
await owner.screenshot({ path: `${out}/l-hub.png` });
console.log(errors.length ? errors.join("\n") : "no browser errors");
await browser.close();
