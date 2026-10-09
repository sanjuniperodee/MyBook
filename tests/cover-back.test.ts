import { describe, expect, it } from "vitest";
import { backContent, backLayouts, backPhotoIds, countLines, designBack, fitSize, type BackContent } from "@/lib/book/cover-back";
import { coverTemplates, getCoverTemplate, renderCoverSvg } from "@/lib/book/covers";
import { coverFrontGeometry, coverSpreadGeometry, getFormat } from "@/lib/book/formats";

const W = 154;
const H = 216;
const content = (over: Partial<BackContent> = {}): BackContent => ({
  layout: "quote",
  text: "Каждая страница этой книги — о тебе. О том, как мы смеялись до слёз и всё равно выбирали друг друга.",
  signature: "Алия",
  names: "Алия & Марғұлан",
  year: 2026,
  photos: [],
  ...over,
});
const inside = (outer: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  b.x >= outer.x - 0.01 && b.y >= outer.y - 0.01 && b.x + b.w <= outer.x + outer.w + 0.01 && b.y + b.h <= outer.y + outer.h + 0.01;

describe("подбор кегля", () => {
  it("строки считаются по словам и абзацам", () => {
    expect(countLines("", 4, 100, "cormorant")).toBe(1);
    expect(countLines("Короткая фраза", 4, 100, "cormorant")).toBe(1);
    expect(countLines("строка\nещё строка", 4, 100, "cormorant")).toBe(2);
    expect(countLines("слово ".repeat(60), 4, 60, "cormorant")).toBeGreaterThan(5);
  });

  it("короткий текст — крупно, длинный — мельче, но не меньше минимума", () => {
    const short = fitSize("Ты — моё всё.", 100, 60, "cormorant", 3, 6, 1.45);
    const long = fitSize("Очень длинный текст ".repeat(20), 100, 60, "cormorant", 3, 6, 1.45);
    expect(short).toBe(6);
    expect(long).toBeLessThan(short);
    expect(long).toBeGreaterThanOrEqual(3);
  });
});

describe("раскладка задней стороны", () => {
  it("на каждом шаблоне и в каждом варианте всё внутри крышки, а текст длиной до предела помещается в свою область", () => {
    const long = "Мама, эту книгу я писала тебе почти месяц. ".repeat(9).slice(0, 400);
    for (const t of coverTemplates)
      for (const layout of backLayouts) {
        const d = designBack(t, W, H, content({ layout, text: long, photos: [{ width: 1600, height: 1200 }, { width: 1200, height: 1600 }, { width: 1500, height: 1500 }] }));
        expect(d.layout).toBe(layout);
        for (const b of d.blocks) expect(inside({ x: 0, y: 0, w: W, h: H }, b), `${t.id}/${layout}/${b.kind}`).toBe(true);
        expect(d.brand.y).toBeLessThan(H);
      }
  });

  it("на повторённой композиции лица текст — там же, где название, и в цветах надписей лица", () => {
    const linen = getCoverTemplate("linen");
    const d = designBack(linen, W, H, content());
    const area = { x: linen.textArea.x * W, y: linen.textArea.y * H, w: linen.textArea.w * W, h: linen.textArea.h * H };
    for (const b of d.blocks) expect(inside(area, b)).toBe(true);
    expect(d.blocks.find((b) => b.kind === "text")).toMatchObject({ color: linen.title.color, italic: true, align: "center" });
  });

  it("варианты переходят в подходящий, когда не хватает содержимого", () => {
    const t = getCoverTemplate("blossom");
    expect(designBack(t, W, H, content({ layout: "photo", photos: [] })).layout).toBe("quote");
    expect(designBack(t, W, H, content({ layout: "fullPhoto", photos: [] })).layout).toBe("quote");
    expect(designBack(t, W, H, content({ layout: "polaroids", photos: [{ width: 10, height: 10 }] })).layout).toBe("photo");
    expect(designBack(t, W, H, content({ layout: "polaroids", photos: [] })).layout).toBe("quote");
    expect(designBack(t, W, H, content({ layout: "quote", text: "  " })).layout).toBe("minimal");
    expect(designBack(t, W, H, content({ layout: "letter", text: "" })).layout).toBe("minimal");
    const minimal = designBack(t, W, H, content({ layout: "minimal" }));
    expect(minimal.blocks.map((b) => (b.kind === "text" ? b.text : b.kind))).toEqual(["ornament", "Алия & Марғұлан", "2026"]);
  });

  it("письмо — слева с подписью справа, фото — в пропорциях снимка", () => {
    const t = getCoverTemplate("sage");
    const letter = designBack(t, W, H, content({ layout: "letter" }));
    expect(letter.blocks.map((b) => (b.kind === "text" ? b.align : b.kind))).toEqual(["left", "right"]);
    const photo = designBack(t, W, H, content({ layout: "photo", text: "", photos: [{ width: 1200, height: 1600 }] }));
    const p = photo.blocks.find((b) => b.kind === "photo")!;
    expect(p.kind === "photo" && (p.w - p.mat * 2) / (p.h - p.mat * 2)).toBeCloseTo(0.75, 2);
  });

  it("содержимое берётся из книги: год повода, иначе текущий", () => {
    const book = { backLayout: "nope", backText: "Привет", authorName: " Алия ", recipientName: "Марғұлан", hideRecipientOnCover: false, occasionDate: "2027-02-14" };
    expect(backContent(book, [], new Date("2026-10-01"))).toMatchObject({ layout: "quote", signature: "Алия", names: "Алия & Марғұлан", year: 2027 });
    expect(backContent({ ...book, occasionDate: null }, [], new Date("2026-10-01")).year).toBe(2026);
  });

  it("фото во всю: снимок на всю крышку, затемнение и светлый текст внизу", () => {
    const d = designBack(getCoverTemplate("blossom"), W, H, content({ layout: "fullPhoto", photos: [{ width: 1600, height: 1200 }] }));
    expect(d.blocks.slice(0, 2)).toMatchObject([
      { kind: "photo", frame: "bleed", slot: 0, x: 0, y: 0, w: W, h: H },
      { kind: "shade", x: 0, y: 0, w: W, h: H },
    ]);
    const texts = d.blocks.filter((b) => b.kind === "text");
    expect(texts.length).toBeGreaterThan(0);
    for (const b of texts) {
      expect(b.y).toBeGreaterThan(H * 0.55);
      expect(b.kind === "text" && b.color).toMatch(/^#F/);
    }
    expect(d.brand.color).toBe("#FFFFFF");
  });

  it("полароиды: по карточке на фото (до трёх), подпись — ниже карточек, рисунок без повтора лица", () => {
    const photos = Array.from({ length: 4 }, () => ({ width: 1200, height: 900 }));
    for (const count of [2, 3, 4]) {
      const d = designBack(getCoverTemplate("linen"), W, H, content({ layout: "polaroids", photos: photos.slice(0, count) }));
      const cards = d.blocks.filter((b) => b.kind === "photo");
      expect(cards.map((b) => b.kind === "photo" && b.slot)).toEqual([0, 1, 2].slice(0, Math.min(3, count)));
      for (const c of cards) expect(c.kind === "photo" && c.frame === "polaroid" && c.rotate).toBeTruthy();
      const lowest = Math.max(...cards.map((c) => c.y + c.h));
      for (const b of d.blocks.filter((b) => b.kind === "text")) expect(b.y).toBeGreaterThan(lowest);
      expect(d.plainArt).toBe(true);
    }
  });

  it("фото оборота: основное и остальные, без пустых и повторов", () => {
    expect(backPhotoIds({ backPhotoId: "a", backPhotoExtra: ["b", "a", "c"] })).toEqual(["a", "b", "c"]);
    expect(backPhotoIds({ backPhotoId: null, backPhotoExtra: ["b"] })).toEqual(["b"]);
  });
});

describe("повтор композиции лица на обороте", () => {
  it("рисуется только на развёртке и только у шаблонов с mirror", () => {
    const spread = coverSpreadGeometry(getFormat("a5"), 120);
    const linen = getCoverTemplate("linen");
    const mountains = getCoverTemplate("mountains");
    expect(renderCoverSvg(linen, spread, { uid: "x" })).toContain('clip-path="url(#xbkc)"');
    expect(renderCoverSvg(mountains, spread, { uid: "x" })).not.toContain("xbkc");
    expect(renderCoverSvg(linen, coverFrontGeometry(getFormat("a5")), { uid: "x" })).not.toContain("xbkc");
  });
});
