import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { allCoverTemplates, coverMoods, coverTemplates, getCoverTemplate, isKnownCover, pickerCovers, renderCoverSvg } from "@/lib/book/covers";
import { photoPlacement } from "@/lib/book/photo-cover";
import { messagesFor } from "@/i18n/messages";
import { coverFrontGeometry, coverSpreadGeometry, getFormat } from "@/lib/book/formats";

describe("обложки", () => {
  it("уникальные id и допустимое настроение", () => {
    const ids = allCoverTemplates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(coverTemplates.length).toBeGreaterThanOrEqual(20);
    for (const t of allCoverTemplates) expect(coverMoods.includes(t.mood)).toBe(true);
  });

  it("у каждой обложки есть название на обоих языках", () => {
    for (const locale of ["ru", "kk"] as const)
      for (const t of allCoverTemplates) expect(messagesFor(locale).catalog.covers[t.id], `${locale}: ${t.id}`).toBeTruthy();
  });

  it.each(allCoverTemplates.map((t) => t.id))("%s растрируется — превью и развёртка", async (id) => {
    const t = allCoverTemplates.find((x) => x.id === id)!;
    for (const g of [coverFrontGeometry(getFormat("a5")), coverSpreadGeometry(getFormat("square"), 96)]) {
      const svg = renderCoverSvg(t, g, { uid: `t${id}` }, { pxPerMm: 0.6, noTexture: true });
      expect(svg).not.toMatch(/NaN|undefined/);
      const meta = await sharp(Buffer.from(svg)).png().toBuffer({ resolveWithObject: true });
      expect(meta.info.width).toBe(Math.round(g.width * 0.6));
    }
  });
});

describe("обложки на снимках", () => {
  const photos = allCoverTemplates.filter((t) => t.photo);

  it("коллекция снимков открывает выбор, рисованные с заменой убраны из выбора, но открываются", () => {
    expect(photos.length).toBeGreaterThanOrEqual(20);
    expect(coverTemplates[0].photo).toBeTruthy();
    expect(pickerCovers().some((t) => t.id === "blossom")).toBe(false);
    expect(isKnownCover("blossom")).toBe(true);
    expect(getCoverTemplate("blossom").id).toBe("blossom");
  });

  it.each(photos.map((t) => t.id))("%s: кадр лица в превью и в развёртке один и тот же", (id) => {
    const t = getCoverTemplate(id);
    for (const format of ["a5", "square"]) {
      const f = getFormat(format);
      const front = coverFrontGeometry(f);
      for (const pages of [24, 200]) {
        const spread = coverSpreadGeometry(f, pages);
        const a = photoPlacement(t.photo!, front);
        const b = photoPlacement(t.photo!, spread);
        // Положение снимка относительно лицевой крышки не зависит от толщины книги.
        expect(b.x - spread.front.x).toBeCloseTo(a.x - front.front.x, 6);
        expect(b.y - spread.front.y).toBeCloseTo(a.y - (front.front.y - 3), 6);
        expect(b.w).toBeCloseTo(a.w, 6);
        // Лицо закрыто снимком или подложкой — снимок не уезжает за пределы лица целиком.
        expect(a.x).toBeLessThan(front.front.w);
        expect(a.x + a.w).toBeGreaterThan(0);
      }
    }
  });

  it("на обороте при mirror повторяется только плашка и рамка, снимок не рисуется дважды", () => {
    const t = getCoverTemplate("roses");
    const g = coverSpreadGeometry(getFormat("a5"), 120);
    const svg = renderCoverSvg(t, g, { uid: "r", imageHref: "data:image/jpeg;base64,AAAA" });
    expect(svg.match(/<image /g)?.length).toBe(1);
  });
});

describe("обложки с фото клиента", () => {
  const client = allCoverTemplates.filter((t) => t.requiresPhoto);

  it("у каждой — снимки-примеры с людьми, у каждого снимка указан автор", async () => {
    const { existsSync } = await import("node:fs");
    const { samplePhotos } = await import("@/lib/book/sample-photos");
    expect(client.length).toBeGreaterThanOrEqual(25);
    for (const t of client) {
      expect(t.samples?.length, t.id).toBeGreaterThan(0);
      for (const k of t.samples!) expect(samplePhotos[k]?.credit, `${t.id}: ${k}`).toBeTruthy();
    }
    for (const k of Object.keys(samplePhotos)) expect(existsSync(`assets/cover-photos/${k}.jpg`), k).toBe(true);
  });

  it.each(client.map((t) => t.id))("%s: пустые места — снимками-примерами, если их можно загрузить", (id) => {
    const t = getCoverTemplate(id);
    const slots = Math.max(1, t.photoSlots ?? 1);
    const svg = renderCoverSvg(t, coverFrontGeometry(getFormat("a5")), { uid: "s", sampleHref: (k) => `/api/cover-photos/${k}` }, { noTexture: true });
    expect(svg.match(/<image /g)?.length).toBe(slots);
    expect(svg).not.toContain("ssky");
  });

  it("повёрнутые карточки сообщают редактору поворот и центр", async () => {
    const { frontSlotBoxes } = await import("@/lib/book/photo-slots");
    const boxes = frontSlotBoxes(getCoverTemplate("stack"), getFormat("a5"));
    expect(boxes).toHaveLength(3);
    for (const b of boxes) {
      expect(b.rotate).toBeTruthy();
      expect(b.origin!.x).toBeGreaterThan(0);
      expect(b.origin!.x).toBeLessThan(1);
    }
    expect(frontSlotBoxes(getCoverTemplate("arch"), getFormat("a5"))[0].rotate).toBeUndefined();
  });

  it("текст можно выключить влево и поставить имена над названием", () => {
    const t = getCoverTemplate("split");
    expect(t.align).toBe("left");
    expect(t.namesFirst).toBe(true);
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
    const t = getCoverTemplate("blossom");
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

  it("обложка на снимке — JPEG, рисованная по адресу .jpg не отдаётся", async () => {
    const res = await get("sakura-a5-lite.jpg");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.width).toBe(420);
    await expect(get("blossom-a5.jpg")).rejects.toThrow();
    await expect(get("sakura-a5.svg")).rejects.toThrow();
  }, 60000);

  it("обложка на снимке по адресу .webp — WebP той же ширины и заметно легче JPEG; рисованная и по .webp не отдаётся", async () => {
    const webp = await get("sakura-a5-lite.webp");
    expect(webp.headers.get("content-type")).toBe("image/webp");
    const bytes = Buffer.from(await webp.arrayBuffer());
    expect((await sharp(bytes).metadata())).toMatchObject({ format: "webp", width: 420 });
    const jpg = Buffer.from(await (await get("sakura-a5-lite.jpg")).arrayBuffer());
    expect(bytes.length).toBeLessThan(jpg.length * 0.8);
    await expect(get("blossom-a5.webp")).rejects.toThrow();
    await expect(get("sakura-a5.svg")).rejects.toThrow();
  }, 60000);

  it("обложка с фото клиента — JPEG на снимке-примере, SVG по её адресу не отдаётся", async () => {
    const res = await get("arch-a5-lite.jpg");
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(420);
    await expect(get("arch-a5.svg")).rejects.toThrow();
  }, 60000);

  it("неизвестный шаблон или формат — 404", async () => {
    for (const file of ["nope-a5.svg", "blossom-a4.svg", "../etc-a5.svg", "blossom-a5.png"]) await expect(get(file)).rejects.toThrow();
  });
});
