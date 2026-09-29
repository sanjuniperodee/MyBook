// Проверка диктовки на имитации Web Speech API: node scripts/e2e-dictation.mjs [baseUrl]
import { chromium } from "playwright";
const [base = "http://localhost:3000"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => {
  class FakeRecognition {
    constructor() {
      window.__rec = this;
      this.results = [];
    }
    start() {
      this.results = [];
      setTimeout(() => this.onaudiostart?.(), 10);
    }
    stop() {
      // браузер отдаёт последнюю фразу после stop
      setTimeout(() => {
        this.emit([["и последняя фраза", true]]);
        this.onend?.();
      }, 50);
    }
    abort() {}
    emit(list) {
      for (const [t, f] of list) this.results.push(Object.assign([{ transcript: t }], { isFinal: f }));
      this.onresult?.({ resultIndex: 0, results: this.results.map((r, i) => (i < this.results.length - list.length ? r : r)) });
    }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
});
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
await page.goto(`${base}/register?theme=love`);
await page.fill("#name", "Тест");
await page.fill("#email", `dict${Date.now()}@test.local`);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/new/);
await page.fill("#recipientName", "Али");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
await page.goto(page.url() + "/questions?q=2");
await page.getByRole("button", { name: /Надиктовать/ }).click();
await page.waitForTimeout(100);
await page.evaluate(() => window.__rec.emit([["привет как", false]]));
await page.waitForSelector("text=привет как…");
console.log("interim shown ✓");
// Две финальные фразы в одном событии
await page.evaluate(() => {
  const r = window.__rec;
  r.results = [];
  r.emit([["мы познакомились весной", true], ["в кофейне на абая", true]]);
});
await page.waitForTimeout(200);
// Браузер перезапустил распознавание после паузы
await page.evaluate(() => {
  const r = window.__rec;
  r.onend?.();
  r.emit([["это было чудесно", true]]);
});
await page.waitForTimeout(200);
await page.getByRole("button", { name: /Стоп/ }).click();
await page.waitForTimeout(400);
const value = await page.inputValue("#answer");
console.log("answer:", JSON.stringify(value));
const ok = value === "Мы познакомились весной в кофейне на абая это было чудесно и последняя фраза";
console.log(ok ? "dictation ✓" : "dictation ✗");
await page.waitForTimeout(1500);
await page.reload();
console.log("persisted:", (await page.inputValue("#answer")) === value ? "✓" : "✗");
await browser.close();
process.exit(ok ? 0 : 1);
