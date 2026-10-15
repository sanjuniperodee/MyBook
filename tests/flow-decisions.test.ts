import { describe, expect, it } from "vitest";
import { applyDecision, emptyFlow, nextDecisions, type FlowBlock, type FlowDecisions, type FlowLayout, type FlowPage, type FlowPiece } from "@/lib/book/flow-decisions";

// Решения доводки — на готовых координатах, без react-pdf. Полоса набора 50…550 pt (высота 500); EPS = 1.5.
const PAGE: FlowPage = { contentTop: 50, contentBottom: 550 };

/** Кусок блока на полосе: [верх, высота] в pt, поля — по необходимости. */
const at = (page: number, top: number, height: number, margin: { top?: number; bottom?: number } = {}): FlowPiece => ({
  page,
  top,
  bottom: top + height,
  marginTop: margin.top ?? 0,
  marginBottom: margin.bottom ?? 0,
});

/** Блок по пометке (`вид:ответ…`) и его кускам; у концовки глава — из пометки. */
function block(mark: string, pieces: FlowPiece | FlowPiece[], chapter = "ch1"): FlowBlock {
  const [kind, item] = mark.split(":");
  const list = Array.isArray(pieces) ? pieces : [pieces];
  return { mark, kind: kind as FlowBlock["kind"], item, chapter: kind === "t" ? item : chapter, first: list[0], last: list[list.length - 1] };
}

const layoutOf = (pageCount: number, ...blocks: FlowBlock[]): FlowLayout => ({ pages: Array.from({ length: pageCount }, () => PAGE), blocks });
const decide = (layout: FlowLayout, flow: FlowDecisions = emptyFlow(), rowHeights = new Map<string, number>(), minLead = 0) => nextDecisions(layout, flow, rowHeights, minLead);

const ROW = "r:a:Infinity:0";

describe("решения доводки: заголовок не висит", () => {
  const hanging = () => layoutOf(3, block("b:a:0", at(0, 50, 400)), block("h:b", at(0, 480, 40)), block("b:b:0", at(1, 50, 300)));

  it("заголовок последним на полосе, текст ушёл на следующую → ответ с новой полосы", () => {
    expect(decide(hanging())).toEqual([{ type: "breakBefore", item: "b" }]);
  });

  it("лид висит так же, как заголовок", () => {
    expect(decide(layoutOf(2, block("k:b:0", at(0, 480, 40)), block("b:b:1", at(1, 50, 300))))).toEqual([{ type: "breakBefore", item: "b" }]);
  });

  it("между заголовком и текстом пустая полоса → тоже разрыв", () => {
    expect(decide(layoutOf(3, block("h:b", at(0, 480, 40)), block("b:b:0", at(2, 50, 300))))).toEqual([{ type: "breakBefore", item: "b" }]);
  });

  it("заголовок в самом верху полосы → разрывом не исправить; граница допуска 1,5 pt", () => {
    const top = (y: number) => layoutOf(3, block("b:a:0", at(0, 50, 480)), block("h:b", at(1, y, 40)), block("b:b:0", at(2, 50, 300)));
    expect(decide(top(51.5))).toEqual([]);
    expect(decide(top(51.6))).toEqual([{ type: "breakBefore", item: "b" }]);
  });

  it("ответ уже начинается с новой полосы → решение не повторяется", () => {
    const flow = emptyFlow();
    flow.breakBefore.add("b");
    expect(decide(hanging(), flow)).toEqual([]);
  });

  it("под заголовком на той же полосе есть текст → ничего", () => {
    expect(decide(layoutOf(2, block("h:b", at(0, 400, 40)), block("b:b:0", [at(0, 440, 100), at(1, 50, 100)])))).toEqual([]);
  });

  it("за заголовком следует другой ответ (у первого нет текста) → ничего", () => {
    expect(decide(layoutOf(2, block("h:a", at(0, 480, 40)), block("h:b", at(1, 50, 40)), block("b:b:0", at(1, 100, 100))))).toEqual([]);
  });

  it("за заголовком следует другая глава → ничего", () => {
    expect(decide(layoutOf(2, block("h:a", at(0, 480, 40), "ch1"), block("b:a:0", at(1, 50, 100), "ch2")))).toEqual([]);
  });

  it("заголовок — последний блок книги → ничего", () => {
    expect(decide(layoutOf(1, block("h:a", at(0, 480, 40))))).toEqual([]);
  });

  describe("обрывок текста под заголовком короче minLead", () => {
    // Заголовок внизу полосы 0, под ним 40 pt абзаца, остальное на полосе 1.
    const thin = (next: FlowBlock) => layoutOf(2, block("b:a:0", at(0, 50, 330)), block("h:b", at(0, 400, 30)), next);
    const split = block("b:b:0", [at(0, 430, 40), at(1, 50, 200)]);

    it("обрывок меньше minLead → ответ с новой полосы", () => {
      expect(decide(thin(split), emptyFlow(), new Map(), 60)).toEqual([{ type: "breakBefore", item: "b" }]);
    });

    it("обрывок ровно minLead → остаётся", () => {
      expect(decide(thin(split), emptyFlow(), new Map(), 40)).toEqual([]);
    });

    it("minLead по умолчанию 0 → обрывок не считается тонким", () => {
      expect(nextDecisions(thin(split), emptyFlow(), new Map())).toEqual([]);
    });

    it("абзац целиком на этой полосе → остаётся, как бы ни был мал", () => {
      expect(decide(thin(block("b:b:0", at(0, 430, 40))), emptyFlow(), new Map(), 60)).toEqual([]);
    });

    it("под заголовком ряд фото, а не текст → остаётся", () => {
      expect(decide(thin(block("r:b:Infinity:0", [at(0, 430, 40), at(1, 50, 200)])), emptyFlow(), new Map(), 60)).toEqual([]);
    });
  });
});

