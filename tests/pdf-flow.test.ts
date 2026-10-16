import { describe, expect, it } from "vitest";
import { emptyFlow } from "@/lib/book/flow-decisions";
import { FLOW_MARK, readLayout, refineFlow } from "@/modules/production/infrastructure/pdf/flow";

// Полоса: поля 50 сверху и снизу, высота 600 → полоса набора 50…550.
const page = (...children: [string, number, number, { mt?: number; mb?: number }?][]) => ({
  box: { top: 0, height: 600, paddingTop: 50, paddingBottom: 50 },
  children: children.map(([mark, top, height, m]) => ({ box: { top, height, marginTop: m?.mt ?? 0, marginBottom: m?.mb ?? 0 }, props: { [FLOW_MARK]: mark } })),
});
const layout = (...pages: ReturnType<typeof page>[]) => ({ children: pages });
const chapters = new Map([
  ["a", "ch1"],
  ["b", "ch1"],
]);

describe("доводка вёрстки", () => {
  it("заголовок внизу полосы без текста → ответ с новой полосы", () => {
    const flow = emptyFlow();
    const changed = refineFlow(layout(page(["b:a:0", 50, 400], ["h:b", 500, 40]), page(["b:b:0", 50, 300])), flow, new Map(), chapters);
    expect(changed).toBe(true);
    expect([...flow.breakBefore]).toEqual(["b"]);
  });

  it("разделитель-линейка (тоньше пункта) внизу полосы без текста → ответ с новой полосы", () => {
    const flow = emptyFlow();
    refineFlow(layout(page(["b:a:0", 50, 480], ["h:b", 540, 0.6]), page(["b:b:0", 50, 300])), flow, new Map(), chapters);
    expect([...flow.breakBefore]).toEqual(["b"]);
  });

  it("фото перескочило и оставило пустоту → уменьшается под неё", () => {
    const flow = emptyFlow();
    const heights = new Map([["r:a:Infinity:0", 400]]);
    refineFlow(layout(page(["b:a:0", 50, 150, { mb: 5 }]), page(["r:a:Infinity:0", 55, 400, { mt: 5, mb: 10 }], ["h:b", 480, 30])), flow, heights, chapters);
    // Пустота 550 − 200 − 5 = 345, минус поля ряда 15 и запас 3 → 327 / 400.
    expect(flow.rowScale.get("r:a:Infinity:0")).toBeCloseTo(327 / 400, 2);
  });

  it("фото слишком велико для пустоты → остаётся, а одно на полосе — по центру", () => {
    const flow = emptyFlow();
    const heights = new Map([["r:a:Infinity:0", 400]]);
    const l = layout(page(["b:a:0", 50, 420, { mb: 5 }]), page(["r:a:Infinity:0", 55, 400, { mt: 5 }]), page(["h:b", 50, 30], ["b:b:0", 80, 200]));
    refineFlow(l, flow, heights, chapters);
    expect(flow.rowScale.size).toBe(0);
    expect(flow.rowOffset.get("r:a:Infinity:0")).toBe(50);
  });

  it("концовка главы одна на полосе → не ставится", () => {
    const flow = emptyFlow();
    refineFlow(layout(page(["b:a:0", 50, 495]), page(["t:ch1", 50, 10])), flow, new Map(), chapters);
    expect([...flow.noTail]).toEqual(["ch1"]);
  });
});

// Чтение раскладки react-pdf: узлы с пометкой → блоки с координатами от верха полосы.
describe("чтение раскладки", () => {
  interface TestNode {
    box?: Record<string, number>;
    props?: Record<string, unknown>;
    children?: TestNode[];
  }
  const node = (top: number, height: number, mark?: unknown, children: TestNode[] = [], margin: Record<string, number> = {}): TestNode => ({
    box: { top, height, ...margin },
    props: mark === undefined ? {} : { [FLOW_MARK]: mark },
    children,
  });
  const sheet = (...children: TestNode[]): TestNode => ({ box: { top: 0, height: 600, paddingTop: 50, paddingBottom: 40 }, children });
  const read = (pages: TestNode[], chapterOf = chapters) => readLayout({ children: pages }, chapterOf);

  it("полоса набора — между верхним и нижним полем", () => {
    expect(read([sheet()]).pages).toEqual([{ contentTop: 50, contentBottom: 560 }]);
    expect(read([{ children: [] }]).pages).toEqual([{ contentTop: 0, contentBottom: 0 }]);
  });

  it("вложенные узлы: верх складывается от узла к узлу, поля берутся из бокса", () => {
    const l = read([sheet(node(100, 400, undefined, [node(20, 30, "b:a:0", [], { marginTop: 4, marginBottom: 6 })]))]);
    expect(l.blocks).toEqual([{ mark: "b:a:0", kind: "b", item: "a", chapter: "ch1", first: { page: 0, top: 120, bottom: 150, marginTop: 4, marginBottom: 6 }, last: { page: 0, top: 120, bottom: 150, marginTop: 4, marginBottom: 6 } }]);
  });

  it("блок, разбитый на несколько полос, — один: первый и последний куски", () => {
    const l = read([sheet(node(50, 100, "b:a:0"), node(160, 300, "b:a:1")), sheet(node(50, 80, "b:a:1")), sheet(node(50, 20, "b:a:1"))]);
    expect(l.blocks.map((b) => b.mark)).toEqual(["b:a:0", "b:a:1"]);
    expect([l.blocks[1].first.page, l.blocks[1].last.page]).toEqual([0, 2]);
    expect(l.blocks[1].last.bottom).toBe(70);
  });

  it("блоки идут в порядке первого появления", () => {
    const l = read([sheet(node(50, 20, "h:b"), node(80, 20, "b:b:0")), sheet(node(50, 20, "h:b"))]);
    expect(l.blocks.map((b) => b.mark)).toEqual(["h:b", "b:b:0"]);
  });

  it("абзац нулевой высоты не считается куском; тонкая линейка-разделитель — считается", () => {
    const l = read([sheet(node(50, 0.5, "b:a:0"), node(60, 0.6, "h:b"), node(70, 0.6, "r:a:0:0"), node(80, 0, "h:a"))]);
    expect(l.blocks.map((b) => b.mark)).toEqual(["h:b"]);
  });

  it("чужие пометки и не-строки пропускаются", () => {
    const l = read([sheet(node(50, 20, "x:a"), node(70, 20, "nocolon"), node(90, 20, 5), node(110, 20, ""), node(130, 20, "b:a:0"))]);
    expect(l.blocks.map((b) => b.mark)).toEqual(["b:a:0"]);
  });

  it("глава: у ответа — из chapterOf (нет в списке — пусто), у концовки — из пометки", () => {
    const l = read([sheet(node(50, 20, "b:a:0"), node(80, 20, "b:zzz:0"), node(110, 20, "t:ch9"))]);
    expect(l.blocks.map((b) => [b.mark, b.kind, b.item, b.chapter])).toEqual([
      ["b:a:0", "b", "a", "ch1"],
      ["b:zzz:0", "b", "zzz", ""],
      ["t:ch9", "t", "ch9", "ch9"],
    ]);
  });

  it("пустая раскладка", () => {
    expect(readLayout({}, chapters)).toEqual({ pages: [], blocks: [] });
  });
});
