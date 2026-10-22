import { describe, expect, it } from "vitest";
import { applyCoverOps, applyPagesOps, designAiDay, DESIGN_AI_MODEL, MAX_ATTEMPTS, pagesSystemPrompt, coverSystemPrompt, quotaOf, runDesignAi, type Ask, type DesignOp } from "@/lib/book/design-ai";
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

describe("лимит по суткам Алматы", () => {
  it("сутки начинаются в полночь UTC+5", () => {
    const { start, reset } = designAiDay(new Date("2026-10-22T18:30:00Z")); // 23:30 в Алматы
    expect(start.toISOString()).toBe("2026-10-21T19:00:00.000Z");
    expect(reset.toISOString()).toBe("2026-10-22T19:00:00.000Z");
    expect(designAiDay(new Date("2026-10-22T19:05:00Z")).start.toISOString()).toBe("2026-10-22T19:00:00.000Z");
  });

  it("остаток не уходит в минус", () => {
    expect(quotaOf(7, new Date("2026-10-22T10:00:00Z"))).toMatchObject({ limit: 5, used: 5, remaining: 0 });
  });
});