describe("решения доводки: ряд фото", () => {
  // Предыдущий абзац кончается на y=200 (поле снизу 5), ряд — наверху следующей полосы.
  const jumped = (rowHeight: number, margin = { top: 5, bottom: 10 }, prevHeight = 150) =>
    layoutOf(2, block("b:a:0", at(0, 50, prevHeight, { bottom: 5 })), block(ROW, at(1, 50 + margin.top, rowHeight, margin)), block("b:a:1", at(1, 60 + margin.top + rowHeight, 100)));
  const photo = (h: number) => new Map([[ROW, h]]);

  it("фото перескочило и оставило пустоту → уменьшается под неё", () => {
    // Пустота 550 − 200 − 5 = 345, минус поля ряда 15 и запас 3.
    expect(decide(jumped(400), emptyFlow(), photo(400))).toEqual([{ type: "rowScale", mark: ROW, scale: 327 / 400 }]);
  });

  it("подпись под фото в пустоту входит и не уменьшается", () => {
    // Ряд 430 при фото 400: подпись 30 pt не масштабируется.
    expect(decide(jumped(430), emptyFlow(), photo(400))).toEqual([{ type: "rowScale", mark: ROW, scale: 297 / 400 }]);
  });

  it("масштаб не больше 1", () => {
    expect(decide(jumped(100, { top: 0, bottom: 0 }, 20), emptyFlow(), photo(100))).toEqual([{ type: "rowScale", mark: ROW, scale: 1 }]);
  });

  it("фото пришлось бы сжать сильнее MIN_ROW_SCALE → остаётся как есть", () => {
    // Пустота 155: влезло бы 152 pt из 480 (0,32 — меньше MIN_ROW_SCALE).
    expect(decide(jumped(480, { top: 0, bottom: 0 }, 340), emptyFlow(), photo(480))).toEqual([]);
  });

  it("уменьшенное фото было бы мельче трети полосы → остаётся как есть", () => {
    // Пустота 95: влезло бы 92 pt из 200 (0,46 — масштаб допустим, но 92 < 150 = 30% полосы).
    expect(decide(jumped(200, { top: 0, bottom: 0 }, 400), emptyFlow(), photo(200))).toEqual([]);
  });

  it("высота фото неизвестна → не трогаем", () => {
    expect(decide(jumped(400))).toEqual([]);
  });

  it("фото уже уменьшено → не уменьшаем второй раз", () => {
    const flow = emptyFlow();
    flow.rowScale.set(ROW, 0.8);
    expect(decide(jumped(400), flow, photo(400))).toEqual([]);
  });

  it("ряд не наверху полосы — не перескакивал", () => {
    const l = layoutOf(2, block("b:a:0", at(0, 50, 150)), block(ROW, at(1, 120, 300)), block("b:a:1", at(1, 430, 50)));
    expect(decide(l, emptyFlow(), photo(300))).toEqual([]);
  });

  it("между текстом и рядом пустая полоса → пустоту уже не заполнить", () => {
    const l = layoutOf(3, block("b:a:0", at(0, 50, 150)), block(ROW, at(2, 55, 300, { top: 5 })), block("b:a:1", at(2, 365, 50)));
    expect(decide(l, emptyFlow(), photo(300))).toEqual([]);
  });

  it("фото и уменьшается, и остаётся одним на полосе → сначала уменьшение", () => {
    const l = layoutOf(3, block("b:a:0", at(0, 50, 150, { bottom: 5 })), block(ROW, at(1, 55, 400, { top: 5, bottom: 10 })), block("b:a:1", at(2, 50, 100)));
    expect(decide(l, emptyFlow(), photo(400))).toEqual([{ type: "rowScale", mark: ROW, scale: 327 / 400 }]);
  });

  it("предыдущий блок из другой главы пустоту не создаёт", () => {
    const l = layoutOf(2, block("b:z:0", at(0, 50, 150), "ch0"), block(ROW, at(1, 55, 400, { top: 5 })), block("b:a:1", at(1, 465, 50)));
    expect(decide(l, emptyFlow(), photo(400))).toEqual([]);
  });
});

