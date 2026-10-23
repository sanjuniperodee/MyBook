import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { ART_EXAMPLES } from "@/lib/book/art";
import { runDesignAi, runDesignVariants, type Ask, type CoverState, type DesignOp, type PreviewImage } from "@/lib/book/design-ai";
import { designFromTemplate } from "@/lib/book/cover-design";
import { coverMeta } from "@/lib/book/covers/meta";
import { getCoverTemplate } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import type { Book } from "@/shared/infrastructure/db/schema";
import { hasTool } from "./pdf-inspect";

const dir = mkdtempSync(path.join(tmpdir(), "mybook-polish-"));
process.env.STORAGE_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const texts = { title: "Там, где ты", subtitle: "Книга о нас", names: "Элия & Олжас" };
const book = { title: "Там, где ты", kind: "gift", language: "ru" as const, format: formats.a5, ui: "ru" as const, texts };
const start = (): CoverState => ({ template: "linen", design: designFromTemplate(coverMeta(getCoverTemplate("linen")), texts, formats.a5) });
const op = (o: DesignOp["op"], path: string, value: unknown): DesignOp => ({ op: o, path, value: JSON.stringify(value) });
const image: PreviewImage = { mime: "image/png", data: "iVBORw0KGgo=" };

/** Подставная модель: ответы по очереди; запоминает, что ей показали. */
function scripted(...answers: unknown[]) {
  const seen: { user: string; images: number }[] = [];
  const ask: Ask = async (req) => {
    seen.push({ user: req.user, images: req.images?.length ?? 0 });
    const a = answers[Math.min(seen.length - 1, answers.length - 1)];
    return { text: JSON.stringify(a), usage: { inputTokens: 10, outputTokens: 5 } };
  };
  return { ask, seen };
}

const draft = { concept: "Ночь", reply: "Готово", ops: [op("set", "background", { kind: "color", color: "#0F1D31" }), op("set", "layers.title.style.color", "#EFE3C4"), op("set", "layers.subtitle.style.color", "#C9B27A"), op("set", "layers.names.style.color", "#C9B27A")] };

describe("осмотр готовой обложки глазами", () => {
  it("модель видит картинку и присылает исправление — оно применяется", async () => {
    const { ask, seen } = scripted(draft, { items: [{ verdict: "fix", defects: ["название мелковато"], ops: [op("set", "layers.title.style.size", 0.1)] }] });
    const res = await runDesignAi(ask, { target: "cover", mode: "create", request: "ночь", state: start(), book, layout: { texts, photos: [] }, preview: async () => image });
    expect(seen).toHaveLength(2);
    expect(seen[0].images).toBe(0);
    expect(seen[1].images).toBe(1);
    expect(seen[1].user).toContain("Режим: осмотр");
    expect(res.polish).toEqual({ defects: ["название мелковато"], fixed: true });
    expect(res.state.design.layers.find((l) => l.id === "title")).toMatchObject({ style: { size: 0.1, color: "#EFE3C4" } });
    // Токены осмотра учтены.
    expect(res.usage.inputTokens).toBe(20);
  });

  it("плохое исправление отбрасывается: прежнее оформление остаётся", async () => {
    const { ask } = scripted(draft, { items: [{ verdict: "fix", defects: ["x"], ops: [op("set", "layers.nope.style.size", 0.1)] }] });
    const res = await runDesignAi(ask, { target: "cover", mode: "create", request: "", state: start(), book, layout: { texts, photos: [] }, preview: async () => image });
    expect(res.polish?.fixed).toBe(false);
    expect(res.state.design.layers.find((l) => l.id === "title")).toMatchObject({ style: { color: "#EFE3C4" } });
    // Исправление, которое ломает читаемость (тёмный текст на тёмном фоне), — тоже мимо.
    const { ask: ask2 } = scripted(draft, { items: [{ verdict: "fix", defects: ["x"], ops: [op("set", "layers.title.style.color", "#101820")] }] });
    const res2 = await runDesignAi(ask2, { target: "cover", mode: "create", request: "", state: start(), book, layout: { texts, photos: [] }, preview: async () => image });
    expect(res2.polish?.fixed).toBe(false);
  });

  it("verdict ok, мусор вместо ответа и отсутствие картинки не ломают ход", async () => {
    const ok = scripted(draft, { items: [{ verdict: "ok", defects: [], ops: [] }] });
    expect((await runDesignAi(ok.ask, { target: "cover", request: "x", state: start(), book, preview: async () => image })).polish).toEqual({ defects: [], fixed: false });
    const bad = scripted(draft, "не json");
    const r = await runDesignAi(bad.ask, { target: "cover", request: "x", state: start(), book, preview: async () => image });
    expect(r.changed).toBe(true);
    const none = scripted(draft);
    const r2 = await runDesignAi(none.ask, { target: "cover", request: "x", state: start(), book, preview: async () => null });
    expect(none.seen).toHaveLength(1);
    expect(r2.polish).toBeUndefined();
    // Без preview — как раньше, один запрос; страницы осмотра не знают.
    const plain = scripted(draft);
    await runDesignAi(plain.ask, { target: "cover", request: "x", state: start(), book });
    expect(plain.seen).toHaveLength(1);
  });

  it("варианты: все картинки — одним запросом, исправление у того варианта, где нашлись недостатки", async () => {
    const variant = (name: string, color: string) => ({ name, idea: name, ops: [op("set", "background", { kind: "color", color }), op("set", "layers.title.style.color", "#FFFFFF"), op("set", "layers.subtitle.style.color", "#FFFFFF"), op("set", "layers.names.style.color", "#FFFFFF")] });
    const first = { reply: "Три", variants: [variant("А", "#102030"), variant("Б", "#203040"), variant("В", "#304050")] };
    const polish = { items: [{ verdict: "ok", defects: [], ops: [] }, { verdict: "fix", defects: ["пусто"], ops: [op("add_art", "back", { art: ART_EXAMPLES[0].spec })] }, { verdict: "ok", defects: [], ops: [] }] };
    const { ask, seen } = scripted(first, polish);
    const res = await runDesignVariants(ask, { target: "cover", request: "", state: start(), book, layout: { texts, photos: [] }, preview: async () => image });
    expect(seen).toHaveLength(2);
    expect(seen[1].images).toBe(3);
    expect(res.variants).toHaveLength(3);
    expect(res.variants.map((v) => v.state.design.layers.some((l) => l.kind === "decor" && l.motif === "art"))).toEqual([false, true, false]);
  });
});

