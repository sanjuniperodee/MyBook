import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Locale } from "@/i18n/config";
import { backArtSvg, backContent, backLayouts, backPhotoIds, designBack } from "@/lib/book/cover-back";
import type { PhotoSpec } from "@/lib/book/cover-kit";
import { setCustomCovers, type CustomCoverData } from "@/lib/book/cover-registry";
import { allCoverTemplates, coverPhotoIds, getCoverTemplate, renderCoverSvg, type CoverTemplate } from "@/lib/book/covers";
import { coverFrontGeometry, coverSpreadGeometry, formats, getFormat, print, type FormatId } from "@/lib/book/formats";
import { interiorDesigns } from "@/lib/book/interiors";
import { frameKey, parseFrames } from "@/lib/book/photo-frame";
import type { BookBundle } from "@/modules/production/infrastructure/pdf/render";
import { fixtureBook } from "../fixtures/books";

/**
 * Характеристика рисунков обложек — без PDF и растра: sha256 SVG каждого шаблона (covers.ts, семьи covers-*.ts
 * и шаблон из CRM через cover-registry) в каждом формате, без фото и с фото набора, на книгах ru и kk; плюс шесть
 * вариантов оборота (cover-back). SVG строится так же, как его строят сайт (renderCoverSvg: /api/covers,
 * CoverPreview) и PDF (coverBackground: развёртка 300 dpi без фактуры, оборот — backArtSvg). Вместо data-URL
 * снимков — ключи хранилища: хеш зависит от рисунка, а не от байтов фото. Случайности в SVG нет (узоры — rng
 * с зерном, фактура PDF — растром отдельно), год оборота — из NOW. Страхует D2: при разбиении шаблонов по файлам
 * ни один хеш не должен измениться.
 */

const sha = (svg: string) => `#${createHash("sha256").update(svg).digest("hex").slice(0, 12)}`;
const formatIds = Object.keys(formats) as FormatId[];
const languages: Locale[] = ["ru", "kk"];
/** Толщина книги для развёртки — как у книг набора в A5. */
const PAGES = 28;
const PX_PER_MM = print.dpi / 25.4;
/** «Сейчас» для оборота: год печатается, если у книги нет даты повода. */
const NOW = new Date("2026-06-15T12:00:00Z");
/** Снимок шаблона на фото и снимки-примеры — адресами вместо data-URL. */
const imageHref = (t: CoverTemplate) => (t.photo ? `cover-photos/${t.photo.photo.key}.jpg` : undefined);
const sampleHref = (key: string) => `samples/${key}.jpg`;

/** Шаблон из CRM — как его отдаёт реестр: снимок со всеми частями раскладки (затемнение, плашка, рамка). */
const crm: CustomCoverData = {
  data: {
    id: "crmsample",
    name: { ru: "Из CRM", kk: "CRM-нан" },
    mood: "tender",
    layout: {
      photo: { key: "designs/crm-sample.jpg", width: 3000, height: 2000 },
      focus: { x: 0.4, y: 0.5 },
      zoom: 1.1,
      base: "#20302A",
      back: "color",
      shade: { kind: "bottom", color: "#000000", opacity: 0.5, size: 0.4 },
      plate: { shape: "arch", fill: "#FFFFFF", opacity: 0.85, stroke: "#C9A96E", pad: 0.04, shadow: true },
      frame: { color: "#FFFFFF", inset: 6, double: true },
    },
    textArea: { x: 0.12, y: 0.6, w: 0.76, h: 0.3 },
    justify: "center",
    title: { font: "cormorant", size: 0.09, color: "#1E2A24" },
    subtitle: { font: "cormorant", size: 0.045, color: "#1E2A24", italic: true },
    names: { font: "montserrat", size: 0.024, color: "#1E2A24", upper: true },
    ornament: { kind: "heart", color: "#C9A96E" },
    spine: { color: "#FFFFFF", font: "cormorant" },
    back: { color: "#FFFFFF", font: "cormorant", mirror: true },
  },
  status: "active",
  rev: 3,
  position: 0,
};

beforeAll(() => setCustomCovers([crm]));
afterAll(() => setCustomCovers([]));

/** Книги-доноры фото обложки: classic набора в каждом формате и на каждом языке. */
const donors = new Map(formatIds.flatMap((f) => languages.map((l) => [`${f}-${l}`, fixtureBook("classic", f, l).bundle] as const)));