describe("решения доводки: фото одно на полосе", () => {
  // Текст заполнил полосу 0 до конца; ряд один на полосе 1; следом текст на полосе 2.
  const alone = (rowHeight: number, extra: FlowBlock[] = []) =>
    layoutOf(3, block("b:a:0", at(0, 50, 490)), block(ROW, at(1, 50, rowHeight)), ...extra, block("b:a:1", at(2, 50, 100)));

  it("ряд один на полосе → по центру полосы набора", () => {
    expect(decide(alone(100))).toEqual([{ type: "rowOffset", mark: ROW, offset: 200 }]);
  });

  it("отступ округляется до целых pt", () => {
    expect(decide(alone(101))).toEqual([{ type: "rowOffset", mark: ROW, offset: 200 }]); // 199,5 → 200
    expect(decide(alone(458))).toEqual([{ type: "rowOffset", mark: ROW, offset: 21 }]);
  });

  it("отступ не больше 4% полосы (20 pt) → не двигаем", () => {
    expect(decide(alone(460))).toEqual([]);
  });

  it("ряд уже по центру → не повторяем", () => {
    const flow = emptyFlow();
    flow.rowOffset.set(ROW, 200);
    expect(decide(alone(100), flow)).toEqual([]);
  });

  it("на той же полосе есть следующий блок → не одно", () => {
    expect(decide(alone(100, [block("b:a:2", at(1, 170, 100))]))).toEqual([]);
  });

  it("ряд разбит на две полосы → не центрируем", () => {
    const l = layoutOf(4, block("b:a:0", at(0, 50, 490)), block(ROW, [at(1, 50, 100), at(2, 50, 100)]), block("b:a:1", at(3, 50, 100)));
    expect(decide(l)).toEqual([]);
  });

  it("ряд последний в главе и один на полосе → по центру", () => {
    expect(decide(layoutOf(2, block("b:a:0", at(0, 50, 490)), block(ROW, at(1, 50, 100))))).toEqual([{ type: "rowOffset", mark: ROW, offset: 200 }]);
  });

  it("перед рядом на этой полосе тонкая линейка-разделитель → не одно", () => {
    const l = layoutOf(3, block("b:a:0", at(0, 50, 490)), block("h:b", at(1, 50, 0.6), "ch1"), block("r:b:-1:0", at(1, 50.6, 100)), block("b:b:0", at(2, 50, 100)));
    expect(decide(l)).toEqual([]);
  });

  it("над рядом непомеченное оформление (ряд ниже верха полосы) → не центрируем", () => {
    const l = layoutOf(3, block("b:a:0", at(0, 50, 490)), block(ROW, at(1, 200, 100)), block("b:a:1", at(2, 50, 100)));
    expect(decide(l)).toEqual([]);
  });

  it("ряд первый в главе: текст прошлой главы соседом не считается", () => {
    expect(decide(layoutOf(2, block("b:z:0", at(0, 50, 490), "ch0"), block(ROW, at(1, 50, 100))))).toEqual([{ type: "rowOffset", mark: ROW, offset: 200 }]);
  });
});

