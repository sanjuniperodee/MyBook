// Скриншоты страниц админки: node scripts/shot-admin.mjs <base> <outDir> <path1> [path2...]
import { chromium } from "playwright";
const [base, out, ...paths] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: Number(process.env.W || 1440), height: 900 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !m.text().includes("caret-color") && errors.push("console: " + m.text().slice(0, 300)));
await page.goto(`${base}/login`);
await page.fill("#email", "admin@mybook.local");
await page.fill("#password", "admin12345");
await page.click("button[type=submit]");
await page.waitForURL((u) => u.pathname === "/books");
for (const p of paths) {
  await page.goto(base + p, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const name = p.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";
  await page.screenshot({ path: `${out}/a-${name}.png`, fullPage: process.env.FULL !== "0" });
}
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
