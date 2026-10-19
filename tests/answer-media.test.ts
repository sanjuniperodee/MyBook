import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { layoutMedia, MAX_MEDIA, mediaCardBox, mediaSource, normalizeMedia, parseMediaUrl, qrDrawing, qrInk, youtubeId } from "@/lib/book/answer-media";
import { assembleBookContent, type BookLike, type BookTexts } from "@/lib/book/layout";
import { estimatePages } from "@/lib/book/estimate";

describe("ссылки на видео и музыку", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ"],
    ["youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "https://youtu.be/dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", "https://youtu.be/dQw4w9WgXcQ?t=90"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abcdef&t=42", "https://youtu.be/dQw4w9WgXcQ?t=42"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?si=x", "https://youtu.be/dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123", "https://youtu.be/dQw4w9WgXcQ?list=PL123"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=zz", "https://music.youtube.com/watch?v=dQw4w9WgXcQ"],
  ])("%s → %s", (raw, url) => {
    expect(parseMediaUrl(raw)?.url).toBe(url);
    expect(parseMediaUrl(raw)?.youtubeId).toBe("dQw4w9WgXcQ");
  });

  it("остальные ссылки — как есть, с названием площадки", () => {
    expect(parseMediaUrl("https://www.instagram.com/reel/abc/")).toEqual({ url: "https://www.instagram.com/reel/abc/", youtubeId: null, source: "Instagram" });
    expect(parseMediaUrl("drive.google.com/file/d/1/view")?.source).toBe("Google Drive");
    expect(parseMediaUrl("https://www.youtube.com/playlist?list=PL1")).toMatchObject({ youtubeId: null, source: "YouTube" });
    expect(mediaSource("https://example.kz/video")).toBe("example.kz");
  });

  it("не ссылки отклоняются", () => {
    for (const raw of ["", "привет", "hello", "javascript:alert(1)", "ftp://x.kz/a", "https://youtu.be/ dQw4w9WgXcQ", `https://x.kz/${"a".repeat(700)}`]) expect(parseMediaUrl(raw)).toBeNull();
    expect(youtubeId("https://youtu.be/short")).toBeNull();
  });

  it("список приводится к рабочему виду: битые и дубли выброшены, подпись без лишних пробелов", () => {
    const list = normalizeMedia([
      { id: "a", kind: "music", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "  Кюй   «Адай»  ", anchor: 1.4 },
      { id: "a", kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", title: "", anchor: null },
      { id: "b", kind: "video", url: "не ссылка", title: "", anchor: null },
      { id: "c", url: "https://youtu.be/dQw4w9WgXcQ", anchor: -5 },
    ]);
    expect(list).toEqual([
      { id: "a", kind: "music", url: "https://youtu.be/dQw4w9WgXcQ", title: "Кюй «Адай»", anchor: 1 },
      { id: "c", kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", title: "", anchor: -1 },
    ]);
    const many = Array.from({ length: MAX_MEDIA + 3 }, (_, i) => ({ id: `m${i}`, kind: "video" as const, url: "https://youtu.be/dQw4w9WgXcQ", title: "", anchor: null }));
    expect(normalizeMedia(many)).toHaveLength(MAX_MEDIA);
  });

  it("места в тексте — как у фото: последний абзац и дальше — в конце", () => {
    const m = (id: string, anchor: number | null) => ({ id, anchor });
    const map = layoutMedia([m("a", -1), m("b", 0), m("c", 2), m("d", null)], 3);
    expect([...map.entries()].map(([k, v]) => [k, v.map((x) => x.id)])).toEqual([
      [-1, ["a"]],
      [0, ["b"]],
      [Number.POSITIVE_INFINITY, ["c", "d"]],
    ]);
  });
});

describe("QR-код в книге", () => {
  it("рисунок совпадает с кодом библиотеки модуль в модуль", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    const d = qrDrawing(url, 60, "#141414");
    expect(d.w).toBe(60);
    const path = d.shapes.find((s) => s.kind === "path");
    if (path?.kind !== "path") throw new Error("нет контура");
    // Тёмные модули по контуру: каждая полоса — M x,y h w.
    const dark = new Set<string>();
    for (const [, x, y, w] of path.d.matchAll(/M(\d+),(\d+)h(\d+)/g)) for (let i = 0; i < Number(w); i++) dark.add(`${Number(x) + i - 2},${Number(y) - 2}`);
    const { size, data } = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
    const expected = new Set<string>();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y * size + x]) expected.add(`${x},${y}`);
    expect(dark).toEqual(expected);
    // Короткая ссылка YouTube — крупные модули: больше 0,6 мм на стороне кода 60 pt.
    expect((60 / (size + 4)) * (25.4 / 72)).toBeGreaterThan(0.6);
  });

  it("светлые чернила оформления заменяются тёмными — код должен читаться", () => {
    expect(qrInk("#2B2B2B")).toBe("#2B2B2B");
    expect(qrInk("#C9A24A")).toBe("#141414");
  });

  it("карточка: колонка текста помещается, высота не зависит от подписи", () => {
    const box = mediaCardBox(300, 1);
    expect(box.textWidth).toBeGreaterThan(150);
    expect(box.height).toBeCloseTo(box.qr + box.pad * 2 + box.border * 2);
  });

  it("ответ только с QR-кодом попадает в книгу и в оценку объёма", () => {
    const book: BookLike = {
      theme: "love",
      language: "ru",
      title: "",
      subtitle: "",
      authorName: "",
      authorGender: "f",
      recordedBy: "",
      recipientName: "",
      recipientGender: "m",
      dedication: "",
      interior: "classic",
      format: "a5",
      photoPlacement: "chapters",
      showToc: false,
      coverPhotoId: null,
    };
    const texts: BookTexts = { chapter: () => ({ title: "Глава" }), misc: "", untitledChapter: "", letters: { title: "" }, defaultTitle: "", galleryTitle: "" };
    const q = (media: object[]) => [{ id: "q", chapter: "meet", position: 0, title: "Пожелания", displayText: null, hideHeading: false, answer: "", questionKey: null, media }];
    const empty = assembleBookContent(book, q([]), [], texts);
    expect(empty.chapters).toHaveLength(0);
    const cards = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", title: "Тілек 🎉", anchor: null }));
    const content = assembleBookContent(book, q(cards), [], texts);
    expect(content.chapters[0].items[0].media?.[0].title).toBe("Тілек");
    // Восемь карточек ≈ 8 × 30 мм — больше одной полосы текста.
    expect(estimatePages(content)).toBeGreaterThan(estimatePages(assembleBookContent(book, q(cards.slice(0, 1)), [], texts)));
  });
});