describe("осмотр страниц", () => {
  it("лист первых страниц осматривается тем же способом: исправление применяется к настройкам страниц", async () => {
    const pagesState = { interior: "classic" as const, style: {} };
    const draftPages = { concept: "", reply: "Готово", ops: [op("set", "colors.accent", "#7A1F2B")] };
    const { ask, seen } = scripted(draftPages, { items: [{ verdict: "fix", defects: ["текст мелковат"], ops: [op("set", "body.size", 11.5)] }] });
    const res = await runDesignAi(ask, { target: "pages", request: "акцент", state: pagesState, book, preview: async () => image });
    expect(seen[1].images).toBe(1);
    expect(seen[1].user).toContain("первых страниц книги");
    expect(res.polish).toEqual({ defects: ["текст мелковат"], fixed: true });
    expect(res.state.style).toMatchObject({ colors: { accent: "#7A1F2B" }, body: { size: 11.5 } });
  });
});

describe("картинка обложки для осмотра (настоящая вёрстка)", () => {
  const now = new Date();
  const real: Book = {
    id: "00000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000002",
    theme: "love",
    status: "draft",
    title: "Там, где ты",
    subtitle: "",
    authorName: "Алия",
    authorGender: "f",
    recordedBy: "",
    recipientName: "Олжас",
    recipientGender: "m",
    hideRecipientOnCover: false,
    namesOnCover: "",
    coverTemplate: "linen",
    coverPhotoId: null,
    coverPhotoExtra: [],
    backText: "",
    backLayout: "quote",
    backPhotoId: null,
    backPhotoExtra: [],
    photoFrames: {},
    dedication: "",
    interior: "classic",
    interiorStyle: {},
    coverDesign: null,
    format: "a5",
    photoPlacement: "chapters",
    showToc: false,
    tocMode: "chapters",
    tocLines: {},
    layoutRev: 1,
    inviteToken: null,
    occasion: null,
    occasionDate: null,
    language: "ru",
    createdAt: now,
    updatedAt: now,
  };

  it.skipIf(!hasTool("pdftoppm"))("обложка с рисунком рисуется PNG нужного размера и без пустоты", async () => {
    const { renderCoverPreview } = await import("@/modules/production");
    const { applyCoverOps, COVER_EXAMPLES } = await import("@/lib/book/design-ai");
    const ex = COVER_EXAMPLES[0];
    const s = applyCoverOps(start(), ex.ops, formats.a5).state;
    const out = await renderCoverPreview({ book: { ...real, coverTemplate: s.template, coverDesign: s.design as never }, questions: [], chapters: [], photos: [], letters: [] } as never, 600);
    expect(out?.mime).toBe("image/png");
    const png = Buffer.from(out!.data, "base64");
    const meta = await sharp(png).metadata();
    expect(meta.width).toBe(600);
    expect(meta.height!).toBeGreaterThan(700);
    // Тёмный фон образца: средняя яркость низкая — рисуется настоящая обложка, а не белый лист.
    const { channels } = await sharp(png).stats();
    expect(channels[0].mean).toBeLessThan(90);
  }, 60_000);

  it.skipIf(!hasTool("pdftoppm"))("лист первых страниц: титул, оглавление, главы и текст; без ответов подставляется образец текста", async () => {
    const { renderPagesPreview, sampleBundle } = await import("@/modules/production");
    const q = (i: number, chapter: string, answer = "") => ({ id: `00000000-0000-0000-0000-00000000010${i}`, bookId: real.id, position: i, chapter, questionKey: `k${i}`, prompt: `Вопрос ${i}`, title: `Вопрос ${i}`, hint: null, displayText: null, hideHeading: false, pageBreak: false, answer, media: [], createdAt: now, updatedAt: now });
    const bundle = { book: real, questions: [q(1, "a", "Настоящий ответ автора."), q(2, "a"), q(3, "b"), q(4, "b"), q(5, "c"), q(6, "c")], chapters: [], photos: [], letters: [] } as never;
    const s = sampleBundle(bundle) as unknown as { questions: { chapter: string; answer: string }[]; photos: unknown[] };
    // Две главы по два вопроса; ответ автора сохранён, пустые — образцом; фото нет.
    expect(s.questions.map((x) => x.chapter)).toEqual(["a", "a", "b", "b"]);
    expect(s.questions[0].answer).toBe("Настоящий ответ автора.");
    expect(s.questions.every((x) => x.answer.length > 10)).toBe(true);
    expect(s.photos).toEqual([]);
    const out = await renderPagesPreview(bundle, 300);
    expect(out?.mime).toBe("image/png");
    const meta = await sharp(Buffer.from(out!.data, "base64")).metadata();
    expect(meta.width).toBeGreaterThan(900);
    expect(meta.height).toBeGreaterThan(600);
  }, 90_000);
});
