import { describe, expect, it } from "vitest";
import { applyCoverOps, applyPagesOps, DESIGN_AI_FREE_LIMIT, DESIGN_AI_MODEL, MAX_ATTEMPTS, pagesSystemPrompt, coverSystemPrompt, quotaOf, runDesignAi, type Ask, type DesignOp } from "@/lib/book/design-ai";
import { designFromTemplate } from "@/lib/book/cover-design";
import { coverMeta } from "@/lib/book/covers/meta";
import { getCoverTemplate } from "@/lib/book/covers";
import { formats } from "@/lib/book/formats";

const op = (o: DesignOp["op"], path: string, value: unknown = ""): DesignOp => ({ op: o, path, value: value === "" ? "" : JSON.stringify(value) });
const cover = () => ({ template: "linen", design: designFromTemplate(coverMeta(getCoverTemplate("linen")), { title: "Там, где ты", subtitle: "", names: "Элия & Олжас" }, formats.a5) });
const book = { title: "Там, где ты", kind: "gift", language: "ru" as const, format: formats.a5, ui: "ru" as const };

describe("ИИ-дизайнер: операции над страницами", () => {
  it("меняет шрифт, кегль, цвет и элемент; остальное не трогает", () => {
    const { state, errors } = applyPagesOps({ interior: "classic", style: { colors: { paper: "#FBF5E9" } } }, [
      op("set", "fonts.body", { font: "literata" }),
      op("set", "body.size", 11.5),
      op("set", "colors.accent", "#7A1F2B"),
      op("set", "elements.dropCap", "drop"),
    ]);
    expect(errors).toEqual([]);
    expect(state.style).toEqual({ fonts: { body: { font: "literata" } }, body: { size: 11.5 }, colors: { paper: "#FBF5E9", accent: "#7A1F2B" }, elements: { dropCap: "drop" } });
  });

  it("смена стиля сбрасывает свои настройки, кроме глав", () => {
    const { state } = applyPagesOps({ interior: "classic", style: { body: { size: 12 }, chapters: { intro: { number: "roman" } } } }, [op("set_interior", "", "novel")]);
    expect(state).toEqual({ interior: "novel", style: { chapters: { intro: { number: "roman" } } } });
  });

  it("недопустимое — замечание: неизвестный путь, шрифт, вне диапазона, нечитаемый цвет", () => {
    const { state, errors } = applyPagesOps({ interior: "classic", style: {} }, [op("set", "page.margin", 3), op("set", "fonts.body", { font: "comic" }), op("set", "body.size", 40), op("set", "colors.ink", "#F0F0F0"), op("set_interior", "", "nope")]);
    expect(state.style.body?.size).toBe(16);
    expect(errors.join("\n")).toMatch(/page\.margin.*неизвестный путь/);
    expect(errors.join("\n")).toMatch(/fonts\.body.*не применено/);
    expect(errors.join("\n")).toMatch(/body\.size: 40 вне допустимого — поставлено 16/);
    expect(errors.join("\n")).toMatch(/плохо читается/);
    expect(errors.join("\n")).toMatch(/нет стиля «nope»/);
  });

  it("значение-строка без кавычек принимается, мусор — нет", () => {
    const { state, errors } = applyPagesOps({ interior: "classic", style: {} }, [{ op: "set", path: "elements.divider", value: "asterism" }, { op: "set", path: "body.align", value: "{влево" }]);
    expect(state.style.elements?.divider).toBe("asterism");
    expect(errors).toHaveLength(1);
  });
});