/** Фото по местам шаблона — как в coverBackground: основное и остальные фото обложки, размеры и кадр. */
function coverPhotos(t: CoverTemplate, { book, photos }: BookBundle): (PhotoSpec | undefined)[] {
  const frames = parseFrames(book.photoFrames);
  return coverPhotoIds({ ...book, coverTemplate: t.id }).map((id, i) => {
    const p = photos.find((x) => x.id === id);
    return p && { href: p.storageKey, width: p.width, height: p.height, frame: frames[frameKey("cover", i)] };
  });
}

/** Лицо — как на сайте (с фактурой), развёртка — как в PDF; без фото: снимки-примеры на сайте и пейзажи в PDF. */
function templateLine(t: CoverTemplate, f: FormatId, language: Locale) {
  const front = coverFrontGeometry(formats[f]);
  const spread = coverSpreadGeometry(formats[f], PAGES);
  const uid = `${t.id}${f}`;
  const photos = coverPhotos(t, donors.get(`${f}-${language}`)!);
  const pdf = (list: (PhotoSpec | undefined)[]) => sha(renderCoverSvg(t, spread, { uid: "c", photos: list, imageHref: imageHref(t) }, { pxPerMm: PX_PER_MM, noTexture: true }));
  const empty = `лицо ${sha(renderCoverSvg(t, front, { uid, imageHref: imageHref(t), sampleHref }))} развёртка ${pdf([])}`;
  const filled = `лицо ${sha(renderCoverSvg(t, front, { uid, photos, sampleHref }))} развёртка ${pdf(photos)}`;
  return `без фото: ${empty} · с фото: ${filled}`;
}

function templateTable(language: Locale) {
  const templates = [...allCoverTemplates, getCoverTemplate(crm.data.id)];
  return Object.fromEntries(templates.map((t) => [t.custom ? `${t.id} (CRM)` : t.id, Object.fromEntries(formatIds.map((f) => [f, templateLine(t, f, language)]))]));
}

/** Развёртка с оборотом — как в PDF (backSide + coverBackground): раскладка оборота и итоговый SVG. */
function backLine({ book, photos }: BookBundle) {
  const template = getCoverTemplate(book.coverTemplate);
  const g = coverSpreadGeometry(getFormat(book.format), PAGES);
  const list = backPhotoIds(book).flatMap((id) => photos.filter((x) => x.id === id));
  const design = designBack(template, g.back!.w, g.back!.h, backContent(book, list.map((p) => ({ width: p.width, height: p.height })), NOW));
  const frames = parseFrames(book.photoFrames);
  const bleed = new Set(design.blocks.flatMap((b) => (b.kind === "photo" && b.frame === "bleed" ? [b.slot] : [])));
  const hrefs = list.map((p, i) => (bleed.has(i) ? { href: p.storageKey, width: p.width, height: p.height, frame: frames[frameKey("back", i)] } : undefined));
  const art = renderCoverSvg(template, g, { uid: "c", photos: coverPhotos(template, { book, photos, questions: [] }), imageHref: imageHref(template) }, { pxPerMm: PX_PER_MM, noTexture: true, plainBack: design.plainArt });
  const svg = art.replace(/<\/svg>$/, `${backArtSvg(design, g.back!, hrefs, "cb")}</svg>`);
  return `${design.layout} · раскладка ${sha(JSON.stringify(design))} · развёртка ${sha(svg)}`;
}

describe("рисунки обложек", () => {
  it("SVG каждого шаблона: лицо и развёртка, без фото и с фото набора", () => {
    expect(templateTable("ru")).toMatchSnapshot();
  });

  it("на книгах kk — те же SVG: текст обложки накладывается поверх рисунка", () => {
    expect(templateTable("kk")).toEqual(templateTable("ru"));
  });

  it("шесть вариантов оборота на шаблонах набора: раскладка зависит от текста оборота (язык), рисунок развёртки — нет", () => {
    const pairs = interiorDesigns.map((d) => ({ design: d.id, book: fixtureBook(d.id, "a5", "ru").bundle.book }));
    const table = Object.fromEntries(
      backLayouts.map((layout) => {
        const { design, book } = pairs.find((p) => p.book.backLayout === layout)!;
        const lines = formatIds.flatMap((f) => languages.map((l) => [`${f} ${l}`, backLine(fixtureBook(design, f, l).bundle)]));
        return [`${layout} · ${book.coverTemplate}`, Object.fromEntries(lines)];
      }),
    );
    expect(table).toMatchSnapshot();
  });
});
