import { describe, expect, it } from "vitest";
import { answerBlocks, listMarkerEm, rowsByBlock, tidyLine } from "@/lib/book/answer-blocks";
import { printableText } from "@/lib/book/layout";

const long = "Мы встретились в самый обычный вторник, когда в Алматы шёл первый снег, и проговорили до утра. ".repeat(3).trim();

describe("типографика ответа", () => {
  it("короткий ответ выделяется", () => {
    expect(answerBlocks(["Сильный, надёжный, любящий."])).toEqual([{ kind: "quote", lines: ["Сильный, надёжный, любящий."], from: 0, to: 0 }]);
  });

  it("строки, разорванные посреди фразы, склеиваются", () => {
    expect(answerBlocks(["Ты сильный, надежный,", "любящий."])[0]).toMatchObject({ kind: "quote", lines: ["Ты сильный, надежный, любящий."] });
    expect(answerBlocks(["Ты сильный, надежный,", "любящий.", long])[0]).toEqual({ kind: "para", text: "Ты сильный, надежный, любящий.", from: 0, to: 1 });
  });

  it("проза из нескольких предложений с переносами — не цитата и не стихи", () => {
    const kk = [
      "Алғашқы қадам сенен болды деп есептеймін",
      "Себебі, менің ішкі сезімімді, ойымды ешкім білмейтін еді.",
      "Ал сен өзіңді көрсете білдің. Мені жұбатуың арқылы, хабарламалар, мені көруге деген іздеген сылтауларың.",
    ];
    expect(answerBlocks(kk).map((b) => b.kind)).toEqual(["para", "para", "para"]);
    const short = ["Мы встретились.", "Было холодно.", "Я улыбнулась.", "Ты тоже."];
    expect(answerBlocks([...short, long]).map((b) => b.kind)).not.toContain("verse");
  });

  it("стихи — короткие строки без точек в конце", () => {
    const blocks = answerBlocks([long, "Ты и я — одна дорога,", "Судьбы связаны навсегда,", "Даже если мир в тревогах,", "Мы найдём свой рай всегда."]);
    expect(blocks.map((b) => b.kind)).toEqual(["para", "verse"]);
    expect(blocks[1]).toMatchObject({ from: 1, to: 4 });
  });

  it("списки: маркеры и нумерация, а тире прямой речи — не список", () => {
    expect(answerBlocks(["• Первое", "• Второе", long])[0]).toEqual({ kind: "list", ordered: false, items: [{ marker: "•", text: "Первое" }, { marker: "•", text: "Второе" }], from: 0, to: 1 });
    expect(answerBlocks(["1. Горы", "2) Море", long])[0]).toMatchObject({ kind: "list", ordered: true, items: [{ marker: "1." }, { marker: "2." }] });
    const dialogue = answerBlocks(["- Привет! — сказал он.", long]);
    expect(dialogue[0]).toMatchObject({ kind: "para", text: "— Привет! — сказал он." });
  });

  it("типографская чистка: пробелы у знаков препинания", () => {
    expect(tidyLine("поговорить . Мы шли , итд .Тут ( тихо ) в 00.00, т.е. так")).toBe("поговорить. Мы шли, итд. Тут (тихо) в 00.00, т.е. так");
    expect(tidyLine("ушёл в армию.Я поступила, А.С. Пушкин")).toBe("ушёл в армию. Я поступила, А.С. Пушкин");
  });

  it("лид — одна короткая фраза перед длинным текстом", () => {
    expect(answerBlocks(["Между сердцем и рассудком.", long])[0]).toMatchObject({ kind: "lede", text: "Между сердцем и рассудком." });
    expect(answerBlocks(["Ең алғаш рет таныстық. Ең қызықты сәттер еді.", long])[0].kind).toBe("para");
  });

  it("фото после абзаца встают после его блока; после последнего — в конец", () => {
    const blocks = answerBlocks([long, "• а", "• б", long]);
    const rows = rowsByBlock(blocks, new Map([[-1, ["A"]], [2, ["B"]], [3, ["C"]], [Number.POSITIVE_INFINITY, ["D"]]]));
    expect(rows.get(-1)).toEqual(["A"]);
    expect(rows.get(1)).toEqual(["B"]);
    expect(rows.get(Number.POSITIVE_INFINITY)).toEqual(["C", "D"]);
  });
});

describe("текст для печати", () => {
  it("без эмодзи и лишних пробелов, © остаётся", () => {
    expect(printableText("Маған қымбат сөздер😊 и ❤️ навсегда 🤭.")).toBe("Маған қымбат сөздер и навсегда.");
    expect(printableText("© 2024 Мы")).toBe("© 2024 Мы");
    expect(printableText("Обычный текст")).toBe("Обычный текст");
  });
});

describe("длинный нумерованный список («Сүюге 200 себеп»)", () => {
  it("пункты 100 и дальше — тот же список, колонка номера шире под «100.»", () => {
    const blocks = answerBlocks(["98. Бірінші.", "99. Екінші.", "100. Үшінші.", "101. Төртінші."]);
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    if (list.kind !== "list") throw new Error("не список");
    expect(list.items.map((it) => it.marker)).toEqual(["98.", "99.", "100.", "101."]);
    expect(listMarkerEm(list)).toBeGreaterThan(listMarkerEm({ ...list, items: list.items.slice(0, 2) }));
  });

  it("до 99 пунктов ширина колонки прежняя", () => {
    const [list] = answerBlocks(["1. Бір.", "2. Екі."]);
    if (list.kind !== "list") throw new Error("не список");
    expect(listMarkerEm(list)).toBe(1.6);
  });
});
