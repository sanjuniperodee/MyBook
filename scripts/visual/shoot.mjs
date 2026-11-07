// Снимки страниц MyBooks со стенда (dev-сервер на :3210, база mybook_visual).
// node scripts/visual/shoot.mjs <who: admin|client|public> <out-prefix> <path> [<path>...]
//   флаги через переменные: VIEW=desktop|mobile|both (по умолчанию both), FULL=1 — вся страница, DARK=1 — тёмная тема.
// Пишет PNG в /tmp/mybook-shoot/out/<prefix>-<n>-<view>.png и выводит ошибки консоли браузера.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const [who = "admin", prefix = "shot", ...paths] = process.argv.slice(2);
const BASE = process.env.BASE ?? "http://localhost:3210";
const OUT = "/tmp/mybook-shoot/out";
mkdirSync(OUT, { recursive: true });
const seed = JSON.parse(readFileSync(new URL("../../tests/visual/.seed.json", import.meta.url), "utf8"));
const views = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const want = (process.env.VIEW ?? "both") === "both" ? ["desktop", "mobile"] : [process.env.VIEW];
const fill = (p) => p.replace("{deal}", seed.dealId).replace("{order}", seed.orderId).replace("{client}", seed.clientId).replace("{book}", seed.bookId).replace("{conv}", seed.conversationId);

async function state(browser, email, next) {
  const file = `/tmp/mybook-shoot/${email}.json`;
  if (existsSync(file)) return file;
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.fill("#email", email);
  await page.fill("#password", seed.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === next, { timeout: 60_000 });
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

const browser = await chromium.launch();
try {
  const storageState = who === "admin" ? await state(browser, seed.adminEmail, "/admin") : who === "client" ? await state(browser, seed.clientEmail, "/books") : undefined;
  for (const v of want) {
    const ctx = await browser.newContext({ baseURL: BASE, storageState, locale: "ru-RU", timezoneId: "Asia/Almaty", colorScheme: process.env.DARK ? "dark" : "light", ...views[v] });
    if (process.env.DARK) await ctx.addInitScript(() => { try { localStorage.setItem("crm-theme", "dark"); localStorage.setItem("theme", "dark"); } catch {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 300)));
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
    let i = 0;
    for (const raw of paths) {
      const path = fill(raw);
      i++;
      errors.length = 0;
      const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(800);
      if (process.env.FULL) {
        // Секции ниже первого экрана рисуются при прокрутке (content-visibility, появление): проходим страницу сверху вниз.
        await page.evaluate(async () => {
          const scrollStep = Math.max(300, innerHeight * 0.8);
          for (let y = 0; y < document.documentElement.scrollHeight; y += scrollStep) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 180)); }
          window.scrollTo(0, 0);
          await new Promise((r) => setTimeout(r, 300));
        });
      }
      const file = `${OUT}/${prefix}-${i}-${v}.png`;
      await page.screenshot({ path: file, fullPage: !!process.env.FULL });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${v} ${path} → ${res?.status()} ${file}${overflow > 1 ? ` · ГОРИЗОНТАЛЬНАЯ ПРОКРУТКА +${overflow}px` : ""}`);
      for (const e of errors) console.log(`   console: ${e}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
