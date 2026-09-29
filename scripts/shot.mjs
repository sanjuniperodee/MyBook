// Скриншоты страниц для визуальной проверки: node scripts/shot.mjs <url> <out.png> [width] [cookie]
import { chromium } from "playwright";
const [url, out, width = "1440", cookie] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 900 }, deviceScaleFactor: 1 });
if (cookie) await ctx.addCookies([{ name: "mb_session", value: cookie, url: new URL(url).origin }]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", m.text()));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