describe("ИИ-дизайнер: операции над обложкой", () => {
  it("фон, свойства слоя, новый слой, порядок и удаление", () => {
    const s = cover();
    const { state, errors } = applyCoverOps(s, [
      op("set", "background", { kind: "color", color: "#1D2A44" }),
      op("set", "layers.title.style.color", "#D8B46A"),
      op("set", "layers.title.style.size", 0.1),
      op("add_layer", "", { id: "frame1", kind: "shape", shape: "double", x: 0.06, y: 0.05, w: 0.88, h: 0.9, stroke: "#D8B46A", strokeWidth: 0.004 }),
      op("move_layer", "frame1", "back"),
      op("remove_layer", "ornament"),
    ], formats.a5);
    expect(errors).toEqual([]);
    expect(state.design.background).toEqual({ kind: "color", color: "#1D2A44" });
    const title = state.design.layers.find((l) => l.id === "title");
    expect(title?.kind === "text" && title.style).toMatchObject({ color: "#D8B46A", size: 0.1 });
    expect(state.design.layers[0].id).toBe("frame1");
    expect(state.design.layers.some((l) => l.id === "ornament")).toBe(false);
  });

  it("нельзя менять id и вид слоя, нет слоя — замечание; текст за безопасной зоной — замечание", () => {
    const { errors } = applyCoverOps(cover(), [op("set", "layers.title.kind", "image"), op("set", "layers.ghost.x", 0.1), op("set", "layers.title.x", -0.1)], formats.a5);
    const all = errors.join("\n");
    expect(all).toMatch(/id и вид слоя менять нельзя/);
    expect(all).toMatch(/нет слоя «ghost»/);
    expect(all).toMatch(/безопасную зону/);
  });

  it("неизвестный шаблон и мотив — замечания", () => {
    const { state, errors } = applyCoverOps(cover(), [op("set_template", "", "unicorn"), op("add_layer", "", { kind: "decor", motif: "dragon", color: "#000000", x: 0.4, y: 0.4, w: 0.2, h: 0.1 })], formats.a5);
    expect(state.template).toBe("linen");
    expect(errors.join("\n")).toMatch(/нет шаблона/);
    expect(errors.join("\n")).toMatch(/отклонён/);
  });
});

describe("ИИ-дизайнер: harness", () => {
  it("модель — Claude Haiku 5.5; справочники содержат все шрифты и мотивы", () => {
    expect(DESIGN_AI_MODEL).toBe("claude-haiku-5-5");
    expect(pagesSystemPrompt()).toContain("literata");
    expect(coverSystemPrompt()).toContain("laurel");
  });

  it("с первого раза — один запрос; system целиком кэшируется", async () => {
    const calls: Parameters<Ask>[0][] = [];
    const ask: Ask = async (r) => {
      calls.push(r);
      return { text: JSON.stringify({ reply: "Готово", ops: [op("set", "body.size", 11)] }), usage: { inputTokens: 100, outputTokens: 20 } };
    };
    const res = await runDesignAi(ask, { target: "pages", request: "покрупнее", state: { interior: "classic", style: {} }, book });
    expect(res).toMatchObject({ reply: "Готово", changed: true, attempts: 1, errors: [] });
    expect(res.state.style).toEqual({ body: { size: 11 } });
    expect(calls).toHaveLength(1);
    expect(calls[0].cachePrefix).toBe(calls[0].system);
    expect(calls[0].user).toContain("<request>\nпокрупнее\n</request>");
  });

  it("замечания уходят модели, исправленный ответ применяется к исходному состоянию", async () => {
    const answers = [
      { reply: "1", ops: [op("set", "fonts.body", { font: "comic" }), op("set", "body.size", 11)] },
      { reply: "2", ops: [op("set", "fonts.body", { font: "spectral" }), op("set", "body.size", 11)] },
    ];
    const users: string[] = [];
    const ask: Ask = async (r) => {
      users.push(r.user);
      return { text: JSON.stringify(answers.shift()) };
    };
    const res = await runDesignAi(ask, { target: "pages", request: "другой шрифт", state: { interior: "classic", style: {} }, book });
    expect(res.attempts).toBe(2);
    expect(users[1]).toMatch(/fonts\.body.*не применено/);
    expect(res.state.style).toEqual({ fonts: { body: { font: "spectral" } }, body: { size: 11 } });
    expect(res.errors).toEqual([]);
  });

  it("не больше MAX_ATTEMPTS запросов; мусор вместо JSON — без изменений", async () => {
    let n = 0;
    const ask: Ask = async () => {
      n++;
      return { text: "не знаю" };
    };
    const res = await runDesignAi(ask, { target: "cover", request: "x", state: cover(), book });
    expect(n).toBe(MAX_ATTEMPTS);
    expect(res.changed).toBe(false);
  });
});

describe("бесплатный лимит", () => {
  it("5 запросов на клиента за всё время; остаток не уходит в минус", () => {
    expect(DESIGN_AI_FREE_LIMIT).toBe(5);
    expect(quotaOf(2)).toEqual({ limit: 5, used: 2, remaining: 3 });
    expect(quotaOf(7)).toEqual({ limit: 5, used: 5, remaining: 0 });
  });
});

