import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { answerBlocks, centerLine, leadMark, stripMarks } from "@/lib/book/answer-blocks";
import { AnswerBlockView } from "@/book-view/interior/answer-block";
import { pageKit } from "@/book-view/interior/kit";
import { pxUnits } from "@/book-view/interior/units";
import { estimatePages, firstChapterPage, frontMatter } from "@/lib/book/estimate";
import { getFormat } from "@/lib/book/formats";
import { applyInteriorStyle, getInteriorDesign, parseInteriorStyle } from "@/lib/book/interiors";
import { leadParts, splitLeadIn } from "@/lib/book/typesetting";
import { contentFor, renderInterior } from "@/modules/production/infrastructure/pdf/render";
import { printFingerprint } from "@/modules/production/infrastructure/pdf/printFingerprint";
import { fixtureBook } from "./fixtures/books";

// Пометки автора в тексте ответа (обращение №39): строки по центру (>>…<<) и капитель в начале абзаца (^^…^^);
// оглавление в конце книги (interior_style.elements.toc = "end").

const long = "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег, и проговорили до утра. ".repeat(3).trim();
const lines = ["Менің баға жетпес байлығым!", "Менің тірегім мен жүрегім!", "Менің өмірімнің мәңгілік шуағы!"];

describe("строки по центру: >>…<<", () => {
  it("строки подряд — один блок стихов по центру, при любом дизайне", () => {
    const blocks = answerBlocks([long, ...lines.map((l) => `>>${l}<<`), long]);
    expect(blocks.map((b) => b.kind)).toEqual(["para", "verse", "para"]);
    expect(blocks[1]).toEqual({ kind: "verse", lines, from: 1, to: 3, align: "center" });
  });

  it("прощает опечатки: пробелы, «> >», забытое и перевёрнутое закрытие", () => {
    for (const raw of [">> Строка <<", ">>Строка", "> > Строка < <", ">>>Строка<<<", ">>Строка>>", "  >>Строка<  "]) expect(centerLine(raw), raw).toBe("Строка");
    // Не пометка: стрелки не в начале, кавычки-ёлочки «<<…>>», пустая строка из одних стрелок.
    for (const raw of ["a >> b", "<<Мама>> деді", ">><<", "> цитата"]) expect(centerLine(raw), raw).toBeNull();
  });

  it("пустая строка между строками по центру — строфа; короткий ответ с пометкой — не выделенная цитата", () => {
    const blocks = answerBlocks([">>Раз<<", ">>Два<<", ">>Три<<"], { breaks: new Set([2]) });
    expect(blocks).toEqual([{ kind: "verse", lines: ["Раз", "Два", "Три"], from: 0, to: 2, align: "center", stanzas: [2] }]);
    expect(answerBlocks([">>Спасибо!<<"])).toEqual([{ kind: "verse", lines: ["Спасибо!"], from: 0, to: 0, align: "center" }]);
    // «Все ответы одним стилем» пометку автора не снимает.
    expect(answerBlocks([">>Раз<<"], { plain: true })[0]).toMatchObject({ kind: "verse", align: "center" });
  });

  it("соседние короткие строки к строкам по центру не приклеиваются", () => {
    const blocks = answerBlocks(["На природу", "На концерт", "В бар", ">>Подпись<<"]);
    expect(blocks.map((b) => [b.kind, "align" in b ? b.align : undefined])).toEqual([
      ["verse", undefined],
      ["verse", "center"],
    ]);
  });
});

