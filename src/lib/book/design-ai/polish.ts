/**
 * Осмотр глазами: после того как дизайнер собрал оформление, оно рисуется картинкой (та же вёрстка, что уйдёт в печать:
 * обложка или первые страницы книги), и модель смотрит на неё как арт-директор: «детский» вид, лишние цвета, слабая
 * иерархия, потерянное название, кривой рисунок, мелкий или тесный набор. Находит недостатки и присылает минимальные
 * операции, которые их исправляют. Один запрос на все варианты сразу (картинки по порядку). Исправление принимается,
 * только если применилось без замечаний; иначе остаётся прежнее.
 */
import { critiqueCover, critiquePages, newAdvice } from "./critic";
import { applyCoverOps, applyPagesOps, changed, DESIGN_OPS, MAX_OPS, type CoverLayoutContext, type CoverState, type DesignOp, type DesignTarget, type PagesState } from "./ops";
import { systemPrompt, type DesignBookContext } from "./prompts";

/** Картинка к запросу: mime и base64. */
export interface PreviewImage {
  mime: string;
  data: string;
}

const opsSchema = {
  type: "array",
  items: {
    type: "object",
    properties: { op: { type: "string", enum: [...DESIGN_OPS] }, path: { type: "string" }, value: { type: "string" } },
    required: ["op", "path", "value"],
    additionalProperties: false,
  },
} as const;

export const polishSchema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          verdict: { type: "string", enum: ["ok", "fix"], description: "ok — хорошо, править нечего; fix — есть недостатки, ops их исправляют" },
          defects: { type: "array", items: { type: "string" }, description: "Что не так, по-русски, коротко" },
          ops: opsSchema,
        },
        required: ["verdict", "defects", "ops"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

type State = CoverState | PagesState;

/** Просьба к осмотру: как смотреть и что вернуть. */
export function polishPrompt(target: DesignTarget, book: DesignBookContext, request: string, states: State[]): string {
  const many = states.length > 1;
  const what = target === "cover" ? "готовой обложки" : "первых страниц книги (титул, выходные данные, оглавление, начальные полосы глав, текст — листом из мелких картинок)";
  const look =
    target === "cover"
      ? "«детский» вид (много цветов, толстые линии, мультяшные картинки), цветов больше трёх, слабая иерархия надписей, название теряется или налезает на рисунок, рисунок кривой, пустой или слишком большой, всё слеплено в кучу, лишние детали, плохие поля и пропорции"
      : "«детский» или кричащий вид (яркие цвета, игривые шрифты в строгой книге), тесный или мелкий основной текст, плохой контраст, слабая иерархия заголовков глав, слишком много украшений, эмблема слишком крупная или лезет на название, нет ритма между титулом, главами и текстом";
  return [
    `Режим: осмотр — перед тобой ${many ? `${states.length} картинки ${what} по порядку (вариант 1, 2, 3…)` : `картинка ${what}`} книги «${book.title}». Посмотри глазами арт-директора издательства и честно найди недостатки: ${look}.`,
    `Если обложка хороша — verdict "ok" и пустые ops. Если нет — verdict "fix", в defects 1–3 конкретных недостатка и в ops минимальные операции, которые исправляют именно их (убрать лишнее, уменьшить, перекрасить, сдвинуть, переписать рисунок); не пересобирай всё. Операции применяются к оформлению этого варианта, его описание ниже. Верни ровно ${states.length} ${many ? "элементов" : "элемент"} в items, по порядку картинок. Не придирайся к вкусовому: правь только то, что ясно делает обложку слабее.`,
    request ? `Исходная просьба клиента: «${request}».` : "",
    ...states.map((s, i) => `Оформление ${many ? `варианта ${i + 1}` : target === "cover" ? "обложки" : "страниц"}:\n${JSON.stringify(s)}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface PolishAsk {
  (req: { system: string; user: string; effort: "low" | "medium" | "high"; schema: Record<string, unknown>; cachePrefix: string; images: PreviewImage[] }): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number } }>;
}

export interface Polished<S extends State = State> {
  state: S;
  /** Что нашёл осмотр (пусто — обложка хороша). */
  defects: string[];
  /** Исправление применено. */
  fixed: boolean;
}

/**
 * Осмотр кандидатов: images — по одной картинке на кандидата. Возвращает для каждого исправленное оформление (или его же).
 * Сбой модели или разбора — кандидаты остаются как были: осмотр лишь улучшает, ничего не ломает.
 */
export async function polishDesigns<S extends State>(
  ask: PolishAsk,
  ctx: { target: DesignTarget; book: DesignBookContext; request: string; layout?: CoverLayoutContext },
  candidates: S[],
  images: PreviewImage[],
): Promise<{ results: Polished<S>[]; usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } }> {
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const same: Polished<S>[] = candidates.map((state) => ({ state, defects: [], fixed: false }));
  const texts = ctx.layout?.texts ?? ctx.book.texts;
  // Операции и критик — по виду оформления.
  const apply = (state: S, ops: DesignOp[]): { state: S; errors: string[] } => (ctx.target === "cover" ? (applyCoverOps(state as CoverState, ops, ctx.book.format, ctx.layout) as { state: S; errors: string[] }) : (applyPagesOps(state as PagesState, ops) as { state: S; errors: string[] }));
  const critique = (state: S) => (ctx.target === "cover" ? critiqueCover(state as CoverState, texts) : critiquePages(state as PagesState));
  try {
    const system = systemPrompt(ctx.target);
    const res = await ask({ system, user: polishPrompt(ctx.target, ctx.book, ctx.request, candidates), effort: "medium", schema: polishSchema as unknown as Record<string, unknown>, cachePrefix: system, images });
    usage.inputTokens = res.usage?.inputTokens ?? 0;
    usage.outputTokens = res.usage?.outputTokens ?? 0;
    usage.cacheReadTokens = res.usage?.cacheReadTokens ?? 0;
    usage.cacheWriteTokens = res.usage?.cacheWriteTokens ?? 0;
    let raw: unknown;
    try {
      raw = JSON.parse(res.text);
    } catch {
      return { results: same, usage };
    }
    const items = isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
    const results = candidates.map((state, i): Polished<S> => {
      const it = items[i];
      if (!isObj(it)) return { state, defects: [], fixed: false };
      const defects = (Array.isArray(it.defects) ? it.defects : []).filter((d): d is string => typeof d === "string").slice(0, 3);
      const ops: DesignOp[] = (Array.isArray(it.ops) ? it.ops : [])
        .filter((x): x is DesignOp => isObj(x) && (DESIGN_OPS as readonly string[]).includes(String(x.op)))
        .map((x) => ({ op: x.op, path: String(x.path ?? ""), value: typeof x.value === "string" ? x.value : JSON.stringify(x.value ?? "") }))
        .slice(0, MAX_OPS);
      if (it.verdict !== "fix" || !ops.length) return { state, defects, fixed: false };
      const applied = apply(state, ops);
      // Исправление должно применяться чисто и не вносить новых недочётов критика — иначе оставляем как было.
      const worse = newAdvice(critique(state), critique(applied.state));
      if (applied.errors.length || worse.length || !changed(applied.state, state)) return { state, defects, fixed: false };
      return { state: applied.state, defects, fixed: true };
    });
    return { results, usage };
  } catch (err) {
    console.error("[design-ai] polish", err instanceof Error ? err.message : err);
    return { results: same, usage };
  }
}
