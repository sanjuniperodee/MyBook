import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { renderCover } from "@/modules/production/infrastructure/pdf/render";
import { CoverText } from "@/components/cover/CoverFace";
import { CoverSpineText } from "@/components/cover/CoverSpine";
import { coverNames } from "@/lib/book/cover-names";
import { backContent, designBack } from "@/lib/book/cover-back";
import { spineParts } from "@/lib/book/book-model";
import { getCoverTemplate } from "@/lib/book/covers";
import { coverMeta } from "@/lib/book/covers/meta";
import { designFromTemplate, printedLayerText, type CoverDesign } from "@/lib/book/cover-design";
import { formats } from "@/lib/book/formats";
import type { Book } from "@/shared/infrastructure/db/schema";
import { hasTool, textRows } from "./pdf-inspect";

// 02.11.2026: «Для мамы ❤️» в «Именах на обложке» напечаталось как «Для мамы d» на обороте и корешке. В шрифтах обложки
// эмодзи нет, react-pdf брал невстроенный Helvetica, и ❤ уходил в «d». Эмодзи на обложке, как и в блоке, не печатаются:
// их нет ни в PDF, ни в превью, а поле ввода предупреждает.

const now = new Date();
const book: Book = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  theme: "mom",
  status: "draft",
  title: "Мамина книга 🌸",
  subtitle: "Мама ❤️ навсегда",
  authorName: "Алия",
  authorGender: "f",
  recordedBy: "",
  recipientName: "Мама",
  recipientGender: "f",
  hideRecipientOnCover: false,
  namesOnCover: "Для мамы ❤️",
  coverTemplate: "tenderness",
  coverPhotoId: null,
  coverPhotoExtra: [],
  backText: "Люблю тебя ❤️ 👩‍👧 очень!",
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
  showToc: true,
  tocMode: "chapters",
  tocLines: {},
  layoutRev: 2,
  inviteToken: null,
  occasion: null,
  occasionDate: null,
  language: "ru",
  createdAt: now,
  updatedAt: now,
};

/** Эмодзи и всё, что из них получалось в печати. */
const EMOJI = /\p{Extended_Pictographic}|\uFE0F|\u200D/u;
/** Стандартные шрифты PDF: react-pdf берёт их, когда знака нет ни в одном шрифте, — не встроены, кириллицы нет. */
const STANDARD_FONT = /\/BaseFont\s*\/(Helvetica|Times|Courier|Symbol|ZapfDingbats)/;

const pdfText = (pdf: Buffer) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cover-emoji-")), "cover.pdf");
  writeFileSync(file, pdf);
  return textRows(file).flat().map((r) => r.text);
};

describe("эмодзи на обложке", () => {
  it("имена, корешок и оборот — без эмодзи; одни эмодзи в своей строке имён — имена по умолчанию", () => {
    expect(coverNames(book)).toBe("Для мамы");
    expect(coverNames({ ...book, namesOnCover: "❤️💐" })).toBe("Алия & Мама");
    expect(spineParts("Мамина книга 🌸", "Для мамы ❤️")).toEqual(["Мамина книга", "Для мамы"]);
    const back = designBack(getCoverTemplate("tenderness"), 148, 210, backContent(book, [], now));
    const texts = back.blocks.flatMap((b) => (b.kind === "text" ? [b.text] : []));
    expect(texts.join(" ")).toContain("Люблю тебя очень!");
    expect(texts.some((t) => EMOJI.test(t))).toBe(false);
  });

  it("превью лица и корешка показывает то же, что напечатается", () => {
    const template = getCoverTemplate("tenderness");
    const front = renderToStaticMarkup(createElement(CoverText, { template: coverMeta(template), title: book.title, subtitle: book.subtitle, names: book.namesOnCover }));
    const spine = renderToStaticMarkup(createElement(CoverSpineText, { template, title: book.title, names: book.namesOnCover, widthMm: 12, heightMm: 210 }));
    for (const markup of [front, spine]) {
      expect(EMOJI.test(markup)).toBe(false);
      expect(markup).toContain("Для мамы");
    }
    expect(front).toContain("Мама навсегда");
  });

  it.skipIf(!hasTool("pdftotext"))("PDF шаблонной обложки: ни «d» вместо ❤, ни стандартных шрифтов", async () => {
    const { pdf } = await renderCover({ book, questions: [], chapters: [], photos: [] }, 64, "preview");
    expect(pdf.toString("latin1")).not.toMatch(STANDARD_FONT);
    const rows = pdfText(pdf);
    expect(rows).toContain("Для мамы");
    expect(rows).toContain("Мама навсегда");
    expect(rows.join("\n")).toContain("Люблю тебя очень!");
    expect(rows.some((r) => /\bd\b/.test(r) || EMOJI.test(r))).toBe(false);
  });

  it.skipIf(!hasTool("pdftotext"))("PDF обложки из конструктора: свой текстовый слой с эмодзи печатается без них", async () => {
    const base = designFromTemplate(coverMeta(getCoverTemplate("tenderness")), { title: book.title, subtitle: book.subtitle, names: coverNames(book) }, formats.a5);
    const own = base.layers.find((l) => l.kind === "text")!;
    const design: CoverDesign = { ...base, layers: [...base.layers, { ...own, id: "own", bind: undefined, text: "С любовью 💕 навсегда", x: 0.1, y: 0.02, w: 0.8, h: 0.06, rotate: 0 }] };
    expect(printedLayerText(design.layers.at(-1) as Extract<CoverDesign["layers"][number], { kind: "text" }>, { title: "", subtitle: "", names: "" })).toBe("С любовью навсегда");
    const { pdf } = await renderCover({ book: { ...book, coverDesign: design as unknown as Book["coverDesign"] }, questions: [], chapters: [], photos: [] }, 64, "preview");
    expect(pdf.toString("latin1")).not.toMatch(STANDARD_FONT);
    const rows = pdfText(pdf).join("\n");
    expect(rows).toContain("С любовью навсегда");
    expect(rows).toContain("Мама навсегда");
    expect(/\bd\b/.test(rows) || EMOJI.test(rows)).toBe(false);
  });
});
