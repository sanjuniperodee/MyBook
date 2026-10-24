import { describe, expect, it } from "vitest";
import { ART_EXAMPLES, ART_REFERENCE, compileArt, resolveDrawing, sanitizeDrawing } from "@/lib/book/art";
import { compose, mirrorM, parsePath, rotateM, scaleM, transformSegs, translateM, writePath } from "@/lib/book/art/path";
import { COVER_EXAMPLES } from "@/lib/book/design-ai/examples";
import { DESIGN_AI_FREE_LIMIT, parseFreeLimit } from "@/lib/book/design-ai";
import { applyCoverOps, applyPagesOps, coverSystemPrompt, critiqueCover, designTier, pagesSystemPrompt, type DesignOp } from "@/lib/book/design-ai";
import { designFromTemplate, layerDrawing, parseCoverDesign, type CoverDesign } from "@/lib/book/cover-design";
import { coverMeta } from "@/lib/book/covers/meta";
import { getCoverTemplate } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";
import { applyInteriorStyle, getInteriorDesign, parseInteriorStyle } from "@/lib/book/interiors";
import { openerEmblemShapes, titleEmblemShapes } from "@/lib/book/interior-art";

const op = (o: DesignOp["op"], path: string, value: unknown = ""): DesignOp => ({ op: o, path, value: value === "" ? "" : JSON.stringify(value) });
const cover = () => ({ template: "linen", design: designFromTemplate(coverMeta(getCoverTemplate("linen")), { title: "Там, где ты", subtitle: "", names: "Элия & Олжас" }, formats.a5) });

describe("рисунки: пути", () => {
  it("разбирает сжатые флаги дуги, относительные команды и S/T", () => {
    const segs = parsePath("M10 10 a5 5 0 01.5.5 h4 v3 s2 2 4 4 t1 1 z");
    expect(segs).not.toBeNull();
    expect(segs![1]).toEqual(["A", 5, 5, 0, 0, 1, 10.5, 10.5]);
    expect(writePath(segs!)).toMatch(/^M10,10 A5,5 0 0 1 10\.5,10\.5 L/);
  });

  it("мусор не разбирается", () => {
    expect(parsePath("M10 10 X5")).toBeNull();
    expect(parsePath("10 10")).toBeNull();
    expect(parsePath("M10")).toBeNull();
  });

  it("поворот на 90° и зеркало переносят точки и флаги дуги", () => {
    const line = parsePath("M10,0 L20,0")!;
    const r = transformSegs(line, rotateM(90, 0, 0));
    expect(r[0][1]).toBeCloseTo(0);
    expect(r[0][2]).toBeCloseTo(10);
    expect(r[1][2]).toBeCloseTo(20);
    const arc = parsePath("M0,0 A5,5 0 0 1 10,0")!;
    const m = transformSegs(arc, mirrorM("x", 10));
    expect(m[0]).toEqual(["M", 20, 0]);
    expect(m[1]).toEqual(["A", 5, 5, 180, 0, 0, 10, 0]);
    const s = transformSegs(arc, compose(translateM(1, 1), scaleM(2)));
    expect(s[1]).toEqual(["A", 10, 10, 0, 0, 1, 21, 1]);
  });
});