// ─── умнее: плейбук, критик, макеты, варианты, оценка, память ─────────────

import { coverLayouts, DECOR_IDS, type CoverDesign } from "@/lib/book/cover-design";
import { fontFaces } from "@/lib/book/fonts";
import { isInteriorId } from "@/lib/book/interiors";
import { isKnownCover } from "@/lib/book/covers";
import { contrastRatio, critiqueCover, MOODS, newAdvice, runDesignReview, runDesignVariants, THEME_MOODS, userPrompt, VARIANTS } from "@/lib/book/design-ai";

describe("плейбук", () => {
  it("все шрифты, стили, макеты, шаблоны и мотивы — из каталогов; палитры читаемы", () => {
    const layouts = new Set(coverLayouts.map((l) => l.id));
    for (const m of MOODS) {
      for (const [d, b] of m.fonts) {
        expect(fontFaces[d], `${m.id}: ${d}`).toBeDefined();
        expect(fontFaces[b]?.body, `${m.id}: ${b} — шрифт для текста`).toBe(true);
      }
      for (const i of m.interiors) expect(isInteriorId(i), `${m.id}: ${i}`).toBe(true);
      for (const l of m.layouts) expect(layouts.has(l), `${m.id}: ${l}`).toBe(true);
      for (const t of m.templates) expect(isKnownCover(t), `${m.id}: ${t}`).toBe(true);
      for (const d of m.decor) expect(DECOR_IDS as readonly string[], `${m.id}: ${d}`).toContain(d);
      expect(contrastRatio(m.pages.ink, m.pages.paper), `${m.id}: текст`).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(m.cover.title, m.cover.background), `${m.id}: название`).toBeGreaterThanOrEqual(4.5);
    }
    for (const ids of Object.values(THEME_MOODS)) for (const id of ids) expect(MOODS.some((m) => m.id === id)).toBe(true);
  });

  it("плейбук и макеты — в системном промпте", () => {
    expect(pagesSystemPrompt()).toContain("Настроения");
    expect(coverSystemPrompt()).toContain("romance-arch");
    expect(coverSystemPrompt()).toContain("apply_layout");
  });
});

describe("критик", () => {
  const withTitle = (color: string, bg: string): CoverDesign => {
    const d = cover().design;
    return { ...d, background: { kind: "color", color: bg }, layers: d.layers.map((l) => (l.kind === "text" && l.bind === "title" ? { ...l, style: { ...l.style, color } } : l)) };
  };
  it("нечитаемое название — замечание; читаемое — нет", () => {
    expect(critiqueCover({ template: "linen", design: withTitle("#EEEEEE", "#FFFFFF") }).map((a) => a.code)).toContain("contrast:title");
    expect(critiqueCover({ template: "linen", design: withTitle("#1D2A44", "#FFFFFF") }).some((a) => a.code.startsWith("contrast:title"))).toBe(false);
  });

  it("старые недочёты не считаются новыми", () => {
    const before = critiqueCover({ template: "linen", design: withTitle("#EEEEEE", "#FFFFFF") });
    const after = critiqueCover({ template: "linen", design: withTitle("#E0E0E0", "#FFFFFF") });
    expect(newAdvice(before, after)).toEqual([]);
  });
});

describe("операции: готовый макет и адресация", () => {
  it("apply_layout собирает обложку по макету; layers.title находит название в любом макете; @decor — все украшения", () => {
    const texts = { title: "Там, где ты", subtitle: "", names: "Элия & Олжас" };
    const { state, errors } = applyCoverOps(cover(), [op("apply_layout", "", "premium-deco"), op("set", "layers.title.style.color", "#D9BC7C"), op("set", "layers.@decor.color", "#B8975A")], formats.a5, { texts, photos: [] });
    expect(errors).toEqual([]);
    const title = state.design.layers.find((l) => l.kind === "text" && l.bind === "title");
    expect(title?.kind === "text" && title.style.color).toBe("#D9BC7C");
    const decor = state.design.layers.filter((l) => l.kind === "decor");
    expect(decor.length).toBeGreaterThan(1);
    expect(decor.every((l) => l.kind === "decor" && l.color === "#B8975A")).toBe(true);
  });

  it("неизвестный макет и группа — замечания", () => {
    const { errors } = applyCoverOps(cover(), [op("apply_layout", "", "nope"), op("set", "layers.@ghost.color", "#000000")], formats.a5);
    expect(errors.join("\n")).toMatch(/нет макета/);
    expect(errors.join("\n")).toMatch(/группа/);
  });
});

