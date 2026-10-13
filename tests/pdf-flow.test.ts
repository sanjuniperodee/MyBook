import { describe, expect, it } from "vitest";
import { emptyFlow, FLOW_MARK, refineFlow } from "@/modules/production/infrastructure/pdf/flow";

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