describe("рисунки: сборка", () => {
  it("все образцы справочника собираются без замечаний и проходят проверку данных", () => {
    for (const e of ART_EXAMPLES) {
      const r = compileArt(e.spec);
      expect(r.errors, e.about).toEqual([]);
      expect(r.drawing, e.about).not.toBeNull();
      expect(r.drawing!.shapes.length).toBeLessThanOrEqual(300);
      // Данные устойчивы к повторной проверке: то, что сохранили, читается как есть.
      expect(sanitizeDrawing(JSON.parse(JSON.stringify(r.drawing)))).toEqual(r.drawing);
    }
  });

  it("сцены, узоры и рамки детерминированы: тот же seed — тот же рисунок", () => {
    const spec = { w: 300, h: 200, items: [{ t: "mountains", y: 70, h: 130, layers: 3, seed: 5, snow: "#FFFFFF" }, { t: "stars", count: 20, seed: 2 }, { t: "border", kind: "koshkar" }] };
    expect(compileArt(spec).drawing).toEqual(compileArt(spec).drawing);
    expect(compileArt({ ...spec, items: [{ ...spec.items[0], seed: 6 }] }).drawing).not.toEqual(compileArt({ ...spec, items: [spec.items[0]] }).drawing);
  });

  it("каждая сцена и каждый узор собираются с минимумом полей", () => {
    const items = [
      { t: "mountains" },
      { t: "hills" },
      { t: "sun", cx: 50, cy: 50, r: 20, rays: 10 },
      { t: "moon", cx: 50, cy: 50, r: 20 },
      { t: "cloud", cx: 100, cy: 50, w: 80 },
      { t: "stars" },
      { t: "tree", x: 100, y: 190, h: 80 },
      { t: "tulip", x: 100, y: 190, h: 80 },
      { t: "yurt", cx: 100, y: 190, w: 80 },
      { t: "bird", cx: 100, cy: 30, w: 30 },
      ...["meander", "koshkar", "scales", "chevron", "dots", "diamonds", "zigzag", "waves"].map((kind) => ({ t: "pattern", kind, x: 10, y: 10, w: 180, h: 30 })),
      ...["meander", "koshkar", "dots", "diamonds", "scales", "chevron", "zigzag", "waves", "line", "double"].map((kind) => ({ t: "border", kind })),
    ];
    for (const item of items) {
      const r = compileArt({ w: 200, h: 200, items: [item] });
      expect(r.errors, JSON.stringify(item)).toEqual([]);
      expect(r.drawing?.shapes.length, JSON.stringify(item)).toBeGreaterThan(0);
    }
  });

  it("повторы: кольцо поворачивает копии, ряд сдвигает, зеркало удваивает", () => {
    const ring = compileArt({ w: 200, h: 200, items: [{ t: "ring", cx: 100, cy: 100, count: 4, of: { t: "circle", cx: 100, cy: 30, r: 5 } }] }).drawing!;
    expect(ring.shapes).toHaveLength(4);
    const centers = ring.shapes.map((s) => (s.kind === "circle" ? [Math.round(s.cx), Math.round(s.cy)] : null));
    expect(centers).toEqual([[100, 30], [170, 100], [100, 170], [30, 100]]);
    const row = compileArt({ w: 200, h: 200, items: [{ t: "row", count: 3, dx: 20, of: { t: "circle", cx: 20, cy: 20, r: 4 } }] }).drawing!;
    expect(row.shapes.map((s) => (s.kind === "circle" ? s.cx : 0))).toEqual([20, 40, 60]);
    const mirror = compileArt({ w: 200, h: 200, items: [{ t: "mirror", axis: "x", at: 100, items: [{ t: "circle", cx: 60, cy: 50, r: 5 }] }] }).drawing!;
    expect(mirror.shapes.map((s) => (s.kind === "circle" ? s.cx : 0))).toEqual([60, 140]);
  });

  it("ошибки — по-русски и по элементам; собравшееся остаётся", () => {
    const r = compileArt({ w: 200, h: 200, items: [{ t: "dragon" }, { t: "circle", cx: 50, cy: 50 }, { t: "circle", cx: 50, cy: 50, r: 10, fill: "red" }, { t: "path", d: "M0 0 Q" }, { t: "star", cx: 100, cy: 100, r: 30 }] });
    expect(r.errors).toHaveLength(4);
    expect(r.errors[0]).toMatch(/элемент 1: неизвестный элемент «dragon»/);
    expect(r.errors[1]).toMatch(/элемент 2: circle: нужно поле r/);
    expect(r.errors[2]).toMatch(/fill — "#RRGGBB"/);
    expect(r.errors[3]).toMatch(/путь d не разобрался/);
    expect(r.drawing?.shapes).toHaveLength(1);
  });

  it("слишком много фигур и выход за холст — замечания", () => {
    const many = compileArt({ w: 200, h: 200, items: [{ t: "grid", cols: 20, rows: 13, dx: 9, dy: 9, of: { t: "circle", cx: 5, cy: 5, r: 2 } }] });
    expect(many.errors.join(" ")).toMatch(/больше 240 клеток|слишком много фигур/);
    const out = compileArt({ w: 200, h: 200, items: [{ t: "circle", cx: 300, cy: 100, r: 20 }] });
    expect(out.errors.join(" ")).toMatch(/выходит за холст/);
    expect(compileArt({ items: [] }).drawing).toBeNull();
    expect(compileArt("текст").drawing).toBeNull();
  });

  it("перекраска ролей: main и accent подставляются, hex остаётся", () => {
    const d = compileArt({ w: 100, h: 100, items: [{ t: "circle", cx: 20, cy: 20, r: 5 }, { t: "star", cx: 60, cy: 60, r: 20, fill: "accent" }, { t: "line", x1: 0, y1: 0, x2: 90, y2: 90, stroke: "#112233" }] }).drawing!;
    const r = resolveDrawing(d, "#AA0000", "#00BB00");
    expect(r.shapes[0]).toMatchObject({ kind: "circle", fill: "#AA0000" });
    expect(r.shapes[1]).toMatchObject({ fill: "#00BB00" });
    expect(r.shapes[2]).toMatchObject({ stroke: "#112233" });
  });
});