describe("harness: варианты, оценка, память", () => {
  const answer = (o: unknown): Ask => async () => ({ text: JSON.stringify(o) });

  it("три разных варианта: каждый от текущего оформления, пустые и повторы отброшены после исправления", async () => {
    const asks: string[] = [];
    const first = { reply: "r", variants: [{ name: "А", idea: "", ops: [op("set_interior", "", "novel")] }, { name: "Б", idea: "", ops: [op("set_interior", "", "novel")] }, { name: "В", idea: "", ops: [] }] };
    const second = { reply: "Три настроения", variants: [{ name: "Роман", idea: "", ops: [op("set_interior", "", "novel")] }, { name: "Воздух", idea: "", ops: [op("set_interior", "", "airy")] }, { name: "Ретро", idea: "", ops: [op("set_interior", "", "antique")] }] };
    const queue = [first, second];
    const ask: Ask = async (r) => {
      asks.push(r.user);
      return { text: JSON.stringify(queue.shift()) };
    };
    const res = await runDesignVariants(ask, { target: "pages", request: "три варианта", state: { interior: "classic", style: {} }, book });
    expect(asks).toHaveLength(2);
    expect(asks[0]).toContain("Режим: варианты");
    expect(asks[1]).toMatch(/повторяет другой вариант/);
    expect(asks[1]).toMatch(/ничего не меняет/);
    expect(res.variants.map((v) => v.state.interior)).toEqual(["novel", "airy", "antique"]);
    expect(res.variants).toHaveLength(VARIANTS);
  });

  it("оценка: балл в пределах 1–10, совет с операциями — с готовым оформлением, совет словами — без", async () => {
    const res = await runDesignReview(
      answer({ score: 14, summary: "Хорошо", strengths: ["Шрифт"], tips: [{ title: "Крупнее текст", why: "Легче читать", ops: [op("set", "body.size", 11.5)] }, { title: "Добавьте фото", why: "Живее", ops: [] }] }),
      { target: "pages", request: "", state: { interior: "classic", style: {} }, book },
    );
    expect(res.score).toBe(10);
    expect(res.tips[0].state?.style).toEqual({ body: { size: 11.5 } });
    expect(res.tips[1].state).toBeNull();
  });

  it("правка помнит прошлые просьбы и знает контекст книги", () => {
    const user = userPrompt("pages", { ...book, theme: "love", occasion: "Годовщина", palette: { colors: ["#C9A27E"], tone: "тёплые" }, other: "фон #1D2A44" }, {}, "ещё темнее", undefined, { mode: "edit", history: [{ prompt: "сделай бордовым", reply: "Сделал акцент бордовым" }] });
    expect(user).toContain("тема love");
    expect(user).toContain("Повод: Годовщина");
    expect(user).toContain("#C9A27E");
    expect(user).toContain("Обложка книги сейчас: фон #1D2A44");
    expect(user).toContain("«сделай бордовым» → Сделал акцент бордовым");
  });

  it("новый недочёт после правки — повод исправить; старый — нет", async () => {
    // Был нечитаемый акцент — правка шрифта не должна заставлять его чинить; новая нечитаемость подписей — должна.
    const users: string[] = [];
    const answers = [{ reply: "1", ops: [op("set", "colors.muted", "#F2EFEA")] }, { reply: "2", ops: [op("set", "colors.muted", "#6B6158")] }];
    const ask: Ask = async (r) => {
      users.push(r.user);
      return { text: JSON.stringify(answers.shift()) };
    };
    const res = await runDesignAi(ask, { target: "pages", request: "подписи светлее", state: { interior: "classic", style: {} }, book });
    expect(users).toHaveLength(2);
    expect(users[1]).toMatch(/подписи .* почти не видны/);
    expect(res.state.style.colors?.muted).toBe("#6B6158");
  });
});
