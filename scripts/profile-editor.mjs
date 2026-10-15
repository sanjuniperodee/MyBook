// Замер перерисовок редактора на вводе (F1): node scripts/profile-editor.mjs [baseUrl] [--chars 50] [--answers 36] [--runs 3]
//
// Заводит пользователя и книгу, заполняет ответы в нескольких главах (по три абзаца), открывает вопрос в середине
// книги и печатает --chars символов в ответ с паузой 40 мс, как человек. Коммиты React и время их рендера
// считает хук devtools (window.__REACT_DEVTOOLS_GLOBAL_HOOK__: onCommitFiberRoot, actualDuration корня) —
// числа есть в dev-сборке и в `next build --profile`. Время браузера на скрипты, стили и раскладку (раскладка
// колонок превью в React не видна) — метрики CDP Performance. Печатает медиану по --runs прогонам.
import { chromium } from "playwright";

const args = process.argv.slice(2);
const base = args[0] && !args[0].startsWith("--") ? args[0] : "http://localhost:3000";
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const CHARS = opt("chars", 50);
const ANSWERS = opt("answers", 36);
const RUNS = opt("runs", 3);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => {
  const prof = { on: false, commits: 0, total: 0, max: 0 };
  window.__prof = prof;
  let next = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(renderer) {
      const id = next++;
      this.renderers.set(id, renderer);
      return id;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      if (!prof.on) return;
      const d = root.current.actualDuration ?? 0;
      prof.commits++;
      prof.total += d;
      prof.max = Math.max(prof.max, d);
    },
  };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("Performance.enable");
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
const errors = [];
page.on("pageerror", (e) => { errors.push(e.message); console.error("PAGEERROR", e.message); });
page.on("console", (m) => m.type() === "error" && console.error("CONSOLE", m.text().slice(0, 300)));

await page.goto(`${base}/register?theme=love`);
await page.fill("#name", "Замер");
await page.fill("#email", `profile${Date.now()}@test.local`);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/new/);
await page.fill("#recipientName", "Али");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
const bookUrl = page.url();

// Ответы: по три абзаца в первых ANSWERS вопросах — это несколько глав превью.
const para = "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег. Я опаздывала на встречу, а ты стоял у входа в кофейню и держал дверь. ";
await page.goto(`${bookUrl}/questions?q=1`);
for (let i = 0; i < ANSWERS; i++) {
  await page.fill("#answer", [para.repeat(2), para, para.repeat(3)].join("\n"));
  await page.keyboard.press("Control+Enter");
  await page.waitForTimeout(150);
}
await page.waitForTimeout(1500);

const results = [];
for (let run = 0; run < RUNS; run++) {
  await page.goto(`${bookUrl}/questions?q=${Math.round(ANSWERS / 2)}`);
  await page.waitForSelector("aside .relative.bg-white");
  await page.waitForTimeout(2500);
  await page.focus("#answer");
  await page.keyboard.press("End");
  await page.evaluate(() => Object.assign(window.__prof, { on: true, commits: 0, total: 0, max: 0 }));
  const before = await metrics();
  const started = Date.now();
  await page.keyboard.type("а".repeat(CHARS), { delay: 40 });
  const typed = Date.now() - started;
  await page.waitForTimeout(2000); // автосохранение и отложенные перерисовки
  const p = await page.evaluate(() => ({ ...window.__prof, on: false }));
  await page.evaluate(() => (window.__prof.on = false));
  const after = await metrics();
  const ms = (k) => Math.round((after[k] - before[k]) * 1000);
  results.push({
    commits: p.commits,
    renderMs: Math.round(p.total),
    maxCommitMs: Math.round(p.max * 10) / 10,
    scriptMs: ms("ScriptDuration"),
    styleMs: ms("RecalcStyleDuration"),
    layoutMs: ms("LayoutDuration"),
    taskMs: ms("TaskDuration"),
    typedMs: typed,
  });
}
const median = (k) => results.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(results.length / 2)];
console.log(JSON.stringify({ chars: CHARS, answers: ANSWERS, runs: results, median: Object.fromEntries(Object.keys(results[0]).map((k) => [k, median(k)])) }, null, 2));
if (errors.length) console.log("page errors:", errors);
await browser.close();