describe("рисунки: безопасность данных", () => {
  it("посторонние символы в пути, чужие виды и лимиты отбрасываются", () => {
    const d = sanitizeDrawing({
      w: 100,
      h: 100,
      shapes: [
        { kind: "path", d: "M0,0 L10,10 <script>", fill: "main" },
        { kind: "path", d: "M0,0 L10,10", fill: "url(#x)" },
        { kind: "path", d: "M0,0 L10,10", fill: "main", transform: "scale(9)" },
        { kind: "image", href: "http://x" },
        { kind: "circle", cx: 5, cy: 5, r: 1e9, fill: "main" },
        { kind: "rect", x: 0, y: 0, w: 10, h: 10, stroke: "#abcdef", width: 2 },
      ],
    });
    expect(d?.shapes).toHaveLength(2);
    expect(d?.shapes[0]).toEqual({ kind: "path", d: "M0,0 L10,10", fill: "main" });
    expect(d?.shapes[1]).toMatchObject({ kind: "rect", stroke: "#ABCDEF", width: 2 });
    expect(sanitizeDrawing({ w: 100, h: 100, shapes: [] })).toBeNull();
    expect(sanitizeDrawing({ w: 5, h: 100, shapes: [{ kind: "circle", cx: 1, cy: 1, r: 1, fill: "main" }] })).toBeNull();
    const big = sanitizeDrawing({ w: 100, h: 100, shapes: Array.from({ length: 500 }, () => ({ kind: "circle", cx: 1, cy: 1, r: 1, fill: "main" })) });
    expect(big?.shapes).toHaveLength(300);
  });
});

