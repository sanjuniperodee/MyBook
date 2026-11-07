// Обход всех страниц стенда на нескольких ширинах: снимок, код ответа, горизонтальная прокрутка, ошибки консоли.
//   node scripts/visual/sweep.mjs [admin|client|public|all] [--widths 360,390,768,1024,1280,1440,1920] [--dark] [--only подстрока]
// Стенд — dev-сервер на :3210 с базой mybook_visual (см. docs/design/DESIGN.md §10), сид — tests/visual/.seed.json.
// PNG — /tmp/mybook-shoot/sweep/<ширина>/<имя>.png, сводка — /tmp/mybook-shoot/sweep/summary.json и в консоль.
import { chromium } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const who = args.find((a) => ["admin", "client", "public", "all"].includes(a)) ?? "all";
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const widths = (flag("--widths") ?? "360,390,768,1024,1280,1440,1920").split(",").map(Number);
const dark = args.includes("--dark");
const only = flag("--only");
const BASE = process.env.BASE ?? "http://localhost:3210";
const OUT = "/tmp/mybook-shoot/sweep";
const seed = JSON.parse(readFileSync(new URL("../../tests/visual/.seed.json", import.meta.url), "utf8"));
const fill = (p) => p.replace("{deal}", seed.dealId).replace("{order}", seed.orderId).replace("{client}", seed.clientId).replace("{book}", seed.bookId).replace("{conv}", seed.conversationId);

const routes = {
  public: ["/", "/kniga", "/love", "/gift", "/instrumenty", "/blog", "/offer", "/privacy", "/login", "/register", "/forgot", "/redeem"],
  client: ["/books", "/books/new", "/account", "/orders", "/invite", "/books/{book}", "/books/{book}/questions", "/books/{book}/photos", "/books/{book}/pages", "/books/{book}/cover", "/books/{book}/preview", "/books/{book}/letters", "/books/{book}/checkout", "/books/{book}/settings"],
  admin: ["/admin", "/admin/tasks", "/admin/deals", "/admin/deals?view=list", "/admin/deals/{deal}", "/admin/deals/new", "/admin/deals/stages", "/admin/deals/fields", "/admin/deals/duplicates", "/admin/chats", "/admin/clients", "/admin/clients/{client}", "/admin/clients/new", "/admin/calls", "/admin/templates", "/admin/board", "/admin/orders", "/admin/orders/{order}", "/admin/books", "/admin/analytics", "/admin/finance", "/admin/ai-designer", "/admin/marketing", "/admin/promo", "/admin/gifts", "/admin/reviews", "/admin/automations", "/admin/pricing", "/admin/site", "/admin/settings", "/admin/team", "/admin/team/roles", "/admin/team/plans", "/admin/team/audit", "/admin/security", "/admin/users", "/admin/search?q=Алия", "/admin/more"],
};

async function state(browser, email, next) {
  const file = `/tmp/mybook-shoot/${email}.json`;
  if (existsSync(file)) return file;
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.waitForLoadState("networkidle");
  await page.fill("#email", email);
  await page.fill("#password", seed.password);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname === next, { timeout: 60_000 });
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

const slug = (p) => p.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9а-я]+/gi, "_").replace(/^_|_$/g, "") || "home";
const browser = await chromium.launch();
const summary = [];
try {
  for (const group of who === "all" ? ["public", "client", "admin"] : [who]) {
    const storageState = group === "admin" ? await state(browser, seed.adminEmail, "/admin") : group === "client" ? await state(browser, seed.clientEmail, "/books") : undefined;
    for (const w of widths) {
      const mobile = w < 768;
      const ctx = await browser.newContext({ baseURL: BASE, storageState, locale: "ru-RU", timezoneId: "Asia/Almaty", colorScheme: dark ? "dark" : "light", viewport: { width: w, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
      if (dark) await ctx.addInitScript(() => { try { localStorage.setItem("crm-theme", "dark"); localStorage.setItem("theme", "dark"); } catch {} });
      const page = await ctx.newPage();
      const errors = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
      mkdirSync(`${OUT}/${w}${dark ? "-dark" : ""}`, { recursive: true });
      for (const raw of routes[group]) {
        if (only && !raw.includes(only)) continue;
        const path = fill(raw);
        errors.length = 0;
        let status = 0, overflow = 0, note = "";
        try {
          const res = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 });
          status = res?.status() ?? 0;
          await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
          await page.waitForTimeout(500);
          overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          await page.screenshot({ path: `${OUT}/${w}${dark ? "-dark" : ""}/${group}-${slug(raw)}.png` });
        } catch (e) { note = String(e.message).slice(0, 120); }
        summary.push({ group, w, path: raw, status, overflow, errors: [...errors], note });
        console.log(`${w}${dark ? "d" : ""} ${raw} → ${status}${overflow > 1 ? ` ПРОКРУТКА +${overflow}px` : ""}${errors.length ? ` ошибок консоли: ${errors.length}` : ""}${note ? ` ${note}` : ""}`);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 1));
}
const bad = summary.filter((s) => s.status >= 400 || s.status === 0 || s.overflow > 1 || s.errors.length);
console.log(`\nСтраниц: ${summary.length}, с замечаниями: ${bad.length}`);
