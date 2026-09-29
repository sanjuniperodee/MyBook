// Фото в ответе и многостраничное превью: node scripts/e2e-inline-photo.mjs [baseUrl] [outDir]
import { chromium } from "playwright";
import sharp from "sharp";
const [base = "http://localhost:3000", out = "/tmp"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const img = `${out}/inline-photo.jpg`;
await sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 180, g: 120, b: 130 } } }).jpeg().toFile(img);
await page.goto(`${base}/register?theme=love`);
await page.fill("#name", "Фото");
await page.fill("#email", `inline${Date.now()}@test.local`);
await page.fill("#password", "secret123");
await page.check("input[name=consent]");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/new/);
await page.fill("#recipientName", "Али");
await page.click("button[type=submit]");
await page.waitForURL(/\/books\/[0-9a-f-]{36}$/);
const bookUrl = page.url();
await page.goto(`${bookUrl}/questions?q=7`);
const para = "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег. Я опаздывала на встречу, а ты стоял у входа в кофейню и держал дверь — так неловко и так галантно одновременно, что я рассмеялась. ";
await page.fill("#answer", Array.from({ length: 9 }, () => para.repeat(2)).join("\n"));
await page.getByRole("button", { name: /Фото в ответ/ }).click();
await page.setInputFiles("input[type=file][accept='image/*']", img);
await page.waitForSelector("text=Загрузить с устройства");
await page.waitForFunction(() => document.querySelectorAll("figure img").length > 0, null, { timeout: 30000 });
await page.keyboard.press("Escape");
const inspector = page.getByTestId("photo-inspector");
await inspector.waitFor({ timeout: 10000 });
await inspector.getByPlaceholder("Например: Алматы, лето 2019").fill("Наш первый снег");
await inspector.getByRole("button", { name: "M", exact: true }).click();
await inspector.getByRole("radio", { name: "1:1" }).click();
await inspector.getByRole("radio", { name: /Полароид/ }).click();
await inspector.getByLabel("Место фото в тексте").selectOption("3");
const picker = await page.getByTestId("focus-picker").boundingBox();
await page.mouse.click(picker.x + 4, picker.y + picker.height / 2);
await page.waitForTimeout(600);

// Уголок в превью: тянем влево — фото уменьшается.
const aside = page.locator("aside").filter({ hasText: "Так будет в книге" });
// Превью рисует страницы как копии одного потока, поэтому берём видимую копию.
const visible = async (loc) => {
  const ab = await aside.boundingBox();
  for (const el of await loc.all()) {
    const b = await el.boundingBox();
    if (b && b.x >= ab.x - 12 && b.x + b.width <= ab.x + ab.width + 12) return [el, b];
  }
  throw new Error("no visible element");
};
await aside.getByRole("slider", { name: "Размер фото" }).first().waitFor({ state: "attached" });
const [handle0] = await visible(aside.getByRole("slider", { name: "Размер фото" }));
await handle0.evaluate((el) => el.closest(".overflow-y-auto").scrollBy(0, el.getBoundingClientRect().top - el.closest(".overflow-y-auto").getBoundingClientRect().top - 200));
await page.waitForTimeout(200);
const [handle, hb] = await visible(aside.getByRole("slider", { name: "Размер фото" }));
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await page.mouse.move(hb.x - 30, hb.y, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(400);
const widthAfterResize = Number(await handle.getAttribute("aria-valuenow"));
console.log("width after corner drag:", widthAfterResize);

// Перетаскиваем фото к первому абзацу — оно встаёт перед текстом.
await aside.locator(".overflow-y-auto").evaluate((el) => (el.scrollTop = 0));
await inspector.getByLabel("Место фото в тексте").selectOption("1"); // после 1-го абзаца — рядом с началом страницы
await page.waitForTimeout(500);
await page.waitForTimeout(200);
const [, fb] = await visible(aside.locator("figure[data-photo]"));
console.log("figure box", fb);
const [, p0] = await visible(aside.locator("p[data-para='0']"));
await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
await page.mouse.down();
await page.mouse.move(p0.x + 40, p0.y + 3, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(400);
const posAfterDrag = await inspector.getByLabel("Место фото в тексте").inputValue();
console.log("position after drag:", posAfterDrag);

await inspector.getByRole("button", { name: "Повернуть" }).click();
await page.waitForFunction(() => !document.querySelector("[data-testid=photo-inspector] .animate-spin"), null, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/inline-editor.png`, fullPage: false });
await aside.screenshot({ path: `${out}/inline-preview.png` });

await page.reload();
await page.getByTestId("inline-photo-thumb").first().waitFor();
const persisted = await page.getByTestId("inline-photo-thumb").first().innerText();
console.log("persisted width label:", persisted);
await page.locator("aside .relative.bg-white").first().waitFor();
await page.waitForTimeout(1000);
const previewPages = await page.locator("aside .relative.bg-white").count();
console.log("preview pages:", previewPages);
const bookId = bookUrl.split("/").pop();
const pdf = await page.evaluate(async (id) => {
  const r = await fetch(`/api/books/${id}/preview`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return [r.status, buf.length, btoa(bin)];
}, bookId);
const { writeFileSync } = await import("node:fs");
writeFileSync(`${out}/inline-preview.pdf`, Buffer.from(pdf[2], "base64"));
pdf.length = 2;
console.log("preview pdf:", pdf, "book", bookId);
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
const ok = previewPages >= 2 && widthAfterResize < 50 && posAfterDrag === "0" && persisted.includes(`${widthAfterResize}%`) && pdf[0] === 200;
process.exit(ok ? 0 : 1);