describe("ИИ-дизайнер: add_art на обложке", () => {
  const art = ART_EXAMPLES[0].spec;

  it("добавляет слой-рисунок по центру безопасной зоны с пропорциями рисунка", () => {
    const { state, errors } = applyCoverOps(cover(), [op("add_art", "back", { art, color: "#102A4A", accent: "#E7C98A" })], formats.a5);
    expect(errors).toEqual([]);
    const l = state.design.layers[0];
    expect(l).toMatchObject({ kind: "decor", motif: "art", color: "#102A4A", accent: "#E7C98A" });
    expect(l.kind === "decor" && l.art?.shapes.length).toBeGreaterThan(5);
    expect(l.x).toBeGreaterThan(0);
    expect(l.x + l.w).toBeLessThan(1);
  });

  it("слой переживает разбор из базы; рисунок виден через layerDrawing с цветами слоя", () => {
    const { state } = applyCoverOps(cover(), [op("add_art", "", { art, x: 0, y: 0.6, w: 1, h: 0.4, color: "#102A4A", accent: "#E7C98A" })], formats.a5);
    const again = parseCoverDesign(JSON.parse(JSON.stringify(state.design)))!;
    const layer = again.layers.at(-1)!;
    expect(layer).toMatchObject({ kind: "decor", motif: "art", y: 0.6 });
    const d = layer.kind === "decor" ? layerDrawing(layer) : null;
    expect(JSON.stringify(d)).toContain("#102A4A");
    expect(JSON.stringify(d)).toContain("#E7C98A");
    expect(JSON.stringify(d)).not.toContain('"main"');
  });

  it("слой motif art без рисунка отбрасывается; смена мотива убирает рисунок", () => {
    const base = cover().design;
    const bad = parseCoverDesign({ ...base, layers: [{ id: "a", kind: "decor", motif: "art", color: "#000000", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }] })!;
    expect(bad.layers).toHaveLength(0);
    const { state } = applyCoverOps(cover(), [op("add_art", "", { art: { w: 100, h: 100, items: [{ t: "circle", cx: 50, cy: 50, r: 30 }] }, id: "a1" })], formats.a5);
    const swapped = parseCoverDesign({ ...state.design, layers: state.design.layers.map((l) => (l.id === "a1" ? { ...l, motif: "heart" } : l)) })!;
    expect(swapped.layers.find((l) => l.id === "a1")).toMatchObject({ motif: "heart" });
    expect(swapped.layers.find((l) => l.id === "a1")).not.toHaveProperty("art");
  });

  it("ошибки описания рисунка возвращаются модели", () => {
    const r = applyCoverOps(cover(), [op("add_art", "", { art: { w: 100, h: 100, items: [{ t: "dragon" }] } }), op("add_art", "", { x: 0 }), op("set_emblem", "", { w: 100, h: 100, items: [] })], formats.a5);
    expect(r.errors.join("\n")).toMatch(/add_art: .*неизвестный элемент «dragon»/);
    expect(r.errors.join("\n")).toMatch(/add_art: значение — \{"art"/);
    expect(r.errors.join("\n")).toMatch(/set_emblem: это для страниц/);
  });

  it("критик: рисунок поверх названия — замечание, под названием — нет", () => {
    const over = (id: string) => ({ id, kind: "decor", motif: "art", color: "#000000", x: 0, y: 0, w: 1, h: 1, art: { w: 100, h: 100, shapes: [{ kind: "circle", cx: 50, cy: 50, r: 40, fill: "main" }] } });
    const c = cover();
    const title = c.design.layers.findIndex((l) => l.kind === "text" && l.bind === "title");
    expect(title).toBeGreaterThanOrEqual(0);
    const above = parseCoverDesign({ ...c.design, layers: [...c.design.layers, over("art1")] })! as CoverDesign;
    expect(critiqueCover({ ...c, design: above }).map((a) => a.code)).toContain("art-over-title:art1");
    const below = parseCoverDesign({ ...c.design, layers: [over("art1"), ...c.design.layers] })! as CoverDesign;
    expect(critiqueCover({ ...c, design: below }).map((a) => a.code)).not.toContain("art-over-title:art1");
  });
});

describe("ИИ-дизайнер: set_emblem на страницах", () => {
  const spec = { w: 200, h: 140, items: [{ t: "moon", cx: 150, cy: 36, r: 18, fill: "accent" }, { t: "mountains", y: 50, h: 90, peaks: 3, seed: 5 }] };

  it("кладёт рисунок в elements.emblem; он доходит до оформления, титула и начальных полос", () => {
    const { state, errors } = applyPagesOps({ interior: "classic", style: {} }, [op("set_emblem", "", spec)]);
    expect(errors).toEqual([]);
    expect(state.style.elements?.emblem?.shapes.length).toBeGreaterThan(2);
    const design = applyInteriorStyle(getInteriorDesign("classic"), state.style);
    expect(design.emblem).toEqual(state.style.elements!.emblem);
    const palette = design.palette;
    const opener = openerEmblemShapes(design.emblem, { w: 148, h: 210, flowTop: 70, k: 1, palette });
    expect(opener.length).toBeGreaterThan(2);
    // Рисунок над названием главы: целиком выше начала блока с названием и внутри полосы.
    for (const s of opener) if (s.kind === "circle") expect(s.cy + s.r).toBeLessThan(70);
    expect(titleEmblemShapes(design.emblem, "center", { w: 148, h: 210, palette }).length).toBeGreaterThan(2);
    expect(titleEmblemShapes(design.emblem, "stack", { w: 148, h: 210, palette })).toEqual([]);
    // Мало места над названием — рисунка нет.
    expect(openerEmblemShapes(design.emblem, { w: 148, h: 210, flowTop: 20, k: 1, palette })).toEqual([]);
  });

  it("повреждённый рисунок не принимается; unset убирает; смена стиля сбрасывает", () => {
    const bad = applyPagesOps({ interior: "classic", style: {} }, [op("set_emblem", "", { w: 100, h: 100, items: [{ t: "dragon" }] })]);
    expect(bad.errors.join("\n")).toMatch(/set_emblem: .*неизвестный элемент/);
    expect(bad.state.style.elements?.emblem).toBeUndefined();
    const withIt = applyPagesOps({ interior: "classic", style: {} }, [op("set_emblem", "", spec)]).state;
    expect(applyPagesOps(withIt, [op("unset", "elements.emblem")]).state.style.elements?.emblem).toBeUndefined();
    expect(applyPagesOps(withIt, [op("set_interior", "", "novel")]).state.style.elements?.emblem).toBeUndefined();
    // Из базы: чужие поля внутри рисунка отбрасываются.
    const parsed = parseInteriorStyle({ elements: { emblem: { w: 100, h: 100, shapes: [{ kind: "path", d: "M0,0 L5,5", fill: "main", transform: "scale(9)" }] } } });
    expect(parsed.elements?.emblem?.shapes[0]).toEqual({ kind: "path", d: "M0,0 L5,5", fill: "main" });
    // Эмблема повторяется на каждой главе: слишком тяжёлый рисунок в настройки не попадает.
    const d = `M0,0 ${"L1,1 ".repeat(3000)}`;
    expect(d.length).toBeGreaterThan(15_000);
    const heavy = { w: 100, h: 100, shapes: [{ kind: "path", d, fill: "main" }, { kind: "path", d, fill: "main" }] };
    expect(parseInteriorStyle({ elements: { emblem: heavy } }).elements?.emblem).toBeUndefined();
    expect(parseInteriorStyle({ elements: { emblem: { ...heavy, shapes: [heavy.shapes[0]] } } }).elements?.emblem).toBeDefined();
  });
});

describe("ИИ-дизайнер: промпты и выбор модели", () => {
  it("справочник рисунков и образцы — в системных промптах обложки и страниц", () => {
    const cover = coverSystemPrompt();
    expect(cover).toContain(ART_REFERENCE.slice(0, 80));
    expect(cover).toContain("add_art");
    expect(cover).toContain("Арт-дирекция");
    expect(cover).toContain(JSON.stringify(ART_EXAMPLES[0].spec));
    const pages = pagesSystemPrompt();
    expect(pages).toContain("set_emblem");
    expect(pages).toContain(ART_REFERENCE.slice(0, 80));
  });

  it("мелкие правки — Haiku, творческие просьбы и режимы — Sonnet", () => {
    expect(designTier("edit", "шрифт покрупнее")).toBe("fast");
    expect(designTier("edit", "сделай название золотым")).toBe("fast");
    expect(designTier("edit", "Нарисуй внизу горы с луной")).toBe("pro");
    expect(designTier("edit", "добавь казахский орнамент")).toBe("pro");
    expect(designTier("edit", "x".repeat(200))).toBe("pro");
    expect(designTier("review", "")).toBe("pro");
    // Придумать и варианты — вкус арт-директора: самая сильная модель.
    for (const m of ["create", "variants"] as const) expect(designTier(m, "")).toBe("max");
  });
});

describe("ИИ-дизайнер: образцы обложек — планка качества", () => {
  it("каждый образец применяется без замечаний и критик им доволен", () => {
    const texts = { title: "Там, где ты", subtitle: "Книга о нас", names: "Элия & Олжас" };
    for (const e of COVER_EXAMPLES) {
      const start = { template: "linen", design: designFromTemplate(coverMeta(getCoverTemplate("linen")), texts, formats.a5) };
      const r = applyCoverOps(start, e.ops, formats.a5);
      expect(r.errors, e.id).toEqual([]);
      expect(critiqueCover(r.state, texts), e.id).toEqual([]);
      // Образец — настоящая работа: свой рисунок есть, шаблонный орнамент скрыт.
      expect(r.state.design.layers.some((l) => l.kind === "decor" && l.motif === "art"), e.id).toBe(true);
      expect(r.state.design.layers.find((l) => l.id === "ornament")?.hidden, e.id).toBe(true);
    }
  });

  it("промпт обложки содержит образцы и доктрину арт-дирекции", () => {
    const p = coverSystemPrompt();
    for (const e of COVER_EXAMPLES) expect(p).toContain(`«${e.id}»`);
    expect(p).toContain("Арт-дирекция");
  });
});

describe("бесплатный лимит ИИ-дизайнера из настройки", () => {
  it("целое от 0 до 100; всё остальное — по умолчанию", () => {
    expect(parseFreeLimit("12")).toBe(12);
    expect(parseFreeLimit("0")).toBe(0);
    expect(parseFreeLimit("100")).toBe(100);
    for (const bad of ["", null, undefined, "101", "-1", "2,5", "много", "1e2"]) expect(parseFreeLimit(bad as string)).toBe(DESIGN_AI_FREE_LIMIT);
  });
});