describe("капитель в начале абзаца: ^^…^^", () => {
  it("слова в крышках — капителью, текст без крышек", () => {
    expect(leadMark("^^Менің анам^^ — мінезі бөлек")).toEqual({ text: "Менің анам — мінезі бөлек", lead: "Менің анам".length });
    expect(leadMark("^^ Менің анам ^^ — мінезі")).toEqual({ text: "Менің анам — мінезі", lead: "Менің анам".length });
    expect(leadMark("^Менің анам^ — мінезі")).toMatchObject({ lead: "Менің анам".length });
    expect(leadMark("^^^Менің анам^^^ — мінезі")).toMatchObject({ lead: "Менің анам".length });
    expect(leadMark("Менің анам — мінезі")).toBeNull();
  });

  it("забыли закрыть — капителью первые слова, как в начале главы", () => {
    const text = "Менің анам — мінезі бөлек, жүрегі кең жан";
    expect(leadMark(`^^${text}`)).toEqual({ text, lead: splitLeadIn(text)[0].length });
    expect(splitLeadIn(text)[0]).toBe("Менің анам");
  });

  it("абзац с пометкой — обычный абзац с капителью (не лид), соседние строки к нему не приклеиваются", () => {
    const blocks = answerBlocks(["^^Менің анам^^ — мінезі бөлек, жүрегі кең жан", long]);
    expect(blocks[0]).toEqual({ kind: "para", text: "Менің анам — мінезі бөлек, жүрегі кең жан", from: 0, to: 0, lead: 10 });
    // Без пометки та же строка — лид (короткая фраза перед длинным текстом).
    expect(answerBlocks(["Менің анам — мінезі бөлек, жүрегі кең жан", long])[0].kind).toBe("lede");
    expect(answerBlocks(["первая строка оборвалась", "^^Вторая^^ строка"]).map((b) => b.kind)).toEqual(["para", "para"]);
  });

  it("капитель с буквицей: пометка считается от начала абзаца", () => {
    expect(leadParts("енің анам — мінезі", false, 10, 1)).toEqual(["енің анам", " — мінезі"]);
    expect(leadParts("Менің анам — мінезі", false, undefined)).toEqual(["", "Менің анам — мінезі"]);
    expect(leadParts("Менің анам — мінезі", true, undefined)).toEqual(splitLeadIn("Менің анам — мінезі"));
  });

  it("снятие пометок для текста без вёрстки", () => {
    expect(stripMarks(">> Строка <<")).toBe("Строка");
    expect(stripMarks("^^Менің анам^^ — мінезі")).toBe("Менің анам — мінезі");
    expect(stripMarks("Обычная строка")).toBe("Обычная строка");
  });
});

describe("вид пометок в превью (HTML)", () => {
  const kit = pageKit(getInteriorDesign("classic"), getFormat("a5"), pxUnits(1), "kk");

  it("строки по центру — по центру и без отступа стихов", () => {
    const html = renderToStaticMarkup(<AnswerBlockView kit={kit} block={{ kind: "verse", lines, from: 0, to: 2, align: "center" }} leadIn={false} />);
    expect(html).toContain("text-align:center");
    expect(html).toContain("padding-left:0");
    const plain = renderToStaticMarkup(<AnswerBlockView kit={kit} block={{ kind: "verse", lines, from: 0, to: 2 }} leadIn={false} />);
    expect(plain).not.toContain("text-align:center");
  });

  it("капитель посреди главы — прописными, как начальные слова главы", () => {
    const html = renderToStaticMarkup(<AnswerBlockView kit={kit} block={{ kind: "para", text: "Менің анам — мінезі бөлек", from: 0, to: 0, lead: 10 }} leadIn={false} />);
    expect(html).toMatch(/text-transform:uppercase[^>]*>Менің анам</);
    const chapterStart = renderToStaticMarkup(<AnswerBlockView kit={kit} block={{ kind: "para", text: "Менің әкем — ең жақсы адам", from: 0, to: 0 }} leadIn />);
    expect(chapterStart).toMatch(/text-transform:uppercase[^>]*>Менің әкем</);
  });
});

