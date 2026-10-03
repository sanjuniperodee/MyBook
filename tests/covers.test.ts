import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { coverMoods, coverTemplates, renderCoverSvg } from "@/lib/book/covers";
import { messagesFor } from "@/i18n/messages";
import { coverFrontGeometry, coverSpreadGeometry, getFormat } from "@/lib/book/formats";

describe("обложки", () => {
  it("уникальные id и допустимое настроение", () => {
    const ids = coverTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(coverTemplates.length).toBeGreaterThanOrEqual(20);
    for (const t of coverTemplates) expect(coverMoods.includes(t.mood)).toBe(true);
  });

  it("у каждой обложки есть название на обоих языках", () => {
    for (const locale of ["ru", "kk"] as const)
      for (const t of coverTemplates) expect(messagesFor(locale).catalog.covers[t.id], `${locale}: ${t.id}`).toBeTruthy();
  });

  it.each(coverTemplates.map((t) => t.id))("%s растрируется — превью и развёртка", async (id) => {
    const t = coverTemplates.find((x) => x.id === id)!;
    for (const g of [coverFrontGeometry(getFormat("a5")), coverSpreadGeometry(getFormat("square"), 96)]) {
      const svg = renderCoverSvg(t, g, { uid: `t${id}` }, { pxPerMm: 0.6, noTexture: true });
      expect(svg).not.toMatch(/NaN|undefined/);
      const meta = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
      expect(meta.info.width).toBe(Math.round(g.width * 0.6));
    }
  });
});

describe("фон обложки отдельным файлом", () => {
  const get = async (file: string, encoding = "") => {
    const { GET } = await import("@/app/api/covers/[file]/route");
    return GET(new Request(`http://x/api/covers/${file}`, { headers: { "accept-encoding": encoding } }), { params: Promise.resolve({ file }) });
  };

  it("совпадает с рисунком для печати и кэшируется навсегда", async () => {
    const res = await get("blossom-a5.svg");
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("immutable");
    const t = coverTemplates.find((x) => x.id === "blossom")!;
    expect(await res.text()).toBe(renderCoverSvg(t, coverFrontGeometry(getFormat("a5")), { uid: "blossoma5" }));
  });

  it("сжимается: brotli, если браузер умеет, иначе gzip", async () => {
    const { brotliDecompressSync, gunzipSync } = await import("node:zlib");
    const raw = await (await get("oyu-square-lite.svg")).text();
    const br = await get("oyu-square-lite.svg", "gzip, deflate, br");
    expect(br.headers.get("content-encoding")).toBe("br");
    expect(brotliDecompressSync(Buffer.from(await br.arrayBuffer())).toString()).toBe(raw);
    const gz = await get("oyu-square-lite.svg", "gzip");
    expect(gz.headers.get("content-encoding")).toBe("gzip");
    expect(gunzipSync(Buffer.from(await gz.arrayBuffer())).toString()).toBe(raw);
  });

  it("неизвестный шаблон или формат — 404", async () => {
    for (const file of ["nope-a5.svg", "blossom-a4.svg", "../etc-a5.svg", "blossom-a5.png"]) await expect(get(file)).rejects.toThrow();
  });
});
