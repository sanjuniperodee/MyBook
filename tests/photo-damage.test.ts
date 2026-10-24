import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { decodeHeicInThread, isDisplayP3, isHeic } from "@/modules/authoring/infrastructure/heic";
import { hasGreenBlock, processUpload } from "@/modules/authoring/infrastructure/images";

/** Живое фото — шум и градиент, как на снимке: без единого сплошного пятна. */
async function scene(w: number, h: number, patch?: { x: number; y: number; w: number; h: number; color: { r: number; g: number; b: number } }) {
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const n = ((x * 7919 + y * 104729) % 23) - 11;
      raw[i] = Math.max(0, Math.min(255, 120 + (x / w) * 90 + n));
      raw[i + 1] = Math.max(0, Math.min(255, 110 + (y / h) * 80 + n));
      raw[i + 2] = Math.max(0, Math.min(255, 100 + n * 2));
    }
  if (patch) for (let y = patch.y; y < patch.y + patch.h; y++) for (let x = patch.x; x < patch.x + patch.w; x++) {
    const i = (y * w + x) * 3;
    raw[i] = patch.color.r;
    raw[i + 1] = patch.color.g;
    raw[i + 2] = patch.color.b;
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
}

describe("фото, повреждённое телефоном (зелёные квадраты)", () => {
  it("сплошной зелёный прямоугольник замечается при загрузке; обычное фото — нет", async () => {
    const green = { r: 0, g: 140, b: 0 };
    expect((await processUpload(await scene(1200, 1600, { x: 400, y: 0, w: 330, h: 230, color: green }))).damaged).toBe(true);
    expect((await processUpload(await scene(1600, 1200, { x: 1000, y: 40, w: 300, h: 220, color: green }))).damaged).toBe(true);
    expect((await processUpload(await scene(1200, 1600))).damaged).toBe(false);
  });

  it("не путает с обычной зеленью и с мелким пятном: траву, небольшой блик и весь кадр не трогает", async () => {
    // Трава: зелёный с заметным красным и синим — не «чистый».
    expect((await processUpload(await scene(1200, 1600, { x: 100, y: 900, w: 900, h: 600, color: { r: 70, g: 140, b: 60 } }))).damaged).toBe(false);
    // Крошечное чисто-зелёное пятно (меньше 0,8% кадра) — например, вывеска.
    expect((await processUpload(await scene(1200, 1600, { x: 100, y: 100, w: 60, h: 40, color: { r: 0, g: 150, b: 0 } }))).damaged).toBe(false);
    // Весь кадр зелёный — это не «квадрат».
    const raw = Buffer.alloc(120 * 120 * 3);
    for (let i = 0; i < raw.length; i += 3) raw[i + 1] = 150;
    expect(hasGreenBlock(raw, 120, 120)).toBe(false);
  });
});

describe("фото с iPhone в оригинале (HEIC)", () => {
  const heic = readFileSync(path.join(__dirname, "fixtures/sample.heic"));

  it("распознаётся по ftyp; JPEG, PNG и AVIF — нет", async () => {
    expect(isHeic(heic)).toBe(true);
    expect(isHeic(await scene(200, 200))).toBe(false);
    expect(isHeic(Buffer.from("00000020667479706176696600000000", "hex"))).toBe(false);
    expect(isHeic(Buffer.alloc(8))).toBe(false);
    // Профиль Display P3 в файле (так снимает iPhone) находится.
    expect(isDisplayP3(heic)).toBe(true);
    expect(isDisplayP3(await scene(100, 100))).toBe(false);
  });

  it("HEIC принимается как фото: JPEG нужного размера, повёрнут как на экране, без квадратов", async () => {
    const img = await processUpload(heic);
    const meta = await sharp(img.full).metadata();
    expect(meta.format).toBe("jpeg");
    expect(img.width).toBe(meta.width);
    // Образец — снимок орла 4:3 с поворотом: на выходе столько же пикселей, сколько на экране телефона.
    expect(img.width).toBeGreaterThan(200);
    expect(img.height).toBeGreaterThan(200);
    expect(img.damaged).toBe(false);
    expect((await sharp(img.thumb).metadata()).width).toBeLessThanOrEqual(1000);
  });

  it("раскодирование идёт в отдельном потоке и даёт RGBA с поворотом и P3 → sRGB", async () => {
    const out = await decodeHeicInThread(heic, true);
    expect(out).not.toBeNull();
    expect(out!.data.length).toBe(out!.width * out!.height * 4);
    // Без перевода цвета и с ним картинка отличается (профиль учтён).
    const plain = await decodeHeicInThread(heic, false);
    expect(Buffer.compare(out!.data, plain!.data)).not.toBe(0);
  });

  it("цвет сохраняется: Display P3 переведён в sRGB, картинка не пустая и не серая", async () => {
    const img = await processUpload(heic);
    const { channels } = await sharp(img.full).stats();
    const mean = channels.map((c) => c.mean);
    expect(Math.max(...mean)).toBeGreaterThan(40);
    // На снимке зелень и серый камень: зелёный канал заметно выше синего.
    expect(mean[1]).toBeGreaterThan(mean[2]);
    expect(channels[0].stdev).toBeGreaterThan(20);
  });

  it("битый HEIC — ошибка (сервис ответит «формат не поддерживается»)", async () => {
    const broken = Buffer.concat([heic.subarray(0, 2000), Buffer.alloc(500)]);
    await expect(processUpload(broken)).rejects.toThrow();
  });
});