describe("оглавление в конце книги", () => {
  const { bundle } = fixtureBook("classic", "a5", "ru");
  const base = { ...bundle, photos: [], book: { ...bundle.book, coverPhotoId: null } };
  const atEnd = { ...base, book: { ...base.book, interiorStyle: { elements: { toc: "end" } } } };

  it("настройка стиля: только «end» включает, без ключа дизайн и отпечаток прежние", () => {
    const d = getInteriorDesign("classic");
    expect(applyInteriorStyle(d, parseInteriorStyle({ elements: { toc: "end" } })).tocAtEnd).toBe(true);
    expect("tocAtEnd" in applyInteriorStyle(d, parseInteriorStyle({ elements: { toc: "start" } }))).toBe(false);
    expect(parseInteriorStyle({ elements: { toc: "middle" } })).toEqual({});
    expect("tocAtEnd" in contentFor(base).interior).toBe(false);
    expect(printFingerprint(atEnd)).not.toBe(printFingerprint(base));
  });

  it("передние полосы и оценка: оглавление не сдвигает первую главу, объём тот же", () => {
    const front = contentFor(base);
    const end = contentFor(atEnd);
    expect(frontMatter(end).toc).toBeNull();
    expect(firstChapterPage(end)).toBe(firstChapterPage(front) - frontMatter(front).toc!.estimate);
    expect(estimatePages(end)).toBe(estimatePages(front));
  });

  it("PDF: оглавление после последней главы и альбома, перед последней страницей; номера — по полосам глав", async () => {
    const front = await renderInterior(base, "preview");
    const end = await renderInterior(atEnd, "preview");
    const kinds = end.pages.filter((p) => p.kind !== "pad").map((p) => p.kind);
    const toc = kinds.indexOf("toc");
    expect(toc).toBeGreaterThan(kinds.lastIndexOf("opener"));
    expect(kinds.slice(toc).every((k) => k === "toc" || k === "end")).toBe(true);
    expect(kinds.at(-1)).toBe("end");
    // Номера в оглавлении — начальные полосы глав в этой же сборке.
    for (const [key, n] of Object.entries(end.chapterPages)) expect(end.pages[n - 1].chapterKey, key).toBe(key);
    const tocPages = front.pages.filter((p) => p.kind === "toc").length;
    for (const [key, n] of Object.entries(front.chapterPages)) expect(end.chapterPages[key], key).toBe(n - tocPages);
  }, 180_000);
});

describe("кнопки редактора: «По центру» и «Капитель»", () => {
  it("«По центру» оборачивает выделенные строки и снимает пометку повторным нажатием", async () => {
    const { toggleCenter } = await import("@/lib/book/answer-marks");
    const text = `Начало.\n${lines.join("\n")}\nКонец.`;
    const start = text.indexOf(lines[0]);
    const end = text.indexOf(lines[2]) + 5;
    const on = toggleCenter(text, start, end);
    expect(on.value).toBe(`Начало.\n${lines.map((l) => `>> ${l} <<`).join("\n")}\nКонец.`);
    expect(answerBlocks(on.value.split("\n"))[1]).toMatchObject({ kind: "verse", align: "center", lines });
    expect(toggleCenter(on.value, on.start, on.end).value).toBe(text);
    // Курсор без выделения — его строка; пустые строки не трогаются.
    expect(toggleCenter("а\n\nб", 0, 0).value).toBe(">> а <<\n\nб");
  });

  it("«Капитель» — начальные слова абзаца с курсором или выделенные слова; повторно — снимает", async () => {
    const { toggleLead } = await import("@/lib/book/answer-marks");
    const text = "Первый абзац.\nМенің анам — мінезі бөлек, жүрегі кең жан";
    const caret = text.indexOf("мінезі");
    const on = toggleLead(text, caret, caret);
    expect(on.value).toBe("Первый абзац.\n^^Менің анам^^ — мінезі бөлек, жүрегі кең жан");
    expect(toggleLead(on.value, on.start, on.end).value).toBe(text);
    const at = text.indexOf("Менің");
    expect(toggleLead(text, at, at + "Менің".length).value).toBe("Первый абзац.\n^^Менің^^ анам — мінезі бөлек, жүрегі кең жан");
  });
});
