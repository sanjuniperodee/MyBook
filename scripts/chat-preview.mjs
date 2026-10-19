// Снимок превью «Чатов» (src/app/dev/chats) для проверки дизайна: node scripts/chat-preview.mjs [url] [out.png] [ширина]
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/dev/chats";
const out = process.argv[3] ?? "/tmp/chat-preview.png";
const width = Number(process.argv[4] ?? 1600);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 950 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
await page.screenshot({ path: out });
await browser.close();
console.log(out);
