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

// Перетаскиваем фото на другой абзац.
await inspector.getByLabel("Место фото в тексте").selectOption("3"); // после 3-го абзаца — дальше перетащим выше
await page.waitForTimeout(500);
// Превью показывает всю книгу: ждём, пока оно докрутит к текущему ответу, и ставим фото в видимую часть.
await page.waitForTimeout(1600);
const fb = await page.evaluate(() => {
  const box = [...document.querySelectorAll("aside")].find((a) => a.textContent.includes("Так будет в книге")).querySelector(".overflow-y-auto");
  const inAside = (r) => r.width > 0 && r.left >= box.getBoundingClientRect().left - 12 && r.right <= box.getBoundingClientRect().right + 12;
  const fig = [...box.querySelectorAll("figure[data-photo]")].find((n) => inAside(n.getBoundingClientRect()));
  if (!fig) return null;
  box.scrollTop += fig.getBoundingClientRect().top - box.getBoundingClientRect().top - 260;
  const r = fig.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
});
await page.waitForTimeout(400);
console.log("figure box", fb);
// Берём видимый абзац ответа (копии потока на других страницах обрезаны) и бросаем фото на его верхнюю половину:
// фото должно встать перед этим абзацем, то есть после абзаца i−1 — в списке это позиция i.
const target = await page.evaluate(() => {
  const box = [...document.querySelectorAll("aside")].find((a) => a.textContent.includes("Так будет в книге")).querySelector(".overflow-y-auto").getBoundingClientRect();
  for (const node of document.querySelectorAll("p[data-para]")) {
    const i = Number(node.dataset.para);
    if (i < 1 || i === 3) continue; // перед абзацем 3 фото уже стоит — ищем другое место
    for (const r of node.getClientRects()) {
      if (r.top < box.top + 20 || r.top + 10 > box.bottom) continue;
      if (document.elementFromPoint(r.left + 20, r.top + 3) === node) return { i, x: r.left + 20, y: r.top + 3 };
    }
  }
  return null;
});
if (!target) throw new Error("no visible paragraph to drop on");
const p0 = { x: target.x - 40, y: target.y - 3 };
// Замеряем фото ещё раз непосредственно перед нажатием: превью могло докрутиться.
const fb2 = await page.evaluate(() => {
  const box = [...document.querySelectorAll("aside")].find((a) => a.textContent.includes("Так будет в книге")).querySelector(".overflow-y-auto");
  for (const fig of box.querySelectorAll("figure[data-photo]")) {
    const r = fig.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && fig.contains(hit)) return { x: r.left, y: r.top, width: r.width, height: r.height };
  }
  return null;
});
if (!fb2) throw new Error("photo not visible in preview");
await page.mouse.move(fb2.x + fb2.width / 2, fb2.y + fb2.height / 2);
await page.mouse.down();
await page.mouse.move(p0.x + 40, p0.y + 3, { steps: 12 });
if (process.env.DEBUG_DROP) console.log("p0", p0, await page.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 6).map((e) => `${e.tagName}.${JSON.stringify(e.dataset)}`), [p0.x + 40, p0.y + 3]), await page.locator(".pointer-events-none.fixed").allInnerTexts());
await page.mouse.up();
await page.waitForTimeout(400);
if (process.env.DEBUG_DROP) {
  console.log("target", target, "inspector:", await page.getByTestId("photo-inspector").count());
  await page.screenshot({ path: `${out}/after-drop.png` });
}
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
const ok = previewPages >= 2 && widthAfterResize < 50 && posAfterDrag === String(target.i) && persisted.includes(`${widthAfterResize}%`) && pdf[0] === 200;
process.exit(ok ? 0 : 1);