describe("решения доводки: концовка главы", () => {
  it("концовка одна на новой полосе → не ставится", () => {
    expect(decide(layoutOf(2, block("b:a:0", at(0, 50, 495)), block("t:ch1", at(1, 50, 10))))).toEqual([{ type: "noTail", chapter: "ch1" }]);
  });

  it("концовка на полосе с текстом → остаётся", () => {
    expect(decide(layoutOf(1, block("b:a:0", at(0, 50, 400)), block("t:ch1", at(0, 460, 10))))).toEqual([]);
  });

  it("глава из одной концовки (текста до неё нет) → ничего", () => {
    expect(decide(layoutOf(2, block("b:z:0", at(0, 50, 495), "ch0"), block("t:ch1", at(1, 50, 10))))).toEqual([]);
  });

  it("концовка уже снята → решение не повторяется", () => {
    const flow = emptyFlow();
    flow.noTail.add("ch1");
    expect(decide(layoutOf(2, block("b:a:0", at(0, 50, 495)), block("t:ch1", at(1, 50, 10))), flow)).toEqual([]);
  });
});

describe("решения доводки: общие границы", () => {
  it("пустая раскладка — ни полос, ни блоков", () => {
    expect(decide({ pages: [], blocks: [] })).toEqual([]);
  });

  it("полосы без помеченных блоков → ничего", () => {
    expect(decide(layoutOf(3))).toEqual([]);
  });

  it("текст сам по себе решений не требует", () => {
    expect(decide(layoutOf(2, block("b:a:0", [at(0, 50, 500), at(1, 50, 200)])))).toEqual([]);
  });

  describe("по одному решению на кусок главы за проход", () => {
    const two = layoutOf(
      3,
      block("h:a", at(0, 480, 40)),
      block("b:a:0", at(1, 50, 100)),
      block("h:b", at(1, 480, 40)),
      block("b:b:0", at(2, 50, 100)),
    );

    it("два висящих заголовка подряд → пока только первый, второй — на следующем проходе", () => {
      const flow = emptyFlow();
      expect(decide(two, flow)).toEqual([{ type: "breakBefore", item: "a" }]);
      applyDecision(flow, { type: "breakBefore", item: "a" });
      expect(decide(two, flow)).toEqual([{ type: "breakBefore", item: "b" }]);
    });

    it("принудительный разрыв делит главу на куски → решение в каждом", () => {
      const l = layoutOf(
        4,
        block("h:a", at(0, 480, 40)),
        block("b:a:0", at(1, 50, 100)),
        block("h:b", at(2, 50, 40)),
        block("b:b:0", at(2, 100, 100)),
        block("h:c", at(2, 480, 40)),
        block("b:c:0", at(3, 50, 100)),
      );
      const flow = emptyFlow();
      flow.breakBefore.add("b");
      expect(decide(l, flow)).toEqual([
        { type: "breakBefore", item: "a" },
        { type: "breakBefore", item: "c" },
      ]);
    });

    it("разные главы не мешают друг другу", () => {
      const l = layoutOf(
        4,
        block("h:a", at(0, 480, 40), "ch1"),
        block("b:a:0", at(1, 50, 100), "ch1"),
        block("h:x", at(2, 480, 40), "ch2"),
        block("b:x:0", at(3, 50, 100), "ch2"),
      );
      expect(decide(l)).toEqual([
        { type: "breakBefore", item: "a" },
        { type: "breakBefore", item: "x" },
      ]);
    });

    it("концовка ждёт, пока в куске главы решится заголовок", () => {
      const l = layoutOf(4, block("h:a", at(0, 480, 40)), block("b:a:0", at(1, 50, 495)), block("t:ch1", at(2, 50, 10)));
      expect(decide(l)).toEqual([{ type: "breakBefore", item: "a" }]);
    });

    it("принятые решения не повторяются на той же раскладке", () => {
      const flow = emptyFlow();
      for (const d of decide(two, flow)) applyDecision(flow, d);
      for (const d of decide(two, flow)) applyDecision(flow, d);
      expect([...flow.breakBefore]).toEqual(["a", "b"]);
      expect(decide(two, flow)).toEqual([]);
    });
  });
});

describe("применение решений", () => {
  it("каждое решение попадает в своё поле", () => {
    const flow = emptyFlow();
    applyDecision(flow, { type: "breakBefore", item: "a" });
    applyDecision(flow, { type: "rowScale", mark: ROW, scale: 0.7 });
    applyDecision(flow, { type: "rowOffset", mark: ROW, offset: 120 });
    applyDecision(flow, { type: "noTail", chapter: "ch1" });
    expect(flow).toEqual({ breakBefore: new Set(["a"]), rowScale: new Map([[ROW, 0.7]]), rowOffset: new Map([[ROW, 120]]), noTail: new Set(["ch1"]) });
  });

  it("emptyFlow каждый раз новый", () => {
    const a = emptyFlow();
    a.breakBefore.add("x");
    expect(emptyFlow().breakBefore.size).toBe(0);
  });
});
